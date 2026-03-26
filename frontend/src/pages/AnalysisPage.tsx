import { AlertTriangle, BarChart3, Compass, GaugeCircle, ShieldCheck, Wind } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { createExtrapolatedChannel, getHistogramAnalysis, getShearAnalysis, getWeibullAnalysis, getWindRoseAnalysis } from "../api/analysis";
import { FrequencyHistogram } from "../components/analysis/FrequencyHistogram";
import { WindShearPanel } from "../components/analysis/WindShearPanel";
import { getDataset, listProjectDatasets } from "../api/datasets";
import { listFlags } from "../api/qc";
import { WindRoseChart } from "../components/analysis/WindRoseChart";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useProjectStore } from "../stores/projectStore";
import type { HistogramRequest, HistogramResponse, ShearMethod, ShearResponse, WeibullMethod, WeibullResponse, WindRoseResponse } from "../types/analysis";
import type { DatasetColumn, DatasetDetail, DatasetSummary } from "../types/dataset";
import type { Flag } from "../types/qc";

type AnalysisTab = "wind-rose" | "histogram" | "shear" | "turbulence" | "air-density" | "extreme-wind";

const analysisTabs: Array<{ id: AnalysisTab; label: string; description: string }> = [
  { id: "wind-rose", label: "Wind Rose", description: "Directional frequency, mean speed, and energy." },
  { id: "histogram", label: "Histogram", description: "Frequency distributions for any measured channel, with Weibull overlays for wind speed." },
  { id: "shear", label: "Shear", description: "Vertical profile, directional shear, and target-height extrapolation." },
  { id: "turbulence", label: "Turbulence", description: "IEC TI analytics will follow in the next analysis tasks." },
  { id: "air-density", label: "Air Density", description: "Density and wind power density calculations will be added later." },
  { id: "extreme-wind", label: "Extreme Wind", description: "Return-period and Gumbel analysis is queued after core charts." },
];

function getDefaultDirectionColumn(columns: DatasetColumn[]) {
  return columns.find((column) => column.measurement_type === "direction")?.id ?? "";
}

function getDefaultValueColumn(columns: DatasetColumn[]) {
  return (
    columns.find((column) => column.measurement_type === "speed")?.id ??
    columns.find((column) => column.measurement_type === "gust")?.id ??
    columns.find((column) => column.measurement_type !== "direction")?.id ??
    ""
  );
}

function isValidColumn(columns: DatasetColumn[], columnId: string) {
  return columns.some((column) => column.id === columnId);
}

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <section className="panel-surface p-8">
      <span className="font-mono text-xs uppercase tracking-[0.3em] text-ember-500">Queued next</span>
      <h2 className="mt-4 text-3xl font-semibold text-ink-900">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">{description}</p>
    </section>
  );
}

export function AnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const datasetId = searchParams.get("datasetId") ?? "";
  const [activeTab, setActiveTab] = useState<AnalysisTab>("wind-rose");
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetDetail, setDatasetDetail] = useState<DatasetDetail | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [selectedDirectionColumnId, setSelectedDirectionColumnId] = useState("");
  const [selectedValueColumnId, setSelectedValueColumnId] = useState("");
  const [selectedHistogramColumnId, setSelectedHistogramColumnId] = useState("");
  const [excludedFlagIds, setExcludedFlagIds] = useState<string[]>([]);
  const [numSectors, setNumSectors] = useState<12 | 16 | 36>(12);
  const [histogramBins, setHistogramBins] = useState(24);
  const [histogramBinWidth, setHistogramBinWidth] = useState("");
  const [roseData, setRoseData] = useState<WindRoseResponse | null>(null);
  const [histogramData, setHistogramData] = useState<HistogramResponse | null>(null);
  const [shearData, setShearData] = useState<ShearResponse | null>(null);
  const [weibullData, setWeibullData] = useState<WeibullResponse | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingDatasetDetail, setIsLoadingDatasetDetail] = useState(false);
  const [isLoadingFlags, setIsLoadingFlags] = useState(false);
  const [isLoadingWindRose, setIsLoadingWindRose] = useState(false);
  const [isLoadingHistogram, setIsLoadingHistogram] = useState(false);
  const [isLoadingShear, setIsLoadingShear] = useState(false);
  const [isLoadingWeibull, setIsLoadingWeibull] = useState(false);
  const [isCreatingExtrapolatedChannel, setIsCreatingExtrapolatedChannel] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [windRoseError, setWindRoseError] = useState<string | null>(null);
  const [histogramError, setHistogramError] = useState<string | null>(null);
  const [shearError, setShearError] = useState<string | null>(null);
  const [weibullError, setWeibullError] = useState<string | null>(null);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);
  const [createdChannelName, setCreatedChannelName] = useState<string | null>(null);
  const [showWeibullFit, setShowWeibullFit] = useState(true);
  const [weibullMethod, setWeibullMethod] = useState<WeibullMethod>("mle");
  const [shearMethod, setShearMethod] = useState<ShearMethod>("power");
  const [shearTargetHeight, setShearTargetHeight] = useState("100");
  const [selectedShearDirectionColumnId, setSelectedShearDirectionColumnId] = useState("");
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
      setFlags([]);
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
      setSelectedDirectionColumnId("");
      setSelectedValueColumnId("");
      setSelectedHistogramColumnId("");
      setSelectedShearDirectionColumnId("");
      setRoseData(null);
      setHistogramData(null);
      setShearData(null);
      setWeibullData(null);
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
        setSelectedDirectionColumnId((current) => (isValidColumn(response.columns, current) ? current : getDefaultDirectionColumn(response.columns)));
        setSelectedValueColumnId((current) => (isValidColumn(response.columns, current) ? current : getDefaultValueColumn(response.columns)));
        setSelectedHistogramColumnId((current) => (isValidColumn(response.columns, current) ? current : getDefaultValueColumn(response.columns)));
        setSelectedShearDirectionColumnId((current) => (isValidColumn(response.columns, current) ? current : getDefaultDirectionColumn(response.columns)));
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

  const histogramColumns = datasetDetail?.columns ?? [];
  const shearSpeedColumns = useMemo(
    () =>
      datasetDetail?.columns.filter(
        (column) => column.measurement_type === "speed" && column.height_m != null && column.sensor_info?.derived !== true,
      ) ?? [],
    [datasetDetail],
  );
  const selectedHistogramColumn = useMemo(
    () => histogramColumns.find((column) => column.id === selectedHistogramColumnId) ?? null,
    [histogramColumns, selectedHistogramColumnId],
  );
  const histogramColumnLabel = selectedHistogramColumn?.name ?? "selected channel";
  const isWeibullAvailable = selectedHistogramColumn?.measurement_type === "speed";
  const histogramRequest = useMemo<HistogramRequest | null>(() => {
    if (!selectedHistogramColumnId) {
      return null;
    }

    const rawBinWidth = histogramBinWidth.trim();
    const parsedBinWidth = rawBinWidth ? Number(rawBinWidth) : undefined;

    return {
      column_id: selectedHistogramColumnId,
      num_bins: histogramBins,
      exclude_flags: excludedFlagIds,
      ...(parsedBinWidth !== undefined && Number.isFinite(parsedBinWidth) && parsedBinWidth > 0 ? { bin_width: parsedBinWidth } : {}),
    };
  }, [excludedFlagIds, histogramBinWidth, histogramBins, selectedHistogramColumnId]);

  const parsedShearTargetHeight = useMemo(() => {
    const parsed = Number(shearTargetHeight);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [shearTargetHeight]);

  useEffect(() => {
    if (isWeibullAvailable) {
      setShowWeibullFit(true);
      return;
    }

    setShowWeibullFit(false);
    setWeibullData(null);
    setWeibullError(null);
  }, [isWeibullAvailable, datasetId, selectedHistogramColumnId]);

  useEffect(() => {
    if (!datasetId) {
      setFlags([]);
      setExcludedFlagIds([]);
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
        setExcludedFlagIds((current) => current.filter((flagId) => response.some((flag) => flag.id === flagId)));
        setIsLoadingFlags(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFlags([]);
          setExcludedFlagIds([]);
          setIsLoadingFlags(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  useEffect(() => {
    if (activeTab !== "wind-rose" || !datasetId || !selectedDirectionColumnId || !selectedValueColumnId) {
      setWindRoseError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingWindRose(true);
    setWindRoseError(null);

    void getWindRoseAnalysis(datasetId, {
      direction_column_id: selectedDirectionColumnId,
      value_column_id: selectedValueColumnId,
      num_sectors: numSectors,
      exclude_flags: excludedFlagIds,
    })
      .then((response) => {
        if (!cancelled) {
          setRoseData(response);
          setIsLoadingWindRose(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRoseData(null);
          setWindRoseError(error instanceof Error ? error.message : "Unable to build wind rose");
          setIsLoadingWindRose(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, datasetId, excludedFlagIds, numSectors, selectedDirectionColumnId, selectedValueColumnId]);

  useEffect(() => {
    if (activeTab !== "shear" || !datasetId || shearSpeedColumns.length < 2) {
      setShearError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingShear(true);
    setShearError(null);
    setCreateChannelError(null);

    void getShearAnalysis(datasetId, {
      speed_column_ids: shearSpeedColumns.map((column) => column.id),
      direction_column_id: selectedShearDirectionColumnId || undefined,
      exclude_flags: excludedFlagIds,
      method: shearMethod,
      num_sectors: numSectors,
      ...(parsedShearTargetHeight != null ? { target_height: parsedShearTargetHeight } : {}),
    })
      .then((response) => {
        if (!cancelled) {
          setShearData(response);
          setIsLoadingShear(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setShearData(null);
          setShearError(error instanceof Error ? error.message : "Unable to calculate wind shear");
          setIsLoadingShear(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, datasetId, excludedFlagIds, numSectors, parsedShearTargetHeight, selectedShearDirectionColumnId, shearMethod, shearSpeedColumns]);

  useEffect(() => {
    if (activeTab !== "histogram" || !datasetId || !histogramRequest) {
      setHistogramError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingHistogram(true);
    setHistogramError(null);

    void getHistogramAnalysis(datasetId, histogramRequest)
      .then((response) => {
        if (!cancelled) {
          setHistogramData(response);
          setIsLoadingHistogram(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setHistogramData(null);
          setHistogramError(error instanceof Error ? error.message : "Unable to build histogram");
          setIsLoadingHistogram(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, datasetId, histogramRequest]);

  useEffect(() => {
    if (activeTab !== "histogram" || !datasetId || !histogramRequest || !isWeibullAvailable || !showWeibullFit) {
      setIsLoadingWeibull(false);
      setWeibullError(null);
      if (!showWeibullFit || !isWeibullAvailable) {
        setWeibullData(null);
      }
      return;
    }

    let cancelled = false;
    setIsLoadingWeibull(true);
    setWeibullError(null);

    void getWeibullAnalysis(datasetId, {
      ...histogramRequest,
      method: weibullMethod,
    })
      .then((response) => {
        if (!cancelled) {
          setWeibullData(response);
          setIsLoadingWeibull(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setWeibullData(null);
          setWeibullError(error instanceof Error ? error.message : "Unable to fit Weibull curve");
          setIsLoadingWeibull(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, datasetId, histogramRequest, isWeibullAvailable, showWeibullFit, weibullMethod]);

  const activeProject = projects.find((project) => project.id === projectId) ?? null;
  const directionColumns = useMemo(() => datasetDetail?.columns.filter((column) => column.measurement_type === "direction") ?? [], [datasetDetail]);
  const valueColumns = useMemo(
    () => datasetDetail?.columns.filter((column) => column.measurement_type !== "direction") ?? [],
    [datasetDetail],
  );

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

  function toggleExcludedFlag(flagId: string) {
    setExcludedFlagIds((current) => (current.includes(flagId) ? current.filter((item) => item !== flagId) : [...current, flagId]));
  }

  async function handleCreateExtrapolatedChannel() {
    if (!datasetId || shearSpeedColumns.length < 2 || parsedShearTargetHeight == null) {
      return;
    }

    setIsCreatingExtrapolatedChannel(true);
    setCreateChannelError(null);
    setCreatedChannelName(null);

    try {
      const response = await createExtrapolatedChannel(datasetId, {
        speed_column_ids: shearSpeedColumns.map((column) => column.id),
        exclude_flags: excludedFlagIds,
        method: shearMethod,
        target_height: parsedShearTargetHeight,
        create_column: true,
      });

      if (response.created_column) {
        const createdColumn = response.created_column;
        setCreatedChannelName(createdColumn.name);
        setDatasetDetail((current) => {
          if (!current || current.columns.some((column) => column.id === createdColumn.id)) {
            return current;
          }
          return {
            ...current,
            column_count: current.column_count + 1,
            columns: [...current.columns, createdColumn],
          };
        });
      }
    } catch (error) {
      setCreateChannelError(error instanceof Error ? error.message : "Unable to create extrapolated channel");
    } finally {
      setIsCreatingExtrapolatedChannel(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel-surface overflow-hidden px-6 py-8 sm:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)] xl:items-end">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.34em] text-ember-500">Tasks 14-16</span>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
              Explore directional behaviour, live distributions, and Weibull fits inside a QC-aware analysis workspace.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-600 sm:text-base">
              Choose a dataset, then move between wind roses and histograms without leaving the same cleaned-data context or reselecting your QC filters.
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

      {!projectId ? <section className="panel-surface p-8 text-sm text-ink-600">Choose a project to start the analysis workflow.</section> : null}

      {pageError ? (
        <section className="panel-surface flex items-start gap-3 border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{pageError}</span>
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
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">Import data into this project before using the analysis workspace.</p>
          <Link to={`/import?projectId=${projectId}`} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-ember-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-ember-400">
            Import dataset
          </Link>
        </section>
      ) : null}

      {datasetDetail && !isLoadingDatasetDetail ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700"><BarChart3 className="h-4 w-4 text-teal-500" />Dataset</div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{datasetDetail.name}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">{activeProject?.name ?? "Active project"}</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700"><Compass className="h-4 w-4 text-teal-500" />Direction channels</div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{directionColumns.length}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">Available directional references for the wind rose.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700"><GaugeCircle className="h-4 w-4 text-teal-500" />Value channels</div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{valueColumns.length}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">Numeric channels available for mean and energy metrics.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700"><ShieldCheck className="h-4 w-4 text-teal-500" />QC flags</div>
              <p className="mt-3 text-xl font-semibold text-ink-900">{flags.length}</p>
              <p className="mt-1 text-sm leading-7 text-ink-600">Toggle exclusions to compare raw and clean directional distributions.</p>
            </div>
          </section>

          <section className="panel-surface p-3 sm:p-4">
            <div className="flex flex-wrap gap-2">
              {analysisTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "rounded-2xl px-4 py-3 text-sm font-medium transition",
                    activeTab === tab.id ? "bg-ink-900 text-white shadow-panel" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === "wind-rose" ? (
            <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="space-y-4">
                <section className="panel-surface p-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Inputs</p>
                  <div className="mt-4 space-y-4">
                    <label className="grid gap-2 text-sm font-medium text-ink-800">
                      Direction channel
                      <select value={selectedDirectionColumnId} onChange={(event) => setSelectedDirectionColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white" disabled={directionColumns.length === 0}>
                        <option value="">Select a direction column</option>
                        {directionColumns.map((column) => (
                          <option key={column.id} value={column.id}>
                            {column.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-ink-800">
                      Value channel
                      <select value={selectedValueColumnId} onChange={(event) => setSelectedValueColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white" disabled={valueColumns.length === 0}>
                        <option value="">Select a value column</option>
                        {valueColumns.map((column) => (
                          <option key={column.id} value={column.id}>
                            {column.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-ink-800">
                      Number of sectors
                      <select value={numSectors} onChange={(event) => setNumSectors(Number(event.target.value) as 12 | 16 | 36)} className="rounded-2xl border-ink-200 bg-white">
                        <option value={12}>12 sectors</option>
                        <option value={16}>16 sectors</option>
                        <option value={36}>36 sectors</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="panel-surface p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink-800"><Wind className="h-4 w-4 text-teal-500" />QC exclusions</div>
                  {isLoadingFlags ? <div className="mt-4 text-sm text-ink-600">Loading flags...</div> : null}
                  {!isLoadingFlags && flags.length === 0 ? <div className="mt-4 text-sm leading-7 text-ink-600">No flags are configured for this dataset yet.</div> : null}
                  {!isLoadingFlags && flags.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {flags.map((flag) => {
                        const excluded = excludedFlagIds.includes(flag.id);
                        return (
                          <label key={flag.id} className="flex items-start gap-3 rounded-2xl border border-ink-100 px-3 py-3 transition hover:bg-ink-50/80">
                            <input type="checkbox" checked={excluded} onChange={() => toggleExcludedFlag(flag.id)} className="mt-1 rounded border-ink-300 text-teal-500 focus:ring-teal-500" />
                            <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: flag.color ?? "#94a3b8" }} />
                            <span className="flex-1 text-sm text-ink-700">
                              <span className="font-medium text-ink-900">Exclude {flag.name}</span>
                              <span className="mt-1 block text-xs leading-6 text-ink-500">{flag.flagged_count} flagged ranges</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              </aside>

              <div className="space-y-4">
                {!selectedDirectionColumnId || !selectedValueColumnId ? (
                  <section className="panel-surface p-8 text-sm text-ink-600">Select both a direction channel and a value channel to build the wind rose.</section>
                ) : (
                  <WindRoseChart data={roseData} isLoading={isLoadingWindRose} error={windRoseError} />
                )}
              </div>
            </section>
          ) : activeTab === "histogram" ? (
            <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="space-y-4">
                <section className="panel-surface p-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Inputs</p>
                  <div className="mt-4 space-y-4">
                    <label className="grid gap-2 text-sm font-medium text-ink-800">
                      Histogram column
                      <select value={selectedHistogramColumnId} onChange={(event) => setSelectedHistogramColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white" disabled={histogramColumns.length === 0}>
                        <option value="">Select a column</option>
                        {histogramColumns.map((column) => (
                          <option key={column.id} value={column.id}>
                            {column.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-ink-800">
                      Number of bins
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={histogramBins}
                        onChange={(event) => setHistogramBins(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
                        className="rounded-2xl border-ink-200 bg-white"
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-ink-800">
                      Bin width override
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={histogramBinWidth}
                        onChange={(event) => setHistogramBinWidth(event.target.value)}
                        placeholder="Auto"
                        className="rounded-2xl border-ink-200 bg-white"
                      />
                    </label>
                  </div>
                </section>

                <section className="panel-surface p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink-800"><Wind className="h-4 w-4 text-teal-500" />QC exclusions</div>
                  {isLoadingFlags ? <div className="mt-4 text-sm text-ink-600">Loading flags...</div> : null}
                  {!isLoadingFlags && flags.length === 0 ? <div className="mt-4 text-sm leading-7 text-ink-600">No flags are configured for this dataset yet.</div> : null}
                  {!isLoadingFlags && flags.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {flags.map((flag) => {
                        const excluded = excludedFlagIds.includes(flag.id);
                        return (
                          <label key={flag.id} className="flex items-start gap-3 rounded-2xl border border-ink-100 px-3 py-3 transition hover:bg-ink-50/80">
                            <input type="checkbox" checked={excluded} onChange={() => toggleExcludedFlag(flag.id)} className="mt-1 rounded border-ink-300 text-teal-500 focus:ring-teal-500" />
                            <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: flag.color ?? "#94a3b8" }} />
                            <span className="flex-1 text-sm text-ink-700">
                              <span className="font-medium text-ink-900">Exclude {flag.name}</span>
                              <span className="mt-1 block text-xs leading-6 text-ink-500">{flag.flagged_count} flagged ranges</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              </aside>

              <div className="space-y-4">
                {!selectedHistogramColumnId ? (
                  <section className="panel-surface p-8 text-sm text-ink-600">Select a data column to build the histogram.</section>
                ) : (
                  <FrequencyHistogram
                    data={histogramData}
                    isLoading={isLoadingHistogram}
                    error={histogramError}
                    columnLabel={histogramColumnLabel}
                    isWeibullAvailable={isWeibullAvailable}
                    showWeibullFit={showWeibullFit}
                    onToggleWeibullFit={setShowWeibullFit}
                    weibullMethod={weibullMethod}
                    onChangeWeibullMethod={setWeibullMethod}
                    weibullData={weibullData}
                    isLoadingWeibull={isLoadingWeibull}
                    weibullError={weibullError}
                  />
                )}
              </div>
            </section>
          ) : activeTab === "shear" ? (
            <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="space-y-4">
                <section className="panel-surface p-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Inputs</p>
                  <div className="mt-4 space-y-4">
                    <label className="grid gap-2 text-sm font-medium text-ink-800">
                      Direction column
                      <select value={selectedShearDirectionColumnId} onChange={(event) => setSelectedShearDirectionColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white" disabled={directionColumns.length === 0}>
                        <option value="">No direction grouping</option>
                        {directionColumns.map((column) => (
                          <option key={column.id} value={column.id}>
                            {column.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="rounded-2xl border border-ink-100 bg-white/80 px-4 py-4 text-sm text-ink-700">
                      <div className="font-semibold text-ink-900">Measured speed heights</div>
                      <div className="mt-3 space-y-2">
                        {shearSpeedColumns.map((column) => (
                          <div key={column.id} className="flex items-center justify-between gap-3">
                            <span>{column.name}</span>
                            <span className="rounded-full bg-ink-900/5 px-2 py-1 text-xs font-medium uppercase tracking-[0.14em] text-ink-600">{column.height_m}m</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="panel-surface p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink-800"><Wind className="h-4 w-4 text-teal-500" />QC exclusions</div>
                  {isLoadingFlags ? <div className="mt-4 text-sm text-ink-600">Loading flags...</div> : null}
                  {!isLoadingFlags && flags.length === 0 ? <div className="mt-4 text-sm leading-7 text-ink-600">No flags are configured for this dataset yet.</div> : null}
                  {!isLoadingFlags && flags.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {flags.map((flag) => {
                        const excluded = excludedFlagIds.includes(flag.id);
                        return (
                          <label key={flag.id} className="flex items-start gap-3 rounded-2xl border border-ink-100 px-3 py-3 transition hover:bg-ink-50/80">
                            <input type="checkbox" checked={excluded} onChange={() => toggleExcludedFlag(flag.id)} className="mt-1 rounded border-ink-300 text-teal-500 focus:ring-teal-500" />
                            <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: flag.color ?? "#94a3b8" }} />
                            <span className="flex-1 text-sm text-ink-700">
                              <span className="font-medium text-ink-900">Exclude {flag.name}</span>
                              <span className="mt-1 block text-xs leading-6 text-ink-500">{flag.flagged_count} flagged ranges</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              </aside>

              <div className="space-y-4">
                {shearSpeedColumns.length < 2 ? (
                  <section className="panel-surface p-8 text-sm text-ink-600">At least two wind speed columns with distinct heights are required to calculate shear.</section>
                ) : (
                  <WindShearPanel
                    data={shearData}
                    isLoading={isLoadingShear}
                    error={shearError}
                    method={shearMethod}
                    targetHeight={shearTargetHeight}
                    onTargetHeightChange={setShearTargetHeight}
                    onMethodChange={setShearMethod}
                    onCreateChannel={handleCreateExtrapolatedChannel}
                    isCreatingChannel={isCreatingExtrapolatedChannel}
                    createChannelError={createChannelError}
                    createdChannelName={createdChannelName}
                  />
                )}
              </div>
            </section>
          ) : (
            <PlaceholderPanel title={analysisTabs.find((tab) => tab.id === activeTab)?.label ?? "Analysis"} description={analysisTabs.find((tab) => tab.id === activeTab)?.description ?? "This analysis module will be added in a later task."} />
          )}
        </>
      ) : null}
    </div>
  );
}