import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getDataset, listProjectDatasets } from "../api/datasets";
import {
  applyFlagRules,
  createFlag,
  createFlagRule,
  createManualFlaggedRange,
  deleteFlag,
  deleteFlagRule,
  deleteFlaggedRange,
  listFlaggedRanges,
  listFlagRules,
  listFlags,
  updateFlagRule,
} from "../api/qc";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { FlagManager } from "../components/qc/FlagManager";
import { FlagRuleEditor } from "../components/qc/FlagRuleEditor";
import { QCDashboard } from "../components/qc/QCDashboard";
import { ChannelSelector } from "../components/timeseries/ChannelSelector";
import { TimeSeriesChart } from "../components/timeseries/TimeSeriesChart";
import { TimeSeriesControls } from "../components/timeseries/TimeSeriesControls";
import { useTimeSeries } from "../hooks/useTimeSeries";
import { useProjectStore } from "../stores/projectStore";
import type { DatasetDetail, DatasetSummary } from "../types/dataset";
import type { Flag, FlagRule, FlaggedRange } from "../types/qc";

const chartPalette = ["#1f8f84", "#f06f32", "#2563eb", "#7c3aed", "#059669", "#dc2626", "#0891b2", "#ca8a04"];

function defaultColumnSelection(dataset: DatasetDetail) {
  return dataset.columns.slice(0, Math.min(dataset.columns.length, 6)).map((column) => column.id);
}

export function QCPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const datasetId = searchParams.get("datasetId") ?? "";
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetDetail, setDatasetDetail] = useState<DatasetDetail | null>(null);
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([]);
  const [resample, setResample] = useState("raw");
  const [flags, setFlags] = useState<Flag[]>([]);
  const [flagRules, setFlagRules] = useState<FlagRule[]>([]);
  const [flaggedRanges, setFlaggedRanges] = useState<FlaggedRange[]>([]);
  const [activeFlagId, setActiveFlagId] = useState<string | null>(null);
  const [flagVisibility, setFlagVisibility] = useState<Record<string, boolean>>({});
  const [manualRange, setManualRange] = useState<{ start: string; end: string } | null>(null);
  const [manualFlagId, setManualFlagId] = useState("");
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingDatasetDetail, setIsLoadingDatasetDetail] = useState(false);
  const [isLoadingQc, setIsLoadingQc] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
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
    setPageError(null);
    void listProjectDatasets(projectId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setDatasets(response.datasets);
        setIsLoadingDatasets(false);
        if (!datasetId && response.datasets.length > 0) {
          const next = new URLSearchParams(searchParams);
          next.set("projectId", projectId);
          next.set("datasetId", response.datasets[0].id);
          setSearchParams(next, { replace: true });
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
      setFlags([]);
      setFlagRules([]);
      setFlaggedRanges([]);
      setActiveFlagId(null);
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
        setSelectedColumnIds((current) => {
          const valid = current.filter((columnId) => response.columns.some((column) => column.id === columnId));
          return valid.length > 0 ? valid : defaultColumnSelection(response);
        });
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

  async function refreshQcState(nextDatasetId: string, preferredFlagId?: string | null) {
    setIsLoadingQc(true);
    setPageError(null);
    try {
      const [nextFlags, nextRanges] = await Promise.all([listFlags(nextDatasetId), listFlaggedRanges(nextDatasetId)]);
      setFlags(nextFlags);
      setFlaggedRanges(nextRanges);

      const resolvedFlagId = preferredFlagId ?? activeFlagId ?? nextFlags[0]?.id ?? null;
      setActiveFlagId(resolvedFlagId);
      setManualFlagId((current) => current || resolvedFlagId || "");
      setFlagVisibility((current) => {
        const nextVisibility: Record<string, boolean> = {};
        for (const flag of nextFlags) {
          nextVisibility[flag.id] = current[flag.id] ?? true;
        }
        return nextVisibility;
      });

      if (resolvedFlagId) {
        const nextRules = await listFlagRules(resolvedFlagId);
        setFlagRules(nextRules);
      } else {
        setFlagRules([]);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load QC data");
    } finally {
      setIsLoadingQc(false);
    }
  }

  useEffect(() => {
    if (datasetId) {
      void refreshQcState(datasetId, null);
    }
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId || !activeFlagId) {
      setFlagRules([]);
      return;
    }
    let cancelled = false;
    setIsLoadingQc(true);
    void listFlagRules(activeFlagId)
      .then((rules) => {
        if (!cancelled) {
          setFlagRules(rules);
          setIsLoadingQc(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Unable to load flag rules");
          setIsLoadingQc(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFlagId, datasetId]);

  const activeProject = projects.find((project) => project.id === projectId) ?? null;
  const activeFlag = flags.find((flag) => flag.id === activeFlagId) ?? null;
  const visibleFlaggedRanges = flaggedRanges.filter((flaggedRange) => flagVisibility[flaggedRange.flag_id] ?? true);
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
  });

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
            <span className="font-mono text-xs uppercase tracking-[0.34em] text-ember-500">Task 11</span>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
              Review QC flags, define automated rules, and mark suspect intervals directly on the time-series chart.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-600 sm:text-base">
              This workspace pairs the QC rule editor with the interactive chart so you can inspect flagged intervals, apply rules, and manually exclude ranges.
            </p>
          </div>
          <div className="panel-muted grid gap-4 p-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Project
              <select value={projectId} onChange={(event) => updateSearch({ projectId: event.target.value, datasetId: "" })} className="rounded-2xl border-ink-200 bg-white">
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Dataset
              <select value={datasetId} onChange={(event) => updateSearch({ datasetId: event.target.value })} className="rounded-2xl border-ink-200 bg-white" disabled={!projectId || isLoadingDatasets || datasets.length === 0}>
                <option value="">Select a dataset</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {!projectId ? <section className="panel-surface p-8 text-sm text-ink-600">Choose a project to start the QC workflow.</section> : null}

      {pageError || error ? (
        <section className="panel-surface flex items-start gap-3 border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{pageError || error}</span>
        </section>
      ) : null}

      {projectId && !isLoadingDatasets && datasets.length === 0 ? (
        <section className="panel-surface p-8">
          <h2 className="text-2xl font-semibold text-ink-900">No datasets available</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">Import data into this project before using the QC dashboard.</p>
          <Link to={`/import?projectId=${projectId}`} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-ember-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-ember-400">Import dataset</Link>
        </section>
      ) : null}

      {datasetDetail ? (
        <>
          <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700"><ShieldCheck className="h-4 w-4 text-teal-500" />Active dataset</div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{datasetDetail.name}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">{activeProject?.name ?? "Active project"}</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Flags</div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{flags.length}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">Configured QC categories for this dataset.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Ranges</div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{flaggedRanges.length}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">Current flagged intervals across manual and automatic rules.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Rendered points</div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{data?.timestamps.length.toLocaleString() ?? "0"}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">Visible chart points for the current time window.</p>
            </div>
          </section>

          <QCDashboard
            sidebar={
              <>
                <FlagManager
                  flags={flags}
                  flaggedRanges={flaggedRanges}
                  activeFlagId={activeFlagId}
                  flagVisibility={flagVisibility}
                  isBusy={isLoadingQc}
                  onSelectFlag={(flagId) => setActiveFlagId(flagId)}
                  onToggleVisibility={(flagId) => setFlagVisibility((current) => ({ ...current, [flagId]: !(current[flagId] ?? true) }))}
                  onCreateFlag={async (payload) => {
                    if (!datasetDetail) {
                      return;
                    }
                    const created = await createFlag(datasetDetail.id, payload);
                    await refreshQcState(datasetDetail.id, created.id);
                  }}
                  onApplyRules={async (flagId) => {
                    if (!datasetDetail) {
                      return;
                    }
                    await applyFlagRules(flagId);
                    await refreshQcState(datasetDetail.id, flagId);
                  }}
                  onDeleteFlag={async (flagId) => {
                    if (!datasetDetail) {
                      return;
                    }
                    await deleteFlag(flagId);
                    await refreshQcState(datasetDetail.id, activeFlagId === flagId ? null : activeFlagId);
                  }}
                  onDeleteRange={async (rangeId) => {
                    if (!datasetDetail) {
                      return;
                    }
                    await deleteFlaggedRange(rangeId);
                    await refreshQcState(datasetDetail.id, activeFlagId);
                  }}
                />
                <FlagRuleEditor
                  activeFlag={activeFlag}
                  columns={datasetDetail.columns}
                  rules={flagRules}
                  onCreateRule={async (payload) => {
                    if (!activeFlag || !datasetDetail) {
                      return;
                    }
                    await createFlagRule(activeFlag.id, payload);
                    await refreshQcState(datasetDetail.id, activeFlag.id);
                  }}
                  onUpdateRule={async (ruleId, payload) => {
                    if (!activeFlag || !datasetDetail) {
                      return;
                    }
                    await updateFlagRule(ruleId, payload);
                    await refreshQcState(datasetDetail.id, activeFlag.id);
                  }}
                  onDeleteRule={async (ruleId) => {
                    if (!activeFlag || !datasetDetail) {
                      return;
                    }
                    await deleteFlagRule(ruleId);
                    await refreshQcState(datasetDetail.id, activeFlag.id);
                  }}
                />
              </>
            }
            main={
              <>
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
                      setSelectedColumnIds((current) => current.includes(columnId) ? current.filter((item) => item !== columnId) : [...current, columnId])
                    }
                    onSelectAll={() => setSelectedColumnIds(datasetDetail.columns.map((column) => column.id))}
                    onClearAll={() => setSelectedColumnIds([])}
                  />

                  <TimeSeriesChart
                    datasetColumns={datasetDetail.columns}
                    selectedColumnIds={selectedColumnIds}
                    colorByColumnId={colorByColumnId}
                    data={data}
                    isLoading={isLoading || isLoadingDatasetDetail || isLoadingQc}
                    error={error}
                    onRangeChange={setVisibleRange}
                    onFitAll={() => setVisibleRange({ start: datasetDetail.start_time, end: datasetDetail.end_time })}
                    flaggedRanges={visibleFlaggedRanges}
                    flagMetaById={flagMetaById}
                    manualSelectionEnabled={flags.length > 0}
                    onManualRangeSelected={(range) => {
                      setManualRange(range);
                      setManualFlagId(activeFlagId ?? flags[0]?.id ?? "");
                    }}
                  />
                </section>
              </>
            }
          />
        </>
      ) : projectId && (isLoadingDatasetDetail || isLoadingDatasets) ? (
        <section className="panel-surface p-6"><LoadingSpinner label="Loading QC workspace" /></section>
      ) : null}

      <Modal
        open={manualRange !== null}
        title="Create manual flagged range"
        description="Choose which flag to apply to the selected time window. Use Shift plus drag on the chart to create a different selection."
        onClose={() => setManualRange(null)}
      >
        <div className="space-y-4">
          {manualRange ? <div className="panel-muted px-4 py-4 text-sm text-ink-700">{new Date(manualRange.start).toLocaleString()} to {new Date(manualRange.end).toLocaleString()}</div> : null}
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Flag
            <select value={manualFlagId} onChange={(event) => setManualFlagId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
              <option value="">Select a flag</option>
              {flags.map((flag) => <option key={flag.id} value={flag.id}>{flag.name}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setManualRange(null)} className="rounded-2xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900">Cancel</button>
            <button
              type="button"
              disabled={!manualRange || !manualFlagId || !datasetDetail}
              onClick={() => {
                if (!manualRange || !manualFlagId || !datasetDetail) {
                  return;
                }
                void createManualFlaggedRange(manualFlagId, { start_time: manualRange.start, end_time: manualRange.end, column_ids: selectedColumnIds.length > 0 ? selectedColumnIds : undefined })
                  .then(async () => {
                    await refreshQcState(datasetDetail.id, manualFlagId);
                    setManualRange(null);
                  })
                  .catch((requestError: unknown) => setPageError(requestError instanceof Error ? requestError.message : "Unable to create manual flagged range"));
              }}
              className="rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-700 disabled:opacity-60"
            >
              Apply flag
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
