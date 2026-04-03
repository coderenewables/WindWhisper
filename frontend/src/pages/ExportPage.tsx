
import { Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAi } from "../ai/AiProvider";
import { listPowerCurves } from "../api/analysis";
import { getDataset, listProjectDatasets } from "../api/datasets";
import { listFlags } from "../api/qc";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ExportWizard } from "../components/export/ExportWizard";
import { ReportGenerator } from "../components/export/ReportGenerator";
import { useProjectStore } from "../stores/projectStore";
import type { PowerCurveLibraryItem } from "../types/analysis";
import type { DatasetDetail, DatasetSummary } from "../types/dataset";
import type { Flag } from "../types/qc";


export function ExportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const datasetId = searchParams.get("datasetId") ?? "";
  const { projects, fetchProjects } = useProjectStore();
  const activeProject = projects.find((project) => project.id === projectId) ?? null;

  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetDetail, setDatasetDetail] = useState<DatasetDetail | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [powerCurves, setPowerCurves] = useState<PowerCurveLibraryItem[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingDatasetDetail, setIsLoadingDatasetDetail] = useState(false);
  const [isLoadingFlags, setIsLoadingFlags] = useState(false);
  const [isLoadingPowerCurves, setIsLoadingPowerCurves] = useState(false);

  useEffect(() => {
    if (projects.length === 0) {
      void fetchProjects();
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
      setDatasetDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoadingDatasets(true);
    setPageError(null);

    void listProjectDatasets(projectId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setDatasets(response.datasets);
        setIsLoadingDatasets(false);

        if (!datasetId && response.datasets.length > 0) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("projectId", projectId);
          nextParams.set("datasetId", response.datasets[0].id);
          setSearchParams(nextParams, { replace: true });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Unable to load datasets");
          setIsLoadingDatasets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId, projectId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!datasetId) {
      setDatasetDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoadingDatasetDetail(true);
    setPageError(null);

    void getDataset(datasetId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setDatasetDetail(response);
        setIsLoadingDatasetDetail(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Unable to load dataset detail");
          setIsLoadingDatasetDetail(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) {
      setFlags([]);
      return;
    }

    let cancelled = false;
    setIsLoadingFlags(true);
    void listFlags(datasetId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setFlags(response);
        setIsLoadingFlags(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFlags([]);
          setIsLoadingFlags(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingPowerCurves(true);

    void listPowerCurves()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setPowerCurves(response.items);
        setIsLoadingPowerCurves(false);
      })
      .catch(() => {
        if (!cancelled) {
          setPowerCurves([]);
          setIsLoadingPowerCurves(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoadingDatasets || isLoadingDatasetDetail || isLoadingFlags || isLoadingPowerCurves) {
    return (
      <section className="panel-surface p-6">
        <LoadingSpinner label="Loading export workspace" />
      </section>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold text-ink-900">Export</h1>
        <select value={projectId} onChange={(event) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("projectId", event.target.value);
          nextParams.delete("datasetId");
          setSearchParams(nextParams, { replace: true });
        }} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
          <option value="">Project</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <select value={datasetId} onChange={(event) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("projectId", projectId);
          nextParams.set("datasetId", event.target.value);
          setSearchParams(nextParams, { replace: true });
        }} className="rounded-lg border-ink-200 bg-white py-1 text-xs" disabled={!projectId || datasets.length === 0}>
          <option value="">Dataset</option>
          {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
        </select>
        <AiNarrativeButton projectId={projectId} />
      </div>

      {pageError ? <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{pageError}</div> : null}
      {!datasetDetail && !pageError ? <p className="py-6 text-center text-xs text-ink-400">Select a project and dataset to export.</p> : null}

      {datasetDetail ? <ExportWizard datasetDetail={datasetDetail} flags={flags} /> : null}

      {datasetDetail && activeProject ? (
        <ReportGenerator
          projectId={activeProject.id}
          projectName={activeProject.name}
          datasetDetail={datasetDetail}
          flags={flags}
          powerCurves={powerCurves}
        />
      ) : null}

    </div>
  );
}

/* ---------- AI Narrative button (hidden when AI disabled) ---------- */

function AiNarrativeButton({ projectId }: { projectId: string }) {
  const { enabled, sendPrompt } = useAi();
  if (!enabled || !projectId) return null;

  return (
    <button
      type="button"
      onClick={() => void sendPrompt(projectId, "Generate a narrative report for this project. Include an executive summary, data overview, QC summary, analysis results, and recommendations. Use a technical due-diligence tone.")}
      className="ml-auto inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700 transition hover:bg-teal-100 dark:bg-teal-900/20 dark:text-teal-400"
    >
      <Bot className="h-3 w-3" /> AI Narrative
    </button>
  );
}