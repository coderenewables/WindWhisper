import { AlertTriangle, Gauge, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { createPowerCurve, deletePowerCurve, getEnergyEstimate, listPowerCurves, updatePowerCurve, uploadPowerCurve } from "../api/analysis";
import { getDataset, listProjectDatasets } from "../api/datasets";
import { listFlags } from "../api/qc";
import { EnergyEstimatePanel } from "../components/energy/EnergyEstimatePanel";
import { PowerCurveEditor } from "../components/energy/PowerCurveEditor";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useProjectStore } from "../stores/projectStore";
import type { EnergyEstimateResponse, PowerCurveLibraryItem, PowerCurvePoint } from "../types/analysis";
import type { DatasetDetail, DatasetSummary } from "../types/dataset";
import type { Flag } from "../types/qc";

const defaultPowerCurve: PowerCurvePoint[] = [
  { wind_speed_ms: 0, power_kw: 0 },
  { wind_speed_ms: 3, power_kw: 20 },
  { wind_speed_ms: 5, power_kw: 270 },
  { wind_speed_ms: 8, power_kw: 1365 },
  { wind_speed_ms: 10, power_kw: 2430 },
  { wind_speed_ms: 12.5, power_kw: 3000 },
  { wind_speed_ms: 20, power_kw: 3000 },
  { wind_speed_ms: 25, power_kw: 0 },
];

function getDefaultDatasetId(datasets: DatasetSummary[]) {
  return datasets[0]?.id ?? "";
}

export function EnergyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const datasetId = searchParams.get("datasetId") ?? "";
  const { projects, fetchProjects } = useProjectStore();
  const activeProject = projects.find((project) => project.id === projectId) ?? null;

  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetDetail, setDatasetDetail] = useState<DatasetDetail | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [savedCurves, setSavedCurves] = useState<PowerCurveLibraryItem[]>([]);
  const [selectedSavedCurveId, setSelectedSavedCurveId] = useState("");
  const [curveName, setCurveName] = useState("Generic 3 MW");
  const [powerCurvePoints, setPowerCurvePoints] = useState<PowerCurvePoint[]>(defaultPowerCurve);
  const [result, setResult] = useState<EnergyEstimateResponse | null>(null);
  const [selectedSpeedColumnId, setSelectedSpeedColumnId] = useState("");
  const [selectedTemperatureColumnId, setSelectedTemperatureColumnId] = useState("");
  const [selectedPressureColumnId, setSelectedPressureColumnId] = useState("");
  const [excludedFlagIds, setExcludedFlagIds] = useState<string[]>([]);
  const [airDensityAdjustment, setAirDensityAdjustment] = useState(false);
  const [pressureSource, setPressureSource] = useState<"auto" | "measured" | "estimated">("auto");
  const [elevation, setElevation] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingDatasetDetail, setIsLoadingDatasetDetail] = useState(false);
  const [isLoadingFlags, setIsLoadingFlags] = useState(false);
  const [isLoadingCurves, setIsLoadingCurves] = useState(false);
  const [isUploadingCurve, setIsUploadingCurve] = useState(false);
  const [isSavingCurve, setIsSavingCurve] = useState(false);
  const [isDeletingCurve, setIsDeletingCurve] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);

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

        if (!datasetId && response.datasets.length > 0) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("projectId", projectId);
          nextParams.set("datasetId", getDefaultDatasetId(response.datasets));
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
  }, [datasetId, projectId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!datasetId) {
      setDatasetDetail(null);
      setResult(null);
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
        setResult(null);
        setSelectedSpeedColumnId((current) => current && response.columns.some((column) => column.id === current) ? current : response.columns.find((column) => column.measurement_type === "speed")?.id ?? "");
        setSelectedTemperatureColumnId((current) => current && response.columns.some((column) => column.id === current) ? current : response.columns.find((column) => column.measurement_type === "temperature")?.id ?? "");
        setSelectedPressureColumnId((current) => current && response.columns.some((column) => column.id === current) ? current : response.columns.find((column) => column.measurement_type === "pressure")?.id ?? "");
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
    let cancelled = false;
    setIsLoadingCurves(true);
    void listPowerCurves()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setSavedCurves(response.items);
        setIsLoadingCurves(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSaveError(error instanceof Error ? error.message : "Unable to load saved power curves");
          setIsLoadingCurves(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeProject?.elevation != null && !elevation) {
      setElevation(String(activeProject.elevation));
    }
  }, [activeProject?.elevation, elevation]);

  const speedColumns = useMemo(() => datasetDetail?.columns.filter((column) => column.measurement_type === "speed") ?? [], [datasetDetail]);
  const temperatureColumns = useMemo(() => datasetDetail?.columns.filter((column) => column.measurement_type === "temperature") ?? [], [datasetDetail]);
  const pressureColumns = useMemo(() => datasetDetail?.columns.filter((column) => column.measurement_type === "pressure") ?? [], [datasetDetail]);

  const canRunEstimate = useMemo(() => {
    if (!datasetId || !selectedSpeedColumnId || powerCurvePoints.length < 2) {
      return false;
    }
    if (!airDensityAdjustment) {
      return true;
    }
    if (!selectedTemperatureColumnId) {
      return false;
    }
    if (pressureSource === "measured") {
      return Boolean(selectedPressureColumnId);
    }
    if (pressureSource === "estimated") {
      return Boolean(elevation.trim());
    }
    return Boolean(selectedPressureColumnId || elevation.trim());
  }, [airDensityAdjustment, datasetId, elevation, powerCurvePoints.length, pressureSource, selectedPressureColumnId, selectedSpeedColumnId, selectedTemperatureColumnId]);

  function toggleFlag(flagId: string) {
    setExcludedFlagIds((current) => current.includes(flagId) ? current.filter((item) => item !== flagId) : [...current, flagId]);
  }

  async function handleCurveUpload(file: File) {
    setIsUploadingCurve(true);
    setUploadError(null);
    try {
      const response = await uploadPowerCurve(file);
      setPowerCurvePoints(response.points);
      setSelectedSavedCurveId("");
      const fileName = response.file_name?.replace(/\.csv$/i, "").trim();
      if (fileName) {
        setCurveName(fileName);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to parse power curve");
    } finally {
      setIsUploadingCurve(false);
    }
  }

  async function refreshPowerCurves(nextSelectedId?: string) {
    const response = await listPowerCurves();
    setSavedCurves(response.items);
    if (nextSelectedId !== undefined) {
      setSelectedSavedCurveId(nextSelectedId);
      const selected = response.items.find((item) => item.id === nextSelectedId);
      if (selected) {
        setCurveName(selected.name);
      }
    }
  }

  async function handleSaveCurve() {
    const trimmedName = curveName.trim();
    if (!trimmedName || powerCurvePoints.length < 2) {
      return;
    }

    setIsSavingCurve(true);
    setSaveError(null);
    try {
      if (selectedSavedCurveId) {
        const saved = await updatePowerCurve(selectedSavedCurveId, {
          name: trimmedName,
          points: powerCurvePoints,
        });
        await refreshPowerCurves(saved.id);
      } else {
        const saved = await createPowerCurve({
          name: trimmedName,
          points: powerCurvePoints,
        });
        await refreshPowerCurves(saved.id);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save power curve");
    } finally {
      setIsSavingCurve(false);
    }
  }

  async function handleDeleteCurve() {
    if (!selectedSavedCurveId) {
      return;
    }

    setIsDeletingCurve(true);
    setSaveError(null);
    try {
      await deletePowerCurve(selectedSavedCurveId);
      await refreshPowerCurves("");
      setSelectedSavedCurveId("");
      setCurveName("Generic 3 MW");
      setPowerCurvePoints(defaultPowerCurve);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to delete power curve");
    } finally {
      setIsDeletingCurve(false);
    }
  }

  function handleSelectSavedCurve(curveId: string) {
    setSelectedSavedCurveId(curveId);
    setSaveError(null);
    if (!curveId) {
      return;
    }
    const selected = savedCurves.find((curve) => curve.id === curveId);
    if (selected) {
      setCurveName(selected.name);
      setPowerCurvePoints(selected.points);
    }
  }

  async function handleRunEstimate() {
    if (!datasetId || !canRunEstimate) {
      return;
    }

    setIsEstimating(true);
    setEstimateError(null);
    try {
      const response = await getEnergyEstimate(datasetId, {
        speed_column_id: selectedSpeedColumnId,
        power_curve_points: powerCurvePoints,
        exclude_flags: excludedFlagIds,
        air_density_adjustment: airDensityAdjustment,
        ...(airDensityAdjustment && selectedTemperatureColumnId ? { temperature_column_id: selectedTemperatureColumnId } : {}),
        ...(airDensityAdjustment && selectedPressureColumnId ? { pressure_column_id: selectedPressureColumnId } : {}),
        ...(airDensityAdjustment ? { pressure_source: pressureSource } : {}),
        ...(airDensityAdjustment && elevation.trim() ? { elevation_m: Number(elevation) } : {}),
      });
      setResult(response);
    } catch (error) {
      setResult(null);
      setEstimateError(error instanceof Error ? error.message : "Unable to calculate energy estimate");
    } finally {
      setIsEstimating(false);
    }
  }

  const datasetName = datasets.find((dataset) => dataset.id === datasetId)?.name ?? datasetDetail?.name ?? "";

  if (isLoadingDatasets || isLoadingDatasetDetail) {
    return (
      <section className="panel-surface p-6">
        <LoadingSpinner label="Loading energy workspace" />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="panel-surface p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-ember-700">
              <Gauge className="h-3.5 w-3.5" />
              Energy workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-ink-900">Power curve editing and annual gross energy estimates</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-600">
              Build a turbine curve from CSV or manual points, then estimate annual energy, capacity factor, and monthly contributions from any measured wind speed channel.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Project
              <select value={projectId} onChange={(event) => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set("projectId", event.target.value);
                nextParams.delete("datasetId");
                setSearchParams(nextParams, { replace: true });
              }} className="rounded-2xl border-ink-200 bg-white">
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Dataset
              <select value={datasetId} onChange={(event) => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set("projectId", projectId);
                nextParams.set("datasetId", event.target.value);
                setSearchParams(nextParams, { replace: true });
              }} className="rounded-2xl border-ink-200 bg-white">
                <option value="">Select dataset</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {pageError ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{pageError}</div> : null}

        {!datasetId && !pageError ? (
          <div className="mt-5 rounded-[28px] border border-dashed border-ink-200 px-5 py-10 text-sm text-ink-600">
            Choose a project and dataset to start the energy workflow.
          </div>
        ) : null}

        {datasetId ? (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Dataset</div>
              <div className="mt-2 text-lg font-semibold text-ink-900">{datasetName || "Selected dataset"}</div>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Available speed channels</div>
              <div className="mt-2 text-lg font-semibold text-ink-900">{speedColumns.length}</div>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">QC flags</div>
              <div className="mt-2 text-lg font-semibold text-ink-900">{isLoadingFlags ? "..." : flags.length}</div>
            </div>
          </div>
        ) : null}
      </section>

      {datasetId ? (
        <>
          <PowerCurveEditor
            points={powerCurvePoints}
            curveName={curveName}
            savedCurves={savedCurves}
            selectedSavedCurveId={selectedSavedCurveId}
            isUploading={isUploadingCurve}
            isSaving={isSavingCurve || isLoadingCurves}
            isDeleting={isDeletingCurve}
            uploadError={uploadError}
            saveError={saveError}
            onChange={setPowerCurvePoints}
            onCurveNameChange={setCurveName}
            onSelectSavedCurve={handleSelectSavedCurve}
            onUpload={(file) => {
              void handleCurveUpload(file);
            }}
            onUseDefaultCurve={() => {
              setSelectedSavedCurveId("");
              setCurveName("Generic 3 MW");
              setPowerCurvePoints(defaultPowerCurve);
            }}
            onSave={() => {
              void handleSaveCurve();
            }}
            onDelete={() => {
              void handleDeleteCurve();
            }}
          />

          <EnergyEstimatePanel
            data={result}
            isLoading={isEstimating}
            error={estimateError}
            speedColumns={speedColumns}
            temperatureColumns={temperatureColumns}
            pressureColumns={pressureColumns}
            flags={flags}
            selectedSpeedColumnId={selectedSpeedColumnId}
            selectedTemperatureColumnId={selectedTemperatureColumnId}
            selectedPressureColumnId={selectedPressureColumnId}
            excludedFlagIds={excludedFlagIds}
            airDensityAdjustment={airDensityAdjustment}
            pressureSource={pressureSource}
            elevation={elevation}
            canRun={canRunEstimate}
            onSpeedColumnChange={setSelectedSpeedColumnId}
            onTemperatureColumnChange={setSelectedTemperatureColumnId}
            onPressureColumnChange={setSelectedPressureColumnId}
            onToggleFlag={toggleFlag}
            onAirDensityAdjustmentChange={setAirDensityAdjustment}
            onPressureSourceChange={setPressureSource}
            onElevationChange={setElevation}
            onRunEstimate={() => {
              void handleRunEstimate();
            }}
          />
        </>
      ) : (
        <section className="panel-surface p-6">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <div>
              Import a dataset with at least one wind speed column before using the energy workspace.
              <div className="mt-2">
                <Link to="/import" className="inline-flex items-center gap-2 rounded-full border border-amber-300 px-3 py-1 font-medium text-amber-900 transition hover:bg-amber-100">
                  <UploadCloud className="h-3.5 w-3.5" />
                  Go to import
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}