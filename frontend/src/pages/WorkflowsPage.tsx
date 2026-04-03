import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getDataset, listProjectDatasets } from "../api/datasets";
import {
  createWorkflow,
  deleteWorkflow,
  listProjectWorkflows,
  runWorkflow,
  updateWorkflow,
} from "../api/workflows";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { WorkflowBuilder } from "../components/workflows/WorkflowBuilder";
import { useProjectStore } from "../stores/projectStore";
import type { DatasetDetail, DatasetSummary } from "../types/dataset";
import type { Workflow, WorkflowExecutionLogEntry, WorkflowStepDefinition } from "../types/workflow";


function nextWorkflowName(workflows: Workflow[]) {
  return `Workflow ${workflows.length + 1}`;
}

export function WorkflowsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const workflowId = searchParams.get("workflowId") ?? "";
  const { projects, fetchProjects } = useProjectStore();
  const activeProject = useMemo(() => projects.find((project) => project.id === projectId) ?? null, [projectId, projects]);

  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetDetails, setDatasetDetails] = useState<Record<string, DatasetDetail>>({});
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runResult, setRunResult] = useState<WorkflowExecutionLogEntry[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedWorkflow = workflows.find((workflow) => workflow.id === workflowId) ?? workflows[0] ?? null;

  useEffect(() => {
    if (projects.length === 0) {
      setIsLoadingProjects(true);
      void fetchProjects().finally(() => setIsLoadingProjects(false));
    }
  }, [fetchProjects, projects.length]);

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("projectId", projects[0].id);
      setSearchParams(nextParams, { replace: true });
    }
  }, [projectId, projects, searchParams, setSearchParams]);

  useEffect(() => {
    if (!projectId) {
      setDatasets([]);
      setDatasetDetails({});
      setWorkflows([]);
      return;
    }

    let cancelled = false;
    setIsLoadingWorkspace(true);
    setPageError(null);

    async function loadWorkspace() {
      try {
        const [datasetResponse, workflowResponse] = await Promise.all([
          listProjectDatasets(projectId),
          listProjectWorkflows(projectId),
        ]);
        if (cancelled) {
          return;
        }

        setDatasets(datasetResponse.datasets);
        setWorkflows(workflowResponse.items);

        const detailEntries = await Promise.all(datasetResponse.datasets.map(async (dataset) => [dataset.id, await getDataset(dataset.id)] as const));
        if (cancelled) {
          return;
        }

        const nextDetails: Record<string, DatasetDetail> = {};
        for (const [datasetId, detail] of detailEntries) {
          nextDetails[datasetId] = detail;
        }
        setDatasetDetails(nextDetails);
        setIsLoadingWorkspace(false);

        const currentWorkflowExists = workflowId && workflowResponse.items.some((workflow) => workflow.id === workflowId);
        if (!currentWorkflowExists && workflowResponse.items[0]) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("projectId", projectId);
          nextParams.set("workflowId", workflowResponse.items[0].id);
          setSearchParams(nextParams, { replace: true });
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Unable to load workflows workspace");
          setIsLoadingWorkspace(false);
        }
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [projectId, searchParams, setSearchParams, workflowId]);

  async function handleCreateWorkflow() {
    if (!projectId) {
      return;
    }
    setIsSaving(true);
    setPageError(null);
    try {
      const workflow = await createWorkflow(projectId, { name: nextWorkflowName(workflows), steps: [] });
      setWorkflows((current) => [workflow, ...current]);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("projectId", projectId);
      nextParams.set("workflowId", workflow.id);
      setSearchParams(nextParams, { replace: true });
      setRunResult([]);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to create workflow");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveWorkflow(payload: { workflowId: string; name: string; steps: WorkflowStepDefinition[] }) {
    setIsSaving(true);
    setPageError(null);
    try {
      const updated = await updateWorkflow(payload.workflowId, { name: payload.name, steps: payload.steps });
      setWorkflows((current) => current.map((workflow) => workflow.id === updated.id ? updated : workflow));
      setRunResult([]);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to save workflow");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteWorkflow(targetWorkflowId: string) {
    setIsDeleting(true);
    setPageError(null);
    try {
      await deleteWorkflow(targetWorkflowId);
      const nextWorkflows = workflows.filter((workflow) => workflow.id !== targetWorkflowId);
      setWorkflows(nextWorkflows);
      setRunResult([]);

      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("projectId", projectId);
      if (nextWorkflows[0]) {
        nextParams.set("workflowId", nextWorkflows[0].id);
      } else {
        nextParams.delete("workflowId");
      }
      setSearchParams(nextParams, { replace: true });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to delete workflow");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRunWorkflow(targetWorkflowId: string) {
    setIsRunning(true);
    setPageError(null);
    try {
      const result = await runWorkflow(targetWorkflowId);
      setRunResult(result.step_results);
      setWorkflows((current) => current.map((workflow) => workflow.id === result.workflow.id ? result.workflow : workflow));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to run workflow");
    } finally {
      setIsRunning(false);
    }
  }

  if (isLoadingProjects || isLoadingWorkspace) {
    return (
      <section className="panel-surface p-6">
        <LoadingSpinner label="Loading workflows workspace" />
      </section>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold text-ink-900">Workflows</h1>
        <select value={projectId} onChange={(event) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("projectId", event.target.value);
          nextParams.delete("workflowId");
          setSearchParams(nextParams, { replace: true });
        }} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
          <option value="">Project</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>

      {pageError ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{pageError}</span>
        </div>
      ) : null}

      <WorkflowBuilder
        projectName={activeProject?.name ?? null}
        datasets={datasets}
        datasetDetails={datasetDetails}
        workflows={workflows}
        selectedWorkflow={selectedWorkflow}
        runResult={runResult}
        workflowError={pageError}
        isSaving={isSaving}
        isRunning={isRunning}
        isDeleting={isDeleting}
        onSelectWorkflow={(targetWorkflowId) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("projectId", projectId);
          nextParams.set("workflowId", targetWorkflowId);
          setSearchParams(nextParams, { replace: true });
          setRunResult([]);
        }}
        onCreateWorkflow={handleCreateWorkflow}
        onSaveWorkflow={handleSaveWorkflow}
        onDeleteWorkflow={handleDeleteWorkflow}
        onRunWorkflow={handleRunWorkflow}
      />
    </div>
  );
}