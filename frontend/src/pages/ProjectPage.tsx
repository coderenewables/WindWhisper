import { ArrowLeft, CheckCircle2, FileUp, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { deleteDataset, getDatasetHistory, listProjectDatasets, undoDatasetChange } from "../api/datasets";
import { HistoryPanel } from "../components/common/HistoryPanel";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ConfirmDeleteDialog } from "../components/common/ConfirmDeleteDialog";
import type { DatasetImportResponse, DatasetSummary } from "../types/dataset";
import type { ChangeLogEntry } from "../types/history";
import { useProjectStore } from "../stores/projectStore";

export function ProjectPage() {
  const params = useParams();
  const location = useLocation();
  const { activeProject, projects, error, fetchProject, deleteProject: storeDeleteProject } = useProjectStore();
  const importedDataset = (location.state as { importedDataset?: DatasetImportResponse } | null)?.importedDataset;
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [historyDatasetId, setHistoryDatasetId] = useState("");
  const [historyChanges, setHistoryChanges] = useState<ChangeLogEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isUndoingHistory, setIsUndoingHistory] = useState(false);

  // Delete states
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [isProjectDeleteOpen, setIsProjectDeleteOpen] = useState(false);
  const [isDeletingDataset, setIsDeletingDataset] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState<DatasetSummary | null>(null);

  const navigate = useNavigate();

  const project = activeProject?.id === params.id ? activeProject : projects.find((item) => item.id === params.id) ?? null;

  async function handleDeleteProject() {
    if (!project) return;
    setIsDeletingProject(true);
    try {
      await storeDeleteProject(project.id);
      navigate("/");
    } finally {
      setIsDeletingProject(false);
      setIsProjectDeleteOpen(false);
    }
  }

  async function handleDeleteDataset() {
    if (!datasetToDelete || !project) return;
    setIsDeletingDataset(true);
    try {
      await deleteDataset(datasetToDelete.id);
      await refreshDatasets(project.id);
    } finally {
      setIsDeletingDataset(false);
      setDatasetToDelete(null);
    }
  }

  async function refreshDatasets(projectId: string) {
    setIsLoadingDatasets(true);
    try {
      const response = await listProjectDatasets(projectId);
      setDatasets(response.datasets);
      setHistoryDatasetId((current) => {
        if (response.datasets.some((dataset) => dataset.id === current)) {
          return current;
        }
        return response.datasets[0]?.id ?? "";
      });
    } finally {
      setIsLoadingDatasets(false);
    }
  }

  async function refreshHistory(datasetId: string) {
    setIsLoadingHistory(true);
    try {
      const response = await getDatasetHistory(datasetId);
      setHistoryChanges(response.changes);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  useEffect(() => {
    if (params.id) {
      void fetchProject(params.id);
    }
  }, [fetchProject, params.id]);

  useEffect(() => {
    if (!params.id) {
      return;
    }

    let cancelled = false;
    setIsLoadingDatasets(true);
    void listProjectDatasets(params.id)
      .then((response) => {
        if (!cancelled) {
          setDatasets(response.datasets);
          setHistoryDatasetId((current) => {
            if (response.datasets.some((dataset) => dataset.id === current)) {
              return current;
            }
            return response.datasets[0]?.id ?? "";
          });
          setIsLoadingDatasets(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDatasets([]);
          setIsLoadingDatasets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [importedDataset, params.id]);

  useEffect(() => {
    if (!historyDatasetId) {
      setHistoryChanges([]);
      return;
    }

    let cancelled = false;
    setIsLoadingHistory(true);
    void getDatasetHistory(historyDatasetId)
      .then((response) => {
        if (!cancelled) {
          setHistoryChanges(response.changes);
          setIsLoadingHistory(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryChanges([]);
          setIsLoadingHistory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [historyDatasetId]);

  async function handleUndoLatestChange() {
    if (!historyDatasetId || !params.id) {
      return;
    }

    setIsUndoingHistory(true);
    try {
      await undoDatasetChange(historyDatasetId);
      await Promise.all([refreshDatasets(params.id), refreshHistory(historyDatasetId)]);
    } finally {
      setIsUndoingHistory(false);
    }
  }

  if (!project && !error) {
    return (
      <section className="panel-surface p-6">
        <LoadingSpinner label="Loading project details" />
      </section>
    );
  }

  return (    <>
      <ConfirmDeleteDialog
        open={isProjectDeleteOpen}
        title="Delete Project"
        itemName={project?.name || "this project"}
        onClose={() => setIsProjectDeleteOpen(false)}
        onConfirm={handleDeleteProject}
        isDeleting={isDeletingProject}
      />

      <ConfirmDeleteDialog
        open={!!datasetToDelete}
        title="Delete Dataset"
        itemName={datasetToDelete?.name || "this dataset"}
        onClose={() => setDatasetToDelete(null)}
        onConfirm={handleDeleteDataset}
        isDeleting={isDeletingDataset}
      />
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/" className="text-xs text-ink-500 hover:text-ink-900"><ArrowLeft className="inline h-3 w-3" /> Dashboard</Link>
        <span className="text-ink-300">·</span>

        {importedDataset ? (
          <span className="flex items-center gap-1 text-xs text-teal-700">
            <CheckCircle2 className="h-3 w-3" />
            {importedDataset.name} imported ({importedDataset.column_count} ch, {importedDataset.row_count.toLocaleString()} rows)
          </span>
        ) : null}
      </div>

      {project ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm font-semibold text-ink-900">{project.name}</h1>
            {project.latitude != null && project.longitude != null ? (
              <span className="text-[11px] text-ink-400">{project.latitude.toFixed(3)}, {project.longitude.toFixed(3)}</span>
            ) : null}
            {project.elevation != null ? <span className="text-[11px] text-ink-400">{project.elevation.toFixed(1)}m</span> : null}
            <span className="text-[11px] text-ink-400">{project.dataset_count} datasets</span>
            <span className="text-[11px] text-ink-400">{new Date(project.created_at).toLocaleDateString()}</span>
            <Link to={`/import?projectId=${project.id}`} state={{ projectId: project.id }} className="rounded-lg bg-ember-500 px-3 py-1 text-xs font-medium text-white hover:bg-ember-400">
              <FileUp className="inline h-3 w-3" /> Import
            </Link>
            <button type="button" onClick={() => setIsProjectDeleteOpen(true)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
              <Trash2 className="inline h-3 w-3" /> Delete
            </button>
          </div>

          {/* Quick navigation links */}
          {project.dataset_count > 0 ? (
            <div className="flex flex-wrap gap-1">
              <Link to={`/time-series?projectId=${project.id}${datasets[0] ? `&datasetId=${datasets[0].id}` : ""}`} className="rounded-lg border border-ink-200 px-3 py-1 text-xs text-ink-600 hover:text-ink-900">
                Time-series
              </Link>
              <Link to={`/qc?projectId=${project.id}${datasets[0] ? `&datasetId=${datasets[0].id}` : ""}`} className="rounded-lg border border-ink-200 px-3 py-1 text-xs text-ink-600 hover:text-ink-900">
                QC
              </Link>
              <Link to={`/mcp?projectId=${project.id}${datasets[1] ? `&siteDatasetId=${datasets[0].id}&refDatasetId=${datasets[1].id}` : datasets[0] ? `&siteDatasetId=${datasets[0].id}&refDatasetId=${datasets[0].id}` : ""}`} className="rounded-lg border border-ink-200 px-3 py-1 text-xs text-ink-600 hover:text-ink-900">
                MCP
              </Link>
            </div>
          ) : null}

          {/* Datasets list */}
          {isLoadingDatasets ? (
            <LoadingSpinner label="Loading datasets" />
          ) : datasets.length > 0 ? (
            <div className="space-y-2">
              {datasets.map((dataset) => (
                <div key={dataset.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-100 px-3 py-2 text-xs">
                  <span className="font-medium text-ink-900">{dataset.name}</span>
                  <span className="text-ink-400">{dataset.row_count.toLocaleString()} rows · {dataset.column_count} ch</span>
                  <span className="text-ink-400">{dataset.time_step_seconds ? `${Math.round(dataset.time_step_seconds / 60)}min` : "var"}</span>
                  <Link to={`/time-series?projectId=${project.id}&datasetId=${dataset.id}`} className="rounded border border-ink-200 px-2 py-0.5 text-ink-600 hover:text-ink-900">Chart</Link>
                  <Link to={`/qc?projectId=${project.id}&datasetId=${dataset.id}`} className="rounded border border-ink-200 px-2 py-0.5 text-ink-600 hover:text-ink-900">QC</Link>
                  <Link to={`/mcp?projectId=${project.id}&siteDatasetId=${dataset.id}&refDatasetId=${datasets.find((item) => item.id !== dataset.id)?.id ?? dataset.id}`} className="rounded border border-ink-200 px-2 py-0.5 text-ink-600 hover:text-ink-900">MCP</Link>
                  <button type="button" onClick={() => setDatasetToDelete(dataset)} className="rounded border border-red-200 px-2 py-0.5 text-red-600 hover:bg-red-50" title="Delete"><Trash2 className="inline h-3 w-3" /></button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-400">No datasets imported yet.</p>
          )}

          {/* History */}
          {datasets.length > 0 ? (
            <div className="space-y-2">
              <select value={historyDatasetId} onChange={(event) => setHistoryDatasetId(event.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
              </select>
              <HistoryPanel changes={historyChanges} isLoading={isLoadingHistory} isUndoing={isUndoingHistory} onUndoLatest={handleUndoLatestChange} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error || "Project not found"}</div>
      )}
    </div>
    </>
  );
}