import { AlertTriangle, Database, LineChart, Radar, Waves } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getDataset, listProjectDatasets } from "../api/datasets";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ChannelSelector } from "../components/timeseries/ChannelSelector";
import { TimeSeriesChart } from "../components/timeseries/TimeSeriesChart";
import { TimeSeriesControls } from "../components/timeseries/TimeSeriesControls";
import { useTimeSeries } from "../hooks/useTimeSeries";
import { useProjectStore } from "../stores/projectStore";
import type { DatasetDetail, DatasetSummary } from "../types/dataset";

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
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingDatasetDetail, setIsLoadingDatasetDetail] = useState(false);
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
  });

  const activeProject = projects.find((project) => project.id === projectId) ?? null;

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
    <div className="space-y-6">
      <section className="panel-surface overflow-hidden px-6 py-8 sm:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.9fr)] xl:items-end">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.34em] text-ember-500">Task 9</span>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
              Explore imported datasets with an interactive, zoomable time-series workspace.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-600 sm:text-base">
              Select a project, choose a dataset, and inspect multiple channels with zoom, pan, dual axes, and server-side
              resampling for larger windows.
            </p>
          </div>

          <div className="panel-muted grid gap-4 p-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Project
              <select value={projectId} onChange={(event) => updateSearch({ projectId: event.target.value, datasetId: "" })} className="rounded-2xl border-ink-200 bg-white">
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Dataset
              <select value={datasetId} onChange={(event) => updateSearch({ datasetId: event.target.value })} className="rounded-2xl border-ink-200 bg-white" disabled={!projectId || isLoadingDatasets || datasets.length === 0}>
                <option value="">Select a dataset</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {!projectId ? (
        <section className="panel-surface p-8 text-sm text-ink-600">Choose a project to begin inspecting datasets.</section>
      ) : null}

      {datasetsError || datasetDetailError ? (
        <section className="panel-surface flex items-start gap-3 border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{datasetsError || datasetDetailError}</span>
        </section>
      ) : null}

      {projectId && isLoadingDatasets ? (
        <section className="panel-surface p-6">
          <LoadingSpinner label="Loading datasets" />
        </section>
      ) : null}

      {projectId && !isLoadingDatasets && datasets.length === 0 ? (
        <section className="panel-surface p-8">
          <h2 className="text-2xl font-semibold text-ink-900">No datasets available</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">
            This project does not have imported datasets yet. Start with the upload workflow, then come back here to inspect the channels.
          </p>
          <Link to={`/import?projectId=${projectId}`} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-ember-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-ember-400">
            Import dataset
          </Link>
        </section>
      ) : null}

      {datasetDetail ? (
        <>
          <section className="grid gap-4 xl:grid-cols-4">
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700">
                <Database className="h-4 w-4 text-teal-500" />
                Dataset
              </div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{datasetDetail.name}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">{activeProject?.name ?? "Active project"}</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700">
                <LineChart className="h-4 w-4 text-teal-500" />
                Rows
              </div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{datasetDetail.row_count.toLocaleString()}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">Stored measurements in the current dataset.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700">
                <Radar className="h-4 w-4 text-teal-500" />
                Channels
              </div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{datasetDetail.column_count}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">Available sensor channels for plotting.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700">
                <Waves className="h-4 w-4 text-teal-500" />
                Returned points
              </div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{data?.timestamps.length.toLocaleString() ?? "0"}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">Points currently rendered after resampling.</p>
            </div>
          </section>

          <TimeSeriesControls
            resample={resample}
            appliedResample={data?.resample ?? null}
            start={visibleRange.start}
            end={visibleRange.end}
            onResampleChange={setResample}
            onRangeChange={setVisibleRange}
            onFitAll={() => setVisibleRange({ start: datasetDetail.start_time, end: datasetDetail.end_time })}
          />

          <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
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

            <TimeSeriesChart
              datasetColumns={datasetDetail.columns}
              selectedColumnIds={selectedColumnIds}
              colorByColumnId={colorByColumnId}
              data={data}
              isLoading={isLoading || isLoadingDatasetDetail}
              error={error}
              onRangeChange={setVisibleRange}
              onFitAll={() => setVisibleRange({ start: datasetDetail.start_time, end: datasetDetail.end_time })}
            />
          </section>
        </>
      ) : datasetId && isLoadingDatasetDetail ? (
        <section className="panel-surface p-6">
          <LoadingSpinner label="Loading dataset detail" />
        </section>
      ) : null}
    </div>
  );
}
