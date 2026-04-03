import { AlertTriangle, Bot } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAi } from "../ai/AiProvider";
import { InsightBanner } from "../components/ai/InsightBanner";
import { downloadMcpReferenceData, getMcpComparison, getMcpCorrelation, getMcpDownloadStatus, getMcpPrediction } from "../api/analysis";
import { getDataset, listProjectDatasets } from "../api/datasets";
import { MCPWorkspace } from "../components/mcp/MCPWorkspace";
import { useProjectStore } from "../stores/projectStore";
import type {
  MCPComparisonResponse,
  MCPCorrelationResponse,
  MCPMethod,
  MCPPredictionResponse,
  MCPReferenceDataSource,
  MCPReferenceDownloadStatusResponse,
} from "../types/analysis";
import type { DatasetDetail, DatasetSummary } from "../types/dataset";

function getDefaultReferenceDataset(datasets: DatasetSummary[], currentSiteDatasetId: string) {
  const reanalysisDataset = datasets.find((dataset) => dataset.id !== currentSiteDatasetId && dataset.source_type === "reanalysis");
  if (reanalysisDataset) {
    return reanalysisDataset.id;
  }
  return datasets.find((dataset) => dataset.id !== currentSiteDatasetId)?.id ?? "";
}

function getDefaultSpeedColumnId(datasetDetail: DatasetDetail | null) {
  return datasetDetail?.columns.find((column) => column.measurement_type === "speed")?.id ?? "";
}

function getValidExtraColumns(datasetDetail: DatasetDetail | null, primaryColumnId: string, selectedColumnIds: string[]) {
  const validIds = new Set((datasetDetail?.columns ?? []).filter((column) => column.measurement_type === "speed").map((column) => column.id));
  return selectedColumnIds.filter((columnId) => columnId !== primaryColumnId && validIds.has(columnId));
}

function getDefaultYearRange() {
  const currentYear = new Date().getUTCFullYear();
  return {
    startYear: String(currentYear - 20),
    endYear: String(currentYear),
  };
}

export function MCPPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const siteDatasetId = searchParams.get("siteDatasetId") ?? "";
  const refDatasetId = searchParams.get("refDatasetId") ?? "";
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [siteDetail, setSiteDetail] = useState<DatasetDetail | null>(null);
  const [refDetail, setRefDetail] = useState<DatasetDetail | null>(null);
  const [siteColumnId, setSiteColumnId] = useState("");
  const [refColumnId, setRefColumnId] = useState("");
  const [extraSiteColumnIds, setExtraSiteColumnIds] = useState<string[]>([]);
  const [extraRefColumnIds, setExtraRefColumnIds] = useState<string[]>([]);
  const [method, setMethod] = useState<MCPMethod>("linear");
  const [correlationData, setCorrelationData] = useState<MCPCorrelationResponse | null>(null);
  const [comparisonData, setComparisonData] = useState<MCPComparisonResponse | null>(null);
  const [predictionData, setPredictionData] = useState<MCPPredictionResponse | null>(null);
  const [downloadSource, setDownloadSource] = useState<MCPReferenceDataSource>("era5");
  const [downloadLatitude, setDownloadLatitude] = useState("");
  const [downloadLongitude, setDownloadLongitude] = useState("");
  const [downloadStartYear, setDownloadStartYear] = useState(getDefaultYearRange().startYear);
  const [downloadEndYear, setDownloadEndYear] = useState(getDefaultYearRange().endYear);
  const [downloadDatasetName, setDownloadDatasetName] = useState("");
  const [downloadApiKey, setDownloadApiKey] = useState("");
  const [downloadTaskId, setDownloadTaskId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<MCPReferenceDownloadStatusResponse | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [datasetReloadToken, setDatasetReloadToken] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);
  const [correlationError, setCorrelationError] = useState<string | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isCorrelating, setIsCorrelating] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [mcpInsight, setMcpInsight] = useState<string | null>(null);
  const { projects, fetchProjects } = useProjectStore();
  const { sendPrompt } = useAi();

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

        if (response.datasets.length > 0 && (!siteDatasetId || !response.datasets.some((dataset) => dataset.id === siteDatasetId))) {
          const nextSiteDatasetId = response.datasets[0].id;
          const nextRefDatasetId = getDefaultReferenceDataset(response.datasets, nextSiteDatasetId);
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("projectId", projectId);
          nextParams.set("siteDatasetId", nextSiteDatasetId);
          nextParams.set("refDatasetId", nextRefDatasetId);
          setSearchParams(nextParams, { replace: true });
          return;
        }

        if (!refDatasetId || !response.datasets.some((dataset) => dataset.id === refDatasetId)) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("projectId", projectId);
          nextParams.set("siteDatasetId", siteDatasetId);
          nextParams.set("refDatasetId", getDefaultReferenceDataset(response.datasets, siteDatasetId));
          setSearchParams(nextParams, { replace: true });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Unable to load project datasets");
          setIsLoadingDatasets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetReloadToken, projectId, refDatasetId, searchParams, setSearchParams, siteDatasetId]);

  useEffect(() => {
    if (!siteDatasetId) {
      setSiteDetail(null);
      setSiteColumnId("");
      return;
    }

    let cancelled = false;
    setIsLoadingDetails(true);
    void getDataset(siteDatasetId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setSiteDetail(response);
        setSiteColumnId((current) => response.columns.some((column) => column.id === current) ? current : getDefaultSpeedColumnId(response));
        setExtraSiteColumnIds((current) => getValidExtraColumns(response, response.columns.some((column) => column.id === siteColumnId) ? siteColumnId : getDefaultSpeedColumnId(response), current));
        setIsLoadingDetails(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Unable to load site dataset");
          setIsLoadingDetails(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteColumnId, siteDatasetId]);

  useEffect(() => {
    if (!refDatasetId) {
      setRefDetail(null);
      setRefColumnId("");
      return;
    }

    let cancelled = false;
    setIsLoadingDetails(true);
    void getDataset(refDatasetId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setRefDetail(response);
        setRefColumnId((current) => response.columns.some((column) => column.id === current) ? current : getDefaultSpeedColumnId(response));
        setExtraRefColumnIds((current) => getValidExtraColumns(response, response.columns.some((column) => column.id === refColumnId) ? refColumnId : getDefaultSpeedColumnId(response), current));
        setIsLoadingDetails(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Unable to load reference dataset");
          setIsLoadingDetails(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refColumnId, refDatasetId]);

  const activeProject = projects.find((project) => project.id === projectId) ?? null;

  useEffect(() => {
    if (activeProject?.latitude != null) {
      setDownloadLatitude((current) => current || String(activeProject.latitude));
    }
    if (activeProject?.longitude != null) {
      setDownloadLongitude((current) => current || String(activeProject.longitude));
    }
  }, [activeProject?.latitude, activeProject?.longitude]);

  const payloadBase = useMemo(() => ({
    site_dataset_id: siteDatasetId,
    site_column_id: siteColumnId,
    site_column_ids: extraSiteColumnIds,
    ref_dataset_id: refDatasetId,
    ref_column_id: refColumnId,
    ref_column_ids: extraRefColumnIds,
  }), [extraRefColumnIds, extraSiteColumnIds, refColumnId, refDatasetId, siteColumnId, siteDatasetId]);

  useEffect(() => {
    if (!downloadTaskId) {
      return;
    }
    const taskId = downloadTaskId;

    let cancelled = false;
    let timeoutId: number | undefined;

    async function pollStatus() {
      try {
        const status = await getMcpDownloadStatus(taskId);
        if (cancelled) {
          return;
        }

        setDownloadStatus(status);
        setIsDownloading(status.status === "queued" || status.status === "running");

        if (status.status === "completed") {
          setDatasetReloadToken((value) => value + 1);
          if (status.dataset_id) {
            updateSearch(siteDatasetId, status.dataset_id);
          }
          setDownloadTaskId(null);
          return;
        }

        if (status.status === "failed") {
          setDownloadError(status.error ?? status.message);
          setDownloadTaskId(null);
          return;
        }

        timeoutId = window.setTimeout(() => {
          void pollStatus();
        }, 1200);
      } catch (error) {
        if (!cancelled) {
          setDownloadError(error instanceof Error ? error.message : "Unable to check download status");
          setIsDownloading(false);
          setDownloadTaskId(null);
        }
      }
    }

    void pollStatus();

    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [downloadTaskId, siteDatasetId]);

  function updateSearch(nextSiteDatasetId: string, nextRefDatasetId: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("projectId", projectId);
    nextParams.set("siteDatasetId", nextSiteDatasetId);
    nextParams.set("refDatasetId", nextRefDatasetId);
    setSearchParams(nextParams);
  }

  async function runCorrelation() {
    setIsCorrelating(true);
    setCorrelationError(null);
    try {
      const response = await getMcpCorrelation({ ...payloadBase, max_points: 2500 });
      setCorrelationData(response);
    } catch (error) {
      setCorrelationError(error instanceof Error ? error.message : "Unable to run correlation");
    } finally {
      setIsCorrelating(false);
    }
  }

  async function runCompare() {
    setIsComparing(true);
    setPredictionError(null);
    try {
      const response = await getMcpComparison({ ...payloadBase, methods: ["linear", "variance_ratio", "matrix"], max_points: 2500 });
      setComparisonData(response);
      if (!predictionData && response.recommended_method) {
        setMethod(response.recommended_method);
      }
      // Show insight banner after comparison
      if (response.recommended_method) {
        setMcpInsight(`MCP comparison complete. Recommended method: ${response.recommended_method}. Use AI Recommend for a detailed tradeoff analysis.`);
      }
    } catch (error) {
      setPredictionError(error instanceof Error ? error.message : "Unable to compare MCP methods");
    } finally {
      setIsComparing(false);
    }
  }

  async function runPrediction() {
    setIsPredicting(true);
    setPredictionError(null);
    try {
      const response = await getMcpPrediction({ ...payloadBase, method, max_points: 2500, max_prediction_points: 5000 });
      setPredictionData(response);
    } catch (error) {
      setPredictionError(error instanceof Error ? error.message : "Unable to run MCP prediction");
    } finally {
      setIsPredicting(false);
    }
  }

  async function startDownload() {
    const latitude = Number(downloadLatitude);
    const longitude = Number(downloadLongitude);
    const startYear = Number(downloadStartYear);
    const endYear = Number(downloadEndYear);

    if (!projectId) {
      setDownloadError("Select a project before downloading reference data");
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setDownloadError("Latitude and longitude must be valid numbers");
      return;
    }
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
      setDownloadError("Start year and end year must be whole numbers");
      return;
    }
    if (downloadSource === "era5" && !downloadApiKey.trim()) {
      setDownloadError("ERA5 downloads require an EarthDataHub API key");
      return;
    }

    setDownloadError(null);
    setDownloadStatus(null);
    setIsDownloading(true);

    try {
      const response = await downloadMcpReferenceData({
        project_id: projectId,
        source: downloadSource,
        latitude,
        longitude,
        start_year: startYear,
        end_year: endYear,
        dataset_name: downloadDatasetName.trim() || undefined,
        api_key: downloadSource === "era5" ? downloadApiKey.trim() : undefined,
      });
      setDownloadTaskId(response.task_id);
      setDownloadStatus({
        task_id: response.task_id,
        project_id: projectId,
        source: downloadSource,
        status: response.status,
        message: response.message,
        progress: 0,
        dataset_id: null,
        dataset_name: null,
        row_count: 0,
        column_count: 0,
        error: null,
        started_at: new Date().toISOString(),
        completed_at: null,
      });
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to start reference download");
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-3">
      <AiMcpButton projectId={projectId} />
      {mcpInsight ? (
        <InsightBanner
          message={mcpInsight}
          severity="info"
          actionLabel="AI Explain"
          onAction={() => { void sendPrompt(projectId, "Explain the MCP comparison results. Which method is best and why? Check for seasonal bias and cross-validation stability."); setMcpInsight(null); }}
          onDismiss={() => setMcpInsight(null)}
        />
      ) : null}
      {!projectId ? <p className="py-6 text-center text-xs text-ink-400">Select a project to start MCP.</p> : null}

      {projectId && datasets.length < 1 && !isLoadingDatasets ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Import a site dataset first.{activeProject ? <> <Link to={`/project/${activeProject.id}`} className="font-medium underline">Project</Link></> : null}</span>
        </div>
      ) : null}

      {projectId && (datasets.length >= 1 || isLoadingDatasets) ? (
        <MCPWorkspace
          datasets={datasets}
          siteDatasetId={siteDatasetId}
          refDatasetId={refDatasetId}
          siteDetail={siteDetail}
          refDetail={refDetail}
          siteColumnId={siteColumnId}
          refColumnId={refColumnId}
          extraSiteColumnIds={extraSiteColumnIds}
          extraRefColumnIds={extraRefColumnIds}
          method={method}
          correlationData={correlationData}
          comparisonData={comparisonData}
          predictionData={predictionData}
          downloadSource={downloadSource}
          downloadLatitude={downloadLatitude}
          downloadLongitude={downloadLongitude}
          downloadStartYear={downloadStartYear}
          downloadEndYear={downloadEndYear}
          downloadDatasetName={downloadDatasetName}
          downloadApiKey={downloadApiKey}
          downloadStatus={downloadStatus}
          downloadError={downloadError}
          isDownloading={isDownloading}
          pageError={pageError}
          correlationError={correlationError}
          predictionError={predictionError}
          isLoadingDatasets={isLoadingDatasets}
          isLoadingDetails={isLoadingDetails}
          isCorrelating={isCorrelating}
          isComparing={isComparing}
          isPredicting={isPredicting}
          onSiteDatasetChange={(nextSiteDatasetId) => {
            const nextRefDatasetId = nextSiteDatasetId === refDatasetId ? getDefaultReferenceDataset(datasets, nextSiteDatasetId) : refDatasetId;
            updateSearch(nextSiteDatasetId, nextRefDatasetId);
            setCorrelationData(null);
            setComparisonData(null);
            setPredictionData(null);
          }}
          onRefDatasetChange={(nextRefDatasetId) => {
            updateSearch(siteDatasetId, nextRefDatasetId);
            setCorrelationData(null);
            setComparisonData(null);
            setPredictionData(null);
          }}
          onSiteColumnChange={(nextColumnId) => {
            setSiteColumnId(nextColumnId);
            setExtraSiteColumnIds((current) => current.filter((columnId) => columnId !== nextColumnId));
          }}
          onRefColumnChange={(nextColumnId) => {
            setRefColumnId(nextColumnId);
            setExtraRefColumnIds((current) => current.filter((columnId) => columnId !== nextColumnId));
          }}
          onExtraSiteColumnsChange={setExtraSiteColumnIds}
          onExtraRefColumnsChange={setExtraRefColumnIds}
          onMethodChange={setMethod}
          onDownloadSourceChange={setDownloadSource}
          onDownloadLatitudeChange={setDownloadLatitude}
          onDownloadLongitudeChange={setDownloadLongitude}
          onDownloadStartYearChange={setDownloadStartYear}
          onDownloadEndYearChange={setDownloadEndYear}
          onDownloadDatasetNameChange={setDownloadDatasetName}
          onDownloadApiKeyChange={setDownloadApiKey}
          onStartDownload={() => void startDownload()}
          onRunCorrelation={() => void runCorrelation()}
          onRunCompare={() => void runCompare()}
          onRunPrediction={() => void runPrediction()}
        />
      ) : null}
    </div>
  );
}

/* ---------- AI Recommend button (hidden when AI disabled) ---------- */

function AiMcpButton({ projectId }: { projectId: string }) {
  const { enabled, sendPrompt } = useAi();
  if (!enabled || !projectId) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void sendPrompt(projectId, "Evaluate the MCP methods for this project. Compare cross-validation performance, check for seasonal bias, and recommend the best method with reasoning.")}
        className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700 transition hover:bg-teal-100 dark:bg-teal-900/20 dark:text-teal-400"
      >
        <Bot className="h-3 w-3" /> AI Recommend
      </button>
    </div>
  );
}