import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getMcpComparison, getMcpCorrelation, getMcpPrediction } from "../api/analysis";
import { getDataset, listProjectDatasets } from "../api/datasets";
import { MCPWorkspace } from "../components/mcp/MCPWorkspace";
import { useProjectStore } from "../stores/projectStore";
import type { MCPComparisonResponse, MCPCorrelationResponse, MCPMethod, MCPPredictionResponse } from "../types/analysis";
import type { DatasetDetail, DatasetSummary } from "../types/dataset";

function getDefaultReferenceDataset(datasets: DatasetSummary[], currentSiteDatasetId: string) {
  const reanalysisDataset = datasets.find((dataset) => dataset.id !== currentSiteDatasetId && dataset.source_type === "reanalysis");
  if (reanalysisDataset) {
    return reanalysisDataset.id;
  }
  return datasets.find((dataset) => dataset.id !== currentSiteDatasetId)?.id ?? datasets[0]?.id ?? "";
}

function getDefaultSpeedColumnId(datasetDetail: DatasetDetail | null) {
  return datasetDetail?.columns.find((column) => column.measurement_type === "speed")?.id ?? "";
}

function getValidExtraColumns(datasetDetail: DatasetDetail | null, primaryColumnId: string, selectedColumnIds: string[]) {
  const validIds = new Set((datasetDetail?.columns ?? []).filter((column) => column.measurement_type === "speed").map((column) => column.id));
  return selectedColumnIds.filter((columnId) => columnId !== primaryColumnId && validIds.has(columnId));
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
  const [pageError, setPageError] = useState<string | null>(null);
  const [correlationError, setCorrelationError] = useState<string | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isCorrelating, setIsCorrelating] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const { projects, fetchProjects } = useProjectStore();

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
  }, [projectId, refDatasetId, searchParams, setSearchParams, siteDatasetId]);

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
  const payloadBase = useMemo(() => ({
    site_dataset_id: siteDatasetId,
    site_column_id: siteColumnId,
    site_column_ids: extraSiteColumnIds,
    ref_dataset_id: refDatasetId,
    ref_column_id: refColumnId,
    ref_column_ids: extraRefColumnIds,
  }), [extraRefColumnIds, extraSiteColumnIds, refColumnId, refDatasetId, siteColumnId, siteDatasetId]);

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

  return (
    <div className="space-y-6">
      {!projectId ? (
        <section className="panel-surface p-6">
          <p className="text-sm text-ink-600">Select a project to start the MCP workflow.</p>
        </section>
      ) : null}

      {projectId && datasets.length < 2 && !isLoadingDatasets ? (
        <section className="panel-surface p-6">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium text-amber-900">MCP needs at least two datasets</p>
              <p className="mt-1">Import or create a reference dataset for this project before running measure-correlate-predict.</p>
              {activeProject ? (
                <Link to={`/project/${activeProject.id}`} className="mt-3 inline-flex text-sm font-medium text-amber-900 underline decoration-amber-300 underline-offset-4">
                  Return to the project workspace
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {projectId && (datasets.length >= 2 || isLoadingDatasets) ? (
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
          onRunCorrelation={() => void runCorrelation()}
          onRunCompare={() => void runCompare()}
          onRunPrediction={() => void runPrediction()}
        />
      ) : null}
    </div>
  );
}