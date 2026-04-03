import { AlertTriangle, Bot } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAi } from "../ai/AiProvider";
import { createExtrapolatedChannel, getAirDensityAnalysis, getExtremeWindAnalysis, getHistogramAnalysis, getProfileAnalysis, getScatterAnalysis, getShearAnalysis, getTurbulenceAnalysis, getWeibullAnalysis, getWindRoseAnalysis } from "../api/analysis";
import { AirDensityPanel } from "../components/analysis/AirDensityPanel";
import { ExtremeWindPanel } from "../components/analysis/ExtremeWindPanel";
import { InsightBanner } from "../components/ai/InsightBanner";
import { FrequencyHistogram } from "../components/analysis/FrequencyHistogram";
import { ProfilePlots } from "../components/analysis/ProfilePlots";
import { TurbulencePanel } from "../components/analysis/TurbulencePanel";
import { WindShearPanel } from "../components/analysis/WindShearPanel";
import { getDataset, listProjectDatasets } from "../api/datasets";
import { listFlags } from "../api/qc";
import { WindRoseChart } from "../components/analysis/WindRoseChart";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useProjectStore } from "../stores/projectStore";
import type { AirDensityPressureSource, AirDensityResponse, ExtremeWindResponse, HistogramRequest, HistogramResponse, ProfilesResponse, ScatterResponse, ShearMethod, ShearResponse, TurbulenceResponse, WeibullMethod, WeibullResponse, WindRoseResponse } from "../types/analysis";
import type { DatasetColumn, DatasetDetail, DatasetSummary } from "../types/dataset";
import type { Flag } from "../types/qc";

type AnalysisTab = "wind-rose" | "histogram" | "shear" | "turbulence" | "air-density" | "extreme-wind" | "scatter" | "profiles";

const analysisTabs: Array<{ id: AnalysisTab; label: string; description: string }> = [
  { id: "wind-rose", label: "Wind Rose", description: "Directional frequency, mean speed, and energy." },
  { id: "histogram", label: "Histogram", description: "Frequency distributions for any measured channel, with Weibull overlays for wind speed." },
  { id: "shear", label: "Shear", description: "Vertical profile, directional shear, and target-height extrapolation." },
  { id: "turbulence", label: "Turbulence", description: "IEC turbulence intensity analysis by speed bin and direction." },
  { id: "air-density", label: "Air Density", description: "Density and wind power density from measured or estimated pressure." },
  { id: "extreme-wind", label: "Extreme Wind", description: "Annual maxima, Gumbel fit, and long-return wind speeds." },
  { id: "scatter", label: "Scatter", description: "Cross-channel scatterplots, density mode, regression fit, and polar diagnostics." },
  { id: "profiles", label: "Profiles", description: "Diurnal, monthly, and monthly-diurnal profile plots for the selected channel." },
];

const ScatterPlot = lazy(async () => {
  const module = await import("../components/analysis/ScatterPlot");
  return { default: module.ScatterPlot };
});

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
  const [turbulenceData, setTurbulenceData] = useState<TurbulenceResponse | null>(null);
  const [airDensityData, setAirDensityData] = useState<AirDensityResponse | null>(null);
  const [extremeWindData, setExtremeWindData] = useState<ExtremeWindResponse | null>(null);
  const [scatterData, setScatterData] = useState<ScatterResponse | null>(null);
  const [profileData, setProfileData] = useState<ProfilesResponse | null>(null);
  const [weibullData, setWeibullData] = useState<WeibullResponse | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingDatasetDetail, setIsLoadingDatasetDetail] = useState(false);
  const [isLoadingFlags, setIsLoadingFlags] = useState(false);
  const [isLoadingWindRose, setIsLoadingWindRose] = useState(false);
  const [isLoadingHistogram, setIsLoadingHistogram] = useState(false);
  const [isLoadingShear, setIsLoadingShear] = useState(false);
  const [isLoadingTurbulence, setIsLoadingTurbulence] = useState(false);
  const [isLoadingAirDensity, setIsLoadingAirDensity] = useState(false);
  const [isLoadingExtremeWind, setIsLoadingExtremeWind] = useState(false);
  const [isLoadingScatter, setIsLoadingScatter] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isLoadingWeibull, setIsLoadingWeibull] = useState(false);
  const [isCreatingExtrapolatedChannel, setIsCreatingExtrapolatedChannel] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [windRoseError, setWindRoseError] = useState<string | null>(null);
  const [histogramError, setHistogramError] = useState<string | null>(null);
  const [shearError, setShearError] = useState<string | null>(null);
  const [turbulenceError, setTurbulenceError] = useState<string | null>(null);
  const [airDensityError, setAirDensityError] = useState<string | null>(null);
  const [extremeWindError, setExtremeWindError] = useState<string | null>(null);
  const [scatterError, setScatterError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [weibullError, setWeibullError] = useState<string | null>(null);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);
  const [createdChannelName, setCreatedChannelName] = useState<string | null>(null);
  const [showWeibullFit, setShowWeibullFit] = useState(true);
  const [weibullMethod, setWeibullMethod] = useState<WeibullMethod>("mle");
  const [shearMethod, setShearMethod] = useState<ShearMethod>("power");
  const [shearTargetHeight, setShearTargetHeight] = useState("100");
  const [selectedShearDirectionColumnId, setSelectedShearDirectionColumnId] = useState("");
  const [selectedTurbulenceSpeedColumnId, setSelectedTurbulenceSpeedColumnId] = useState("");
  const [selectedTurbulenceSdColumnId, setSelectedTurbulenceSdColumnId] = useState("");
  const [selectedTurbulenceDirectionColumnId, setSelectedTurbulenceDirectionColumnId] = useState("");
  const [turbulenceBinWidth, setTurbulenceBinWidth] = useState("1");
  const [selectedAirTemperatureColumnId, setSelectedAirTemperatureColumnId] = useState("");
  const [selectedAirPressureColumnId, setSelectedAirPressureColumnId] = useState("");
  const [selectedAirSpeedColumnId, setSelectedAirSpeedColumnId] = useState("");
  const [selectedExtremeSpeedColumnId, setSelectedExtremeSpeedColumnId] = useState("");
  const [selectedExtremeGustColumnId, setSelectedExtremeGustColumnId] = useState("");
  const [selectedScatterXColumnId, setSelectedScatterXColumnId] = useState("");
  const [selectedScatterYColumnId, setSelectedScatterYColumnId] = useState("");
  const [selectedScatterColorColumnId, setSelectedScatterColorColumnId] = useState("");
  const [selectedProfileColumnId, setSelectedProfileColumnId] = useState("");
  const [airPressureSource, setAirPressureSource] = useState<AirDensityPressureSource>("auto");
  const [airElevation, setAirElevation] = useState("");
  const { projects, fetchProjects } = useProjectStore();
  const activeProject = projects.find((project) => project.id === projectId) ?? null;

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
      setSelectedTurbulenceSpeedColumnId("");
      setSelectedTurbulenceSdColumnId("");
      setSelectedTurbulenceDirectionColumnId("");
      setSelectedAirTemperatureColumnId("");
      setSelectedAirPressureColumnId("");
      setSelectedAirSpeedColumnId("");
      setSelectedExtremeSpeedColumnId("");
      setSelectedExtremeGustColumnId("");
      setSelectedScatterXColumnId("");
      setSelectedScatterYColumnId("");
      setSelectedScatterColorColumnId("");
      setSelectedProfileColumnId("");
      setAirElevation("");
      setRoseData(null);
      setHistogramData(null);
      setShearData(null);
      setTurbulenceData(null);
      setAirDensityData(null);
      setExtremeWindData(null);
      setScatterData(null);
      setProfileData(null);
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
        setSelectedTurbulenceSpeedColumnId((current) => (isValidColumn(response.columns, current) ? current : response.columns.find((column) => column.measurement_type === "speed")?.id ?? ""));
        setSelectedTurbulenceSdColumnId(
          (current) =>
            (isValidColumn(response.columns, current)
              ? current
              : response.columns.find((column) => column.measurement_type === "speed_sd" || column.measurement_type === "turbulence_intensity")?.id) ?? "",
        );
        setSelectedTurbulenceDirectionColumnId((current) => (isValidColumn(response.columns, current) ? current : getDefaultDirectionColumn(response.columns)));
        setSelectedAirTemperatureColumnId((current) => (isValidColumn(response.columns, current) ? current : response.columns.find((column) => column.measurement_type === "temperature")?.id ?? ""));
        setSelectedAirPressureColumnId((current) => (isValidColumn(response.columns, current) ? current : response.columns.find((column) => column.measurement_type === "pressure")?.id ?? ""));
        setSelectedAirSpeedColumnId((current) => (isValidColumn(response.columns, current) ? current : response.columns.find((column) => column.measurement_type === "speed")?.id ?? ""));
        setSelectedExtremeSpeedColumnId((current) => (isValidColumn(response.columns, current) ? current : response.columns.find((column) => column.measurement_type === "speed")?.id ?? ""));
        setSelectedExtremeGustColumnId((current) => (isValidColumn(response.columns, current) ? current : response.columns.find((column) => column.measurement_type === "gust")?.id ?? ""));
        setSelectedScatterXColumnId((current) => (isValidColumn(response.columns, current) ? current : getDefaultDirectionColumn(response.columns) || getDefaultValueColumn(response.columns)));
        setSelectedScatterYColumnId((current) => (isValidColumn(response.columns, current) ? current : response.columns.find((column) => column.measurement_type === "speed")?.id ?? getDefaultValueColumn(response.columns)));
        setSelectedScatterColorColumnId((current) => (current && isValidColumn(response.columns, current) ? current : response.columns.find((column) => column.measurement_type === "temperature")?.id ?? ""));
        setSelectedProfileColumnId((current) => (isValidColumn(response.columns, current) ? current : getDefaultValueColumn(response.columns)));
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
  const turbulenceSpeedColumns = useMemo(
    () => datasetDetail?.columns.filter((column) => column.measurement_type === "speed") ?? [],
    [datasetDetail],
  );
  const turbulenceSdColumns = useMemo(
    () => datasetDetail?.columns.filter((column) => column.measurement_type === "speed_sd" || column.measurement_type === "turbulence_intensity") ?? [],
    [datasetDetail],
  );
  const temperatureColumns = useMemo(
    () => datasetDetail?.columns.filter((column) => column.measurement_type === "temperature") ?? [],
    [datasetDetail],
  );
  const pressureColumns = useMemo(
    () => datasetDetail?.columns.filter((column) => column.measurement_type === "pressure") ?? [],
    [datasetDetail],
  );
  const gustColumns = useMemo(
    () => datasetDetail?.columns.filter((column) => column.measurement_type === "gust") ?? [],
    [datasetDetail],
  );
  const selectedHistogramColumn = useMemo(
    () => histogramColumns.find((column) => column.id === selectedHistogramColumnId) ?? null,
    [histogramColumns, selectedHistogramColumnId],
  );
  const selectedScatterXColumn = useMemo(
    () => datasetDetail?.columns.find((column) => column.id === selectedScatterXColumnId) ?? null,
    [datasetDetail, selectedScatterXColumnId],
  );
  const selectedScatterYColumn = useMemo(
    () => datasetDetail?.columns.find((column) => column.id === selectedScatterYColumnId) ?? null,
    [datasetDetail, selectedScatterYColumnId],
  );
  const selectedScatterColorColumn = useMemo(
    () => datasetDetail?.columns.find((column) => column.id === selectedScatterColorColumnId) ?? null,
    [datasetDetail, selectedScatterColorColumnId],
  );
  const selectedProfileColumn = useMemo(
    () => datasetDetail?.columns.find((column) => column.id === selectedProfileColumnId) ?? null,
    [datasetDetail, selectedProfileColumnId],
  );
  const histogramColumnLabel = selectedHistogramColumn?.name ?? "selected channel";
  const profileColumnLabel = selectedProfileColumn?.name ?? "selected channel";
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
  const parsedTurbulenceBinWidth = useMemo(() => {
    const parsed = Number(turbulenceBinWidth);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [turbulenceBinWidth]);
  const parsedAirElevation = useMemo(() => {
    const source = airElevation.trim();
    if (!source) {
      return activeProject?.elevation ?? null;
    }
    const parsed = Number(source);
    return Number.isFinite(parsed) ? parsed : activeProject?.elevation ?? null;
  }, [activeProject?.elevation, airElevation]);

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
    if (activeTab !== "turbulence" || !datasetId || !selectedTurbulenceSpeedColumnId || !selectedTurbulenceSdColumnId) {
      setTurbulenceError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingTurbulence(true);
    setTurbulenceError(null);

    void getTurbulenceAnalysis(datasetId, {
      speed_column_id: selectedTurbulenceSpeedColumnId,
      sd_column_id: selectedTurbulenceSdColumnId,
      direction_column_id: selectedTurbulenceDirectionColumnId || undefined,
      exclude_flags: excludedFlagIds,
      bin_width: parsedTurbulenceBinWidth,
      num_sectors: numSectors,
    })
      .then((response) => {
        if (!cancelled) {
          setTurbulenceData(response);
          setIsLoadingTurbulence(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTurbulenceData(null);
          setTurbulenceError(error instanceof Error ? error.message : "Unable to calculate turbulence intensity");
          setIsLoadingTurbulence(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, datasetId, excludedFlagIds, numSectors, parsedTurbulenceBinWidth, selectedTurbulenceDirectionColumnId, selectedTurbulenceSdColumnId, selectedTurbulenceSpeedColumnId]);

  useEffect(() => {
    if (activeTab !== "air-density" || !datasetId || !selectedAirTemperatureColumnId || !selectedAirSpeedColumnId) {
      setAirDensityError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingAirDensity(true);
    setAirDensityError(null);

    void getAirDensityAnalysis(datasetId, {
      temperature_column_id: selectedAirTemperatureColumnId,
      speed_column_id: selectedAirSpeedColumnId,
      pressure_column_id: selectedAirPressureColumnId || undefined,
      pressure_source: airPressureSource,
      elevation_m: parsedAirElevation ?? undefined,
      exclude_flags: excludedFlagIds,
    })
      .then((response) => {
        if (!cancelled) {
          setAirDensityData(response);
          setIsLoadingAirDensity(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAirDensityData(null);
          setAirDensityError(error instanceof Error ? error.message : "Unable to calculate air density");
          setIsLoadingAirDensity(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, airPressureSource, datasetId, excludedFlagIds, parsedAirElevation, selectedAirPressureColumnId, selectedAirSpeedColumnId, selectedAirTemperatureColumnId]);

  useEffect(() => {
    if (activeTab !== "extreme-wind" || !datasetId || !selectedExtremeSpeedColumnId) {
      setExtremeWindError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingExtremeWind(true);
    setExtremeWindError(null);

    void getExtremeWindAnalysis(datasetId, {
      speed_column_id: selectedExtremeSpeedColumnId,
      gust_column_id: selectedExtremeGustColumnId || undefined,
      exclude_flags: excludedFlagIds,
    })
      .then((response) => {
        if (!cancelled) {
          setExtremeWindData(response);
          setIsLoadingExtremeWind(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setExtremeWindData(null);
          setExtremeWindError(error instanceof Error ? error.message : "Unable to calculate extreme wind return periods");
          setIsLoadingExtremeWind(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, datasetId, excludedFlagIds, selectedExtremeGustColumnId, selectedExtremeSpeedColumnId]);

  useEffect(() => {
    if (activeTab !== "scatter" || !datasetId || !selectedScatterXColumnId || !selectedScatterYColumnId) {
      setScatterError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingScatter(true);
    setScatterError(null);

    void getScatterAnalysis(datasetId, {
      x_column_id: selectedScatterXColumnId,
      y_column_id: selectedScatterYColumnId,
      color_column_id: selectedScatterColorColumnId || undefined,
      exclude_flags: excludedFlagIds,
    })
      .then((response) => {
        if (!cancelled) {
          setScatterData(response);
          setIsLoadingScatter(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setScatterData(null);
          setScatterError(error instanceof Error ? error.message : "Unable to build scatter analysis");
          setIsLoadingScatter(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, datasetId, excludedFlagIds, selectedScatterColorColumnId, selectedScatterXColumnId, selectedScatterYColumnId]);

  useEffect(() => {
    if (activeTab !== "profiles" || !datasetId || !selectedProfileColumnId) {
      setProfileError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingProfiles(true);
    setProfileError(null);

    void getProfileAnalysis(datasetId, {
      column_id: selectedProfileColumnId,
      exclude_flags: excludedFlagIds,
      include_yearly_overlays: true,
    })
      .then((response) => {
        if (!cancelled) {
          setProfileData(response);
          setIsLoadingProfiles(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProfileData(null);
          setProfileError(error instanceof Error ? error.message : "Unable to build profile plots");
          setIsLoadingProfiles(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, datasetId, excludedFlagIds, selectedProfileColumnId]);

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

  /* ---- Shared QC flag exclusion toggle helper rendered inline ---- */
  function renderFlagToggles() {
    if (isLoadingFlags) return <span className="text-[11px] text-ink-400">Loading flags…</span>;
    if (flags.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {flags.map((flag) => {
          const excluded = excludedFlagIds.includes(flag.id);
          return (
            <label key={flag.id} className="flex items-center gap-1.5 text-[11px] text-ink-600">
              <input type="checkbox" checked={excluded} onChange={() => toggleExcludedFlag(flag.id)} className="rounded border-ink-300 text-teal-500 focus:ring-teal-500" />
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: flag.color ?? "#94a3b8" }} />
              {flag.name}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold text-ink-900">Analysis</h1>
        <select value={projectId} onChange={(event) => updateSearch({ projectId: event.target.value, datasetId: "" })} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
          <option value="">Project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={datasetId} onChange={(event) => updateSearch({ datasetId: event.target.value })} className="rounded-lg border-ink-200 bg-white py-1 text-xs" disabled={!projectId || isLoadingDatasets || datasets.length === 0}>
          <option value="">Dataset</option>
          {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <AiAnalysisButtons projectId={projectId} activeTab={activeTab} />
      </div>

      {pageError ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 p-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{pageError}</span>
        </div>
      ) : null}

      {!projectId ? <p className="py-8 text-center text-xs text-ink-400">Select a project to begin.</p> : null}
      {projectId && isLoadingDatasets ? <div className="py-8"><LoadingSpinner label="Loading datasets" /></div> : null}
      {projectId && !isLoadingDatasets && datasets.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <p className="text-xs text-ink-500">No datasets.</p>
          <Link to={`/import?projectId=${projectId}`} className="mt-3 text-xs font-medium text-ember-500 hover:underline">Import</Link>
        </div>
      ) : null}

      {datasetDetail && !isLoadingDatasetDetail ? (
        <>
          {/* Tab bar */}
          <div className="flex flex-wrap gap-1 border-b border-ink-100 pb-1">
            {analysisTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  activeTab === tab.id ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* AI insight banners for analysis results */}
          <AnalysisInsightBanners projectId={projectId} />

          {/* ===== Wind Rose ===== */}
          {activeTab === "wind-rose" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedDirectionColumnId} onChange={(e) => setSelectedDirectionColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs" disabled={directionColumns.length === 0}>
                  <option value="">Direction</option>
                  {directionColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={selectedValueColumnId} onChange={(e) => setSelectedValueColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs" disabled={valueColumns.length === 0}>
                  <option value="">Value</option>
                  {valueColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={numSectors} onChange={(e) => setNumSectors(Number(e.target.value) as 12 | 16 | 36)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value={12}>12 sec</option>
                  <option value={16}>16 sec</option>
                  <option value={36}>36 sec</option>
                </select>
                {renderFlagToggles()}
              </div>
              {!selectedDirectionColumnId || !selectedValueColumnId
                ? <p className="py-6 text-center text-xs text-ink-400">Select direction and value columns.</p>
                : <WindRoseChart data={roseData} isLoading={isLoadingWindRose} error={windRoseError} />}
            </div>
          )}

          {/* ===== Histogram ===== */}
          {activeTab === "histogram" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedHistogramColumnId} onChange={(e) => setSelectedHistogramColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">Column</option>
                  {histogramColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" min={1} max={200} value={histogramBins} onChange={(e) => setHistogramBins(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className="w-16 rounded-lg border-ink-200 bg-white py-1 text-xs" placeholder="Bins" />
                <input type="number" min={0} step="any" value={histogramBinWidth} onChange={(e) => setHistogramBinWidth(e.target.value)} placeholder="Bin width" className="w-20 rounded-lg border-ink-200 bg-white py-1 text-xs" />
                {renderFlagToggles()}
              </div>
              {!selectedHistogramColumnId
                ? <p className="py-6 text-center text-xs text-ink-400">Select a column.</p>
                : <FrequencyHistogram data={histogramData} isLoading={isLoadingHistogram} error={histogramError} columnLabel={histogramColumnLabel} isWeibullAvailable={isWeibullAvailable} showWeibullFit={showWeibullFit} onToggleWeibullFit={setShowWeibullFit} weibullMethod={weibullMethod} onChangeWeibullMethod={setWeibullMethod} weibullData={weibullData} isLoadingWeibull={isLoadingWeibull} weibullError={weibullError} />}
            </div>
          )}

          {/* ===== Shear ===== */}
          {activeTab === "shear" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedShearDirectionColumnId} onChange={(e) => setSelectedShearDirectionColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">No dir grouping</option>
                  {directionColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="text-[11px] text-ink-400">{shearSpeedColumns.length} heights</span>
                {renderFlagToggles()}
              </div>
              {shearSpeedColumns.length < 2
                ? <p className="py-6 text-center text-xs text-ink-400">Need 2+ speed columns at different heights.</p>
                : <WindShearPanel data={shearData} isLoading={isLoadingShear} error={shearError} method={shearMethod} targetHeight={shearTargetHeight} onTargetHeightChange={setShearTargetHeight} onMethodChange={setShearMethod} onCreateChannel={handleCreateExtrapolatedChannel} isCreatingChannel={isCreatingExtrapolatedChannel} createChannelError={createChannelError} createdChannelName={createdChannelName} />}
            </div>
          )}

          {/* ===== Turbulence ===== */}
          {activeTab === "turbulence" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedTurbulenceSpeedColumnId} onChange={(e) => setSelectedTurbulenceSpeedColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">Speed</option>
                  {turbulenceSpeedColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={selectedTurbulenceSdColumnId} onChange={(e) => setSelectedTurbulenceSdColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">SD / TI</option>
                  {turbulenceSdColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={selectedTurbulenceDirectionColumnId} onChange={(e) => setSelectedTurbulenceDirectionColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">No dir</option>
                  {directionColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" min={0.1} step={0.1} value={turbulenceBinWidth} onChange={(e) => setTurbulenceBinWidth(e.target.value)} className="w-16 rounded-lg border-ink-200 bg-white py-1 text-xs" placeholder="Bin" />
                {renderFlagToggles()}
              </div>
              {!selectedTurbulenceSpeedColumnId || !selectedTurbulenceSdColumnId
                ? <p className="py-6 text-center text-xs text-ink-400">Select speed and SD/TI columns.</p>
                : <TurbulencePanel data={turbulenceData} isLoading={isLoadingTurbulence} error={turbulenceError} />}
            </div>
          )}

          {/* ===== Air Density ===== */}
          {activeTab === "air-density" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedAirTemperatureColumnId} onChange={(e) => setSelectedAirTemperatureColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">Temp</option>
                  {temperatureColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={selectedAirSpeedColumnId} onChange={(e) => setSelectedAirSpeedColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">Speed</option>
                  {turbulenceSpeedColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={airPressureSource} onChange={(e) => setAirPressureSource(e.target.value as AirDensityPressureSource)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="auto">Auto</option>
                  <option value="measured">Measured</option>
                  <option value="estimated">Estimated</option>
                </select>
                <select value={selectedAirPressureColumnId} onChange={(e) => setSelectedAirPressureColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs" disabled={pressureColumns.length === 0 || airPressureSource === "estimated"}>
                  <option value="">Pressure</option>
                  {pressureColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" step="1" value={airElevation} onChange={(e) => setAirElevation(e.target.value)} placeholder={activeProject?.elevation != null ? `${activeProject.elevation}m` : "Elev"} className="w-16 rounded-lg border-ink-200 bg-white py-1 text-xs" />
                {renderFlagToggles()}
              </div>
              {!selectedAirTemperatureColumnId || !selectedAirSpeedColumnId
                ? <p className="py-6 text-center text-xs text-ink-400">Select temperature and speed.</p>
                : <AirDensityPanel data={airDensityData} isLoading={isLoadingAirDensity} error={airDensityError} />}
            </div>
          )}

          {/* ===== Extreme Wind ===== */}
          {activeTab === "extreme-wind" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedExtremeSpeedColumnId} onChange={(e) => setSelectedExtremeSpeedColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">Speed</option>
                  {turbulenceSpeedColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={selectedExtremeGustColumnId} onChange={(e) => setSelectedExtremeGustColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">Gust</option>
                  {gustColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {renderFlagToggles()}
              </div>
              {!selectedExtremeSpeedColumnId
                ? <p className="py-6 text-center text-xs text-ink-400">Select a speed column.</p>
                : <ExtremeWindPanel data={extremeWindData} isLoading={isLoadingExtremeWind} error={extremeWindError} />}
            </div>
          )}

          {/* ===== Scatter ===== */}
          {activeTab === "scatter" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedScatterXColumnId} onChange={(e) => setSelectedScatterXColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">X axis</option>
                  {datasetDetail.columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={selectedScatterYColumnId} onChange={(e) => setSelectedScatterYColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">Y axis</option>
                  {datasetDetail.columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={selectedScatterColorColumnId} onChange={(e) => setSelectedScatterColorColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">Color</option>
                  {datasetDetail.columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {renderFlagToggles()}
              </div>
              {!selectedScatterXColumnId || !selectedScatterYColumnId
                ? <p className="py-6 text-center text-xs text-ink-400">Select X and Y columns.</p>
                : <Suspense fallback={<LoadingSpinner label="Loading scatter" />}>
                    <ScatterPlot data={scatterData} isLoading={isLoadingScatter} error={scatterError} xColumn={selectedScatterXColumn} yColumn={selectedScatterYColumn} colorColumn={selectedScatterColorColumn} />
                  </Suspense>
              }
            </div>
          )}

          {/* ===== Profiles ===== */}
          {activeTab === "profiles" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedProfileColumnId} onChange={(e) => setSelectedProfileColumnId(e.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
                  <option value="">Column</option>
                  {valueColumns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {renderFlagToggles()}
              </div>
              {!selectedProfileColumnId
                ? <p className="py-6 text-center text-xs text-ink-400">Select a column.</p>
                : <ProfilePlots data={profileData} isLoading={isLoadingProfiles} error={profileError} columnLabel={profileColumnLabel} />}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

/* ---------- AI helper buttons (hidden when AI disabled) ---------- */

function AiAnalysisButtons({ projectId, activeTab }: { projectId: string; activeTab: string }) {
  const { enabled, sendPrompt } = useAi();
  if (!enabled || !projectId) return null;

  return (
    <span className="ml-auto flex items-center gap-1">
      <button
        type="button"
        onClick={() => void sendPrompt(projectId, `Interpret the ${activeTab.replace("-", " ")} results for this dataset and highlight anything notable.`)}
        className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700 transition hover:bg-teal-100 dark:bg-teal-900/20 dark:text-teal-400"
      >
        <Bot className="h-3 w-3" /> Interpret
      </button>
      <button
        type="button"
        onClick={() => void sendPrompt(projectId, "Based on the analyses already completed for this project, suggest what analysis I should run next and why.")}
        className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700 transition hover:bg-teal-100 dark:bg-teal-900/20 dark:text-teal-400"
      >
        <Bot className="h-3 w-3" /> Suggest Next
      </button>
    </span>
  );
}

/* ---------- Contextual insight banners from AI health issues ---------- */

function AnalysisInsightBanners({ projectId }: { projectId: string }) {
  const { enabled, insights, dismissInsight, sendPrompt } = useAi();
  if (!enabled || !projectId) return null;

  const analysisInsights = insights.filter(
    (i) => i.category === "analysis" || i.category === "data_quality" || i.category === "analysis_gap",
  );
  if (analysisInsights.length === 0) return null;

  return (
    <div className="space-y-2">
      {analysisInsights.map((insight) => (
        <InsightBanner
          key={insight.id}
          message={insight.message}
          severity={insight.severity}
          actionLabel={insight.actionLabel}
          onAction={insight.actionPrompt ? () => void sendPrompt(projectId, insight.actionPrompt!) : undefined}
          onDismiss={() => dismissInsight(insight.id)}
        />
      ))}
    </div>
  );
}