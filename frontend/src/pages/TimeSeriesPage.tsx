import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getDataset, listProjectDatasets } from "../api/datasets";
import { listFlaggedRanges, listFlags } from "../api/qc";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ChannelSelector } from "../components/timeseries/ChannelSelector";
import { TimeSeriesChart } from "../components/timeseries/TimeSeriesChart";
import { TimeSeriesControls } from "../components/timeseries/TimeSeriesControls";
import { useTimeSeries } from "../hooks/useTimeSeries";
import { useProjectStore } from "../stores/projectStore";
import type { DatasetDetail, DatasetSummary } from "../types/dataset";
import type { Flag, FlaggedRange } from "../types/qc";

const chartPalette = ["#1f8f84", "#f06f32", "#2563eb", "#7c3aed", "#059669", "#dc2626", "#0891b2", "#ca8a04"];

function defaultColumnSelection(dataset: DatasetDetail) {
  const ranked = [...dataset.columns].sort((left, right) => {
    const leftPriority = left.measurement_type === "speed" ? 0 : left.measurement_type === "direction" ? 1 : 2;
    const rightPriority = right.measurement_type === "speed" ? 0 : right.measurement_type === "direction" ? 1 : 2;
    return leftPriority - rightPriority;
  });
  return ranked.slice(0, Math.min(6, ranked.length)).map((column) => column.id);
}

export function TimeSeriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const datasetId = searchParams.get("datasetId") ?? "";
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetDetail, setDatasetDetail] = useState<DatasetDetail | null>(null);
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([]);
  const [resample, setResample] = useState("raw");
  const [flags, setFlags] = useState<Flag[]>([]);
  const [flaggedRanges, setFlaggedRanges] = useState<FlaggedRange[]>([]);
  const [excludedFlagIds, setExcludedFlagIds] = useState<string[]>([]);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingDatasetDetail, setIsLoadingDatasetDetail] = useState(false);
  const [isLoadingFlags, setIsLoadingFlags] = useState(false);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [datasetDetailError, setDatasetDetailError] = useState<string | null>(null);
  const { projects, fetchProjects } = useProjectStore();

  useEffect(() => {
    if (projects.length === 0) {
      void fetchProjects();
    }
  }, [fetchProjects, projects.length]);

  useEffect(() => {
    if (!projectId) {
      setDatasets([]);
      setDatasetDetail(null);
      setSelectedColumnIds([]);
      return;
    }

    let cancelled = false;
    setIsLoadingDatasets(true);
    setDatasetsError(null);

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
          setDatasetsError(error instanceof Error ? error.message : "Unable to load datasets");
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
      setSelectedColumnIds([]);
      setFlags([]);
      setFlaggedRanges([]);
      setExcludedFlagIds([]);
      return;
    }

    let cancelled = false;
    setIsLoadingDatasetDetail(true);
    setDatasetDetailError(null);

    void getDataset(datasetId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setDatasetDetail(response);
        setIsLoadingDatasetDetail(false);
        setSelectedColumnIds((current) => {
          const validExisting = current.filter((columnId) => response.columns.some((column) => column.id === columnId));
          return validExisting.length > 0 ? validExisting : defaultColumnSelection(response);
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDatasetDetailError(error instanceof Error ? error.message : "Unable to load dataset detail");
          setIsLoadingDatasetDetail(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) {
      return;
    }

    let cancelled = false;
    setIsLoadingFlags(true);
    void Promise.all([listFlags(datasetId), listFlaggedRanges(datasetId)])
      .then(([nextFlags, nextRanges]) => {
        if (cancelled) {
          return;
        }
        setFlags(nextFlags);
        setFlaggedRanges(nextRanges);
        setExcludedFlagIds((current) => current.filter((flagId) => nextFlags.some((flag) => flag.id === flagId)));
        setIsLoadingFlags(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFlags([]);
          setFlaggedRanges([]);
          setExcludedFlagIds([]);
          setIsLoadingFlags(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  const visibleFlaggedRanges = flaggedRanges.filter((flaggedRange) => !excludedFlagIds.includes(flaggedRange.flag_id));
  const flagMetaById = Object.fromEntries(flags.map((flag) => [flag.id, { name: flag.name, color: flag.color }]));
  const colorByColumnId = useMemo(() => {
    if (!datasetDetail) {
      return {} as Record<string, string>;
    }

    return Object.fromEntries(datasetDetail.columns.map((column, index) => [column.id, chartPalette[index % chartPalette.length]]));
  }, [datasetDetail]);

  const { data, visibleRange, setVisibleRange, isLoading, error } = useTimeSeries({
    datasetId: datasetDetail?.id ?? null,
    columnIds: selectedColumnIds,
    resample: resample === "raw" ? null : resample,
    fullStart: datasetDetail?.start_time ?? null,
    fullEnd: datasetDetail?.end_time ?? null,
    excludedFlagIds,
  });

  const activeProject = projects.find((project) => project.id === projectId) ?? null;
  const renderedPointCount = data?.timestamps.length ?? 0;

  function updateSearch(next: { projectId?: string; datasetId?: string }) {
    const nextParams = new URLSearchParams(searchParams);

    if (next.projectId !== undefined) {
      if (next.projectId) {
        nextParams.set("projectId", next.projectId);
      } else {
        nextParams.delete("projectId");
      }
    }

    if (next.datasetId !== undefined) {
      if (next.datasetId) {
        nextParams.set("datasetId", next.datasetId);
      } else {
        nextParams.delete("datasetId");
      }
    }

    setSearchParams(nextParams);
  }

  return (
    <div className="space-y-3">
      {/* Compact toolbar row */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold text-ink-900">Time Series</h1>
        <select value={projectId} onChange={(event) => updateSearch({ projectId: event.target.value, datasetId: "" })} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
          <option value="">Project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={datasetId} onChange={(event) => updateSearch({ datasetId: event.target.value })} className="rounded-lg border-ink-200 bg-white py-1 text-xs" disabled={!projectId || isLoadingDatasets || datasets.length === 0}>
          <option value="">Dataset</option>
          {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {datasetDetail && (
          <span className="ml-auto text-[11px] text-ink-400">
            {datasetDetail.row_count.toLocaleString()} rows &middot; {datasetDetail.column_count} ch &middot; {renderedPointCount.toLocaleString()} pts
          </span>
        )}
      </div>

      {datasetsError || datasetDetailError ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 p-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{datasetsError || datasetDetailError}</span>
        </div>
      ) : null}

      {!projectId ? <p className="py-8 text-center text-xs text-ink-400">Select a project to begin.</p> : null}

      {projectId && isLoadingDatasets ? <div className="py-8"><LoadingSpinner label="Loading datasets" /></div> : null}

      {projectId && !isLoadingDatasets && datasets.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <p className="text-xs text-ink-500">No datasets yet.</p>
          <Link to={`/import?projectId=${projectId}`} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ember-400">Import</Link>
        </div>
      ) : null}

      {datasetDetail ? (
        <>
          <TimeSeriesControls
            resample={resample}
            appliedResample={data?.resample ?? null}
            start={visibleRange.start}
            end={visibleRange.end}
            flags={flags}
            excludedFlagIds={excludedFlagIds}
            onResampleChange={setResample}
            onRangeChange={setVisibleRange}
            onFitAll={() => setVisibleRange({ start: datasetDetail.start_time, end: datasetDetail.end_time })}
            onToggleFlagExclusion={(flagId) =>
              setExcludedFlagIds((current) => current.includes(flagId) ? current.filter((item) => item !== flagId) : [...current, flagId])
            }
            onSetShowCleanDataOnly={(value) => setExcludedFlagIds(value ? flags.map((flag) => flag.id) : [])}
          />

          {/* Full-width chart with collapsible channel selector */}
          <TimeSeriesChart
            datasetColumns={datasetDetail.columns}
            selectedColumnIds={selectedColumnIds}
            colorByColumnId={colorByColumnId}
            data={data}
            isLoading={isLoading || isLoadingDatasetDetail || isLoadingFlags}
            error={error}
            onRangeChange={setVisibleRange}
            onFitAll={() => setVisibleRange({ start: datasetDetail.start_time, end: datasetDetail.end_time })}
            flaggedRanges={visibleFlaggedRanges}
            flagMetaById={flagMetaById}
            excludedFlagIds={excludedFlagIds}
          />

          <ChannelSelector
            columns={datasetDetail.columns}
            selectedColumnIds={selectedColumnIds}
            colorByColumnId={colorByColumnId}
            onToggle={(columnId) =>
              setSelectedColumnIds((current) =>
                current.includes(columnId) ? current.filter((item) => item !== columnId) : [...current, columnId],
              )
            }
            onSelectAll={() => setSelectedColumnIds(datasetDetail.columns.map((column) => column.id))}
            onClearAll={() => setSelectedColumnIds([])}
          />
        </>
      ) : datasetId && isLoadingDatasetDetail ? (
        <div className="py-8"><LoadingSpinner label="Loading dataset" /></div>
      ) : null}
    </div>
  );
}
