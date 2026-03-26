import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { apiClient } from "../api/client";
import { useProjectStore } from "../stores/projectStore";
import { AnalysisPage } from "./AnalysisPage";

const seededProject = {
  id: "project-seeded",
  name: "Seeded Analysis Site",
  description: "Integration seed",
  latitude: 52.1,
  longitude: 4.3,
  elevation: 12,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  dataset_count: 1,
};

const seededDatasetSummary = {
  id: "dataset-seeded",
  project_id: seededProject.id,
  name: "Seeded Mast",
  source_type: "mast",
  file_name: null,
  time_step_seconds: 600,
  start_time: "2025-03-01T00:00:00Z",
  end_time: "2025-03-01T00:30:00Z",
  created_at: "2025-03-01T00:40:00Z",
  row_count: 4,
  column_count: 3,
};

const seededDatasetDetail = {
  ...seededDatasetSummary,
  columns: [
    { id: "dir-80m", name: "Dir 80m", measurement_type: "direction", unit: "deg", height_m: 80, sensor_info: null },
    { id: "spd-80m", name: "Speed 80m", measurement_type: "speed", unit: "m/s", height_m: 80, sensor_info: null },
    { id: "spd-60m", name: "Speed 60m", measurement_type: "speed", unit: "m/s", height_m: 60, sensor_info: null },
    { id: "sd-80m", name: "Speed SD 80m", measurement_type: "speed_sd", unit: "m/s", height_m: 80, sensor_info: null },
    { id: "temp-2m", name: "Temp 2m", measurement_type: "temperature", unit: "C", height_m: 2, sensor_info: null },
    { id: "press-2m", name: "Pressure hPa", measurement_type: "pressure", unit: "hPa", height_m: 2, sensor_info: null },
  ],
};

const seededFlags = [
  {
    id: "flag-exclude-south",
    dataset_id: seededDatasetSummary.id,
    name: "Exclude south",
    color: "#ef4444",
    description: "Manual exclusion",
    rule_count: 0,
    flagged_count: 1,
  },
];

const seededRows = [
  { timestamp: "2025-03-01T00:00:00Z", direction: 350, speed: 5, temp: 7, pressure: 1013.2 },
  { timestamp: "2025-03-01T00:10:00Z", direction: 10, speed: 7, temp: 6, pressure: 1012.4 },
  { timestamp: "2025-03-01T00:20:00Z", direction: 95, speed: 8, temp: 5, pressure: 1011.9 },
  { timestamp: "2025-03-01T00:30:00Z", direction: 185, speed: 9, temp: 4, pressure: 1010.8 },
];

const excludedTimestamps = new Set(["2025-03-01T00:30:00Z"]);

function makeResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} } as InternalAxiosRequestConfig,
  };
}

function getVisibleRows(excludeFlagIds: string[]) {
  if (!excludeFlagIds.includes(seededFlags[0].id)) {
    return seededRows;
  }
  return seededRows.filter((row) => !excludedTimestamps.has(row.timestamp));
}

function buildWindRoseResponse(payload: Record<string, unknown>) {
  const visibleRows = getVisibleRows(Array.isArray(payload.exclude_flags) ? (payload.exclude_flags as string[]) : []);
  const sectors = Array.from({ length: Number(payload.num_sectors ?? 12) }, (_, sectorIndex) => {
    const sectorWidth = 360 / Number(payload.num_sectors ?? 12);
    const startAngle = (sectorIndex * sectorWidth - sectorWidth / 2 + 360) % 360;
    const endAngle = (sectorIndex * sectorWidth + sectorWidth / 2) % 360;
    const rows = visibleRows.filter((row) => {
      const shifted = (row.direction + sectorWidth / 2) % 360;
      return Math.floor(shifted / sectorWidth) === sectorIndex;
    });
    return {
      sector_index: sectorIndex,
      direction: sectorIndex * sectorWidth,
      start_angle: startAngle,
      end_angle: endAngle,
      sample_count: rows.length,
      frequency: visibleRows.length ? (rows.length / visibleRows.length) * 100 : 0,
      mean_value: rows.length ? rows.reduce((sum, row) => sum + row.speed, 0) / rows.length : null,
      energy: rows.reduce((sum, row) => sum + row.speed ** 3, 0),
      speed_bins: [
        { label: "0-3", lower: 0, upper: 3, count: rows.filter((row) => row.speed >= 0 && row.speed < 3).length, frequency_pct: 0 },
        { label: "3-6", lower: 3, upper: 6, count: rows.filter((row) => row.speed >= 3 && row.speed < 6).length, frequency_pct: visibleRows.length ? (rows.filter((row) => row.speed >= 3 && row.speed < 6).length / visibleRows.length) * 100 : 0 },
        { label: "6-9", lower: 6, upper: 9, count: rows.filter((row) => row.speed >= 6 && row.speed < 9).length, frequency_pct: visibleRows.length ? (rows.filter((row) => row.speed >= 6 && row.speed < 9).length / visibleRows.length) * 100 : 0 },
        { label: "9-12", lower: 9, upper: 12, count: rows.filter((row) => row.speed >= 9 && row.speed < 12).length, frequency_pct: visibleRows.length ? (rows.filter((row) => row.speed >= 9 && row.speed < 12).length / visibleRows.length) * 100 : 0 },
        { label: "12-15", lower: 12, upper: 15, count: 0, frequency_pct: 0 },
        { label: "15+", lower: 15, upper: null, count: 0, frequency_pct: 0 },
      ],
    };
  });

  return {
    dataset_id: seededDatasetSummary.id,
    direction_column_id: String(payload.direction_column_id),
    value_column_id: String(payload.value_column_id),
    num_sectors: Number(payload.num_sectors ?? 12),
    excluded_flag_ids: Array.isArray(payload.exclude_flags) ? payload.exclude_flags : [],
    total_count: visibleRows.length,
    sectors,
  };
}

function buildHistogramResponse(payload: Record<string, unknown>) {
  const visibleRows = getVisibleRows(Array.isArray(payload.exclude_flags) ? (payload.exclude_flags as string[]) : []);
  const columnId = String(payload.column_id);
  const values = visibleRows.map((row) => {
    if (columnId === "temp-2m") {
      return row.temp;
    }
    return row.speed;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const numBins = Number(payload.num_bins ?? 24);
  const autoWidth = ((max - min) || 1) / numBins;
  const widthSource = payload.bin_width ?? autoWidth;
  const width = Number(widthSource || 1);
  const edges = Array.from({ length: numBins + 1 }, (_, index) => min + index * width);
  edges[edges.length - 1] = Math.max(edges[edges.length - 1], max);

  const counts = Array.from({ length: numBins }, () => 0);
  values.forEach((value) => {
    const index = Math.min(numBins - 1, Math.max(0, Math.floor((value - min) / width)));
    counts[index] += 1;
  });

  return {
    dataset_id: seededDatasetSummary.id,
    column_id: columnId,
    excluded_flag_ids: Array.isArray(payload.exclude_flags) ? payload.exclude_flags : [],
    bins: counts.map((count, index) => ({
      lower: edges[index],
      upper: edges[index + 1],
      count,
      frequency_pct: values.length ? (count / values.length) * 100 : 0,
    })),
    stats: {
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      std: Math.sqrt(values.reduce((sum, value) => sum + (value - values.reduce((acc, item) => acc + item, 0) / values.length) ** 2, 0) / values.length),
      min,
      max,
      median: [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)],
      count: values.length,
      data_recovery_pct: (values.length / seededRows.length) * 100,
    },
  };
}

function buildWeibullResponse(payload: Record<string, unknown>) {
  const visibleRows = getVisibleRows(Array.isArray(payload.exclude_flags) ? (payload.exclude_flags as string[]) : []);
  const values = visibleRows.map((row) => row.speed);
  const method = payload.method === "moments" ? "moments" : "mle";
  const A = method === "moments" ? 7.52 : 7.24;
  const k = method === "moments" ? 2.11 : 1.98;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const numBins = Number(payload.num_bins ?? 24);
  const binWidth = ((max - min) || 1) / numBins;
  const points = Array.from({ length: 120 }, (_, index) => {
    const x = min + ((max - min) * index) / 119;
    const scaled = x / A;
    const pdf = x <= 0 ? 0 : (k / A) * scaled ** (k - 1) * Math.exp(-(scaled ** k));
    return {
      x,
      pdf,
      frequency_pct: pdf * binWidth * 100,
    };
  });

  return {
    dataset_id: seededDatasetSummary.id,
    column_id: String(payload.column_id),
    excluded_flag_ids: Array.isArray(payload.exclude_flags) ? payload.exclude_flags : [],
    fit: {
      method,
      k,
      A,
      mean_speed: method === "moments" ? 6.82 : 6.61,
      mean_power_density: method === "moments" ? 249.4 : 236.2,
      r_squared: method === "moments" ? 0.966 : 0.978,
      rmse: method === "moments" ? 0.031 : 0.024,
      ks_stat: method === "moments" ? 0.084 : 0.061,
    },
    curve_points: points,
  };
}

function buildShearResponse(payload: Record<string, unknown>) {
  const visibleRows = getVisibleRows(Array.isArray(payload.exclude_flags) ? (payload.exclude_flags as string[]) : []);
  const method = payload.method === "log" ? "log" : "power";
  const targetHeight = Number(payload.target_height ?? 100);
  return {
    dataset_id: seededDatasetSummary.id,
    method,
    excluded_flag_ids: Array.isArray(payload.exclude_flags) ? payload.exclude_flags : [],
    direction_column_id: String(payload.direction_column_id ?? "dir-80m"),
    target_height: targetHeight,
    target_mean_speed: 8.64,
    representative_pair: { lower_column_id: "spd-60m", upper_column_id: "spd-80m", lower_height_m: 60, upper_height_m: 80, mean_value: method === "log" ? 0.42 : 0.19, median_value: method === "log" ? 0.41 : 0.19, std_value: 0.02, count: visibleRows.length },
    pair_stats: [{ lower_column_id: "spd-60m", upper_column_id: "spd-80m", lower_height_m: 60, upper_height_m: 80, mean_value: method === "log" ? 0.42 : 0.19, median_value: method === "log" ? 0.41 : 0.19, std_value: 0.02, count: visibleRows.length }],
    profile_points: [
      { height_m: 60, mean_speed: 6.81, source: "measured" },
      { height_m: 80, mean_speed: 7.34, source: "measured" },
      { height_m: targetHeight, mean_speed: 8.64, source: "extrapolated" },
    ],
    direction_bins: Array.from({ length: Number(payload.num_sectors ?? 12) }, (_, index) => ({
      sector_index: index,
      direction: index * (360 / Number(payload.num_sectors ?? 12)),
      start_angle: index * (360 / Number(payload.num_sectors ?? 12)),
      end_angle: (index + 1) * (360 / Number(payload.num_sectors ?? 12)),
      mean_value: method === "log" ? 0.42 : 0.19,
      median_value: method === "log" ? 0.41 : 0.19,
      std_value: 0.02,
      count: index < visibleRows.length ? 1 : 0,
    })),
    time_of_day: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      mean_value: hour === 0 ? (method === "log" ? 0.42 : 0.19) : null,
      median_value: hour === 0 ? (method === "log" ? 0.41 : 0.19) : null,
      std_value: hour === 0 ? 0.02 : null,
      count: hour === 0 ? visibleRows.length : 0,
    })),
  };
}

function buildTurbulenceResponse(payload: Record<string, unknown>) {
  const visibleRows = getVisibleRows(Array.isArray(payload.exclude_flags) ? (payload.exclude_flags as string[]) : []);
  const speedValues = visibleRows.map((row) => row.speed);
  const tiValues = visibleRows.map((row) => 0.11 + row.speed * 0.004);
  const directionBins = Array.from({ length: Number(payload.num_sectors ?? 12) }, (_, index) => ({
    sector_index: index,
    direction: index * (360 / Number(payload.num_sectors ?? 12)),
    start_angle: index * (360 / Number(payload.num_sectors ?? 12)),
    end_angle: (index + 1) * (360 / Number(payload.num_sectors ?? 12)),
    mean_ti: index < visibleRows.length ? tiValues[index % tiValues.length] : null,
    representative_ti: index < visibleRows.length ? tiValues[index % tiValues.length] + 0.02 : null,
    p90_ti: index < visibleRows.length ? tiValues[index % tiValues.length] + 0.03 : null,
    sample_count: index < visibleRows.length ? 1 : 0,
  }));
  return {
    dataset_id: seededDatasetSummary.id,
    speed_column_id: String(payload.speed_column_id),
    sd_column_id: String(payload.sd_column_id),
    direction_column_id: String(payload.direction_column_id ?? "dir-80m"),
    excluded_flag_ids: Array.isArray(payload.exclude_flags) ? payload.exclude_flags : [],
    bin_width: Number(payload.bin_width ?? 1),
    num_sectors: Number(payload.num_sectors ?? 12),
    summary: {
      mean_ti: tiValues.reduce((sum, value) => sum + value, 0) / tiValues.length,
      median_ti: [...tiValues].sort((left, right) => left - right)[Math.floor(tiValues.length / 2)],
      p90_ti: [...tiValues].sort((left, right) => left - right)[Math.floor(tiValues.length * 0.9)],
      characteristic_ti_15: 0.185,
      iec_class: "Above IEC Class A",
      sample_count: tiValues.length,
      mean_speed: speedValues.reduce((sum, value) => sum + value, 0) / speedValues.length,
    },
    scatter_points: visibleRows.map((row) => ({ speed: row.speed, ti: 0.11 + row.speed * 0.004 })),
    speed_bins: [
      { lower: 5, upper: 7, center: 6, sample_count: 2, mean_ti: 0.135, representative_ti: 0.155, p90_ti: 0.16, iec_class_a: 0.269, iec_class_b: 0.235, iec_class_c: 0.202 },
      { lower: 7, upper: 9, center: 8, sample_count: 2, mean_ti: 0.143, representative_ti: 0.163, p90_ti: 0.168, iec_class_a: 0.232, iec_class_b: 0.203, iec_class_c: 0.174 },
    ],
    direction_bins: directionBins,
    iec_curves: [
      { label: "IEC Class A", reference_intensity: 0.16, points: [{ speed: 5, ti: 0.299 }, { speed: 10, ti: 0.21 }, { speed: 15, ti: 0.18 }] },
      { label: "IEC Class B", reference_intensity: 0.14, points: [{ speed: 5, ti: 0.262 }, { speed: 10, ti: 0.184 }, { speed: 15, ti: 0.157 }] },
      { label: "IEC Class C", reference_intensity: 0.12, points: [{ speed: 5, ti: 0.224 }, { speed: 10, ti: 0.158 }, { speed: 15, ti: 0.135 }] },
    ],
  };
}

function buildAirDensityResponse(payload: Record<string, unknown>) {
  const visibleRows = getVisibleRows(Array.isArray(payload.exclude_flags) ? (payload.exclude_flags as string[]) : []);
  const pressureSource = payload.pressure_source === "estimated" ? "estimated" : "measured";
  const elevation = typeof payload.elevation_m === "number" ? payload.elevation_m : seededProject.elevation;
  const densityPoints = visibleRows.map((row) => {
    const pressure = pressureSource === "estimated" ? 1011.8 : row.pressure;
    const density = (pressure * 100) / (287.05 * (row.temp + 273.15));
    return {
      timestamp: row.timestamp,
      density,
      wind_power_density: 0.5 * density * row.speed ** 3,
    };
  });
  const meanDensity = densityPoints.reduce((sum, point) => sum + point.density, 0) / densityPoints.length;
  const meanWpd = densityPoints.reduce((sum, point) => sum + point.wind_power_density, 0) / densityPoints.length;
  return {
    dataset_id: seededDatasetSummary.id,
    temperature_column_id: String(payload.temperature_column_id),
    speed_column_id: String(payload.speed_column_id),
    pressure_column_id: payload.pressure_column_id ? String(payload.pressure_column_id) : null,
    excluded_flag_ids: Array.isArray(payload.exclude_flags) ? payload.exclude_flags : [],
    summary: {
      pressure_source: pressureSource,
      elevation_m: elevation,
      estimated_pressure_hpa: pressureSource === "estimated" ? 1011.8 : null,
      mean_density: meanDensity,
      median_density: meanDensity,
      std_density: 0.004,
      min_density: Math.min(...densityPoints.map((point) => point.density)),
      max_density: Math.max(...densityPoints.map((point) => point.density)),
      mean_wind_power_density: meanWpd,
      annual_wind_power_density: meanWpd,
      sample_count: densityPoints.length,
    },
    density_points: densityPoints,
    monthly: [
      {
        month: 3,
        label: "Mar",
        mean_density: meanDensity,
        mean_wind_power_density: meanWpd,
        sample_count: densityPoints.length,
      },
    ],
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/analysis?projectId=${seededProject.id}&datasetId=${seededDatasetSummary.id}`]}>
      <Routes>
        <Route path="/analysis" element={<AnalysisPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  useProjectStore.setState({
    projects: [],
    activeProject: null,
    total: 0,
    isLoadingProjects: false,
    isSubmitting: false,
    error: null,
  });

  vi.spyOn(apiClient, "get").mockImplementation(async (url) => {
    if (url === "/projects") {
      return makeResponse({ projects: [seededProject], total: 1 });
    }
    if (url === `/projects/${seededProject.id}/datasets`) {
      return makeResponse({ datasets: [seededDatasetSummary], total: 1 });
    }
    if (url === `/datasets/${seededDatasetSummary.id}`) {
      return makeResponse(seededDatasetDetail);
    }
    if (url === `/qc/flags/${seededDatasetSummary.id}`) {
      return makeResponse(seededFlags);
    }
    throw new Error(`Unhandled GET ${String(url)}`);
  });

  vi.spyOn(apiClient, "post").mockImplementation(async (url, payload) => {
    if (url === `/analysis/wind-rose/${seededDatasetSummary.id}`) {
      return makeResponse(buildWindRoseResponse(payload as Record<string, unknown>));
    }
    if (url === `/analysis/histogram/${seededDatasetSummary.id}`) {
      return makeResponse(buildHistogramResponse(payload as Record<string, unknown>));
    }
    if (url === `/analysis/weibull/${seededDatasetSummary.id}`) {
      return makeResponse(buildWeibullResponse(payload as Record<string, unknown>));
    }
    if (url === `/analysis/shear/${seededDatasetSummary.id}`) {
      return makeResponse(buildShearResponse(payload as Record<string, unknown>));
    }
    if (url === `/analysis/turbulence/${seededDatasetSummary.id}`) {
      return makeResponse(buildTurbulenceResponse(payload as Record<string, unknown>));
    }
    if (url === `/analysis/air-density/${seededDatasetSummary.id}`) {
      return makeResponse(buildAirDensityResponse(payload as Record<string, unknown>));
    }
    if (url === `/analysis/extrapolate/${seededDatasetSummary.id}`) {
      return makeResponse({
        dataset_id: seededDatasetSummary.id,
        method: payload && (payload as Record<string, unknown>).method === "log" ? "log" : "power",
        target_height: Number((payload as Record<string, unknown>).target_height ?? 100),
        excluded_flag_ids: Array.isArray((payload as Record<string, unknown>).exclude_flags) ? (payload as Record<string, unknown>).exclude_flags : [],
        representative_pair: { lower_column_id: "spd-60m", upper_column_id: "spd-80m", lower_height_m: 60, upper_height_m: 80, mean_value: 0.19, median_value: 0.19, std_value: 0.02, count: 4 },
        summary: { mean_speed: 8.64, median_speed: 8.54, std_speed: 0.63, count: 4 },
        timestamps: seededRows.map((row) => row.timestamp),
        values: seededRows.map((row) => row.speed * 1.15),
        created_column: { id: "spd-100m", name: "Speed_100m_power", unit: "m/s", measurement_type: "speed", height_m: 100, sensor_info: null },
      });
    }
    throw new Error(`Unhandled POST ${String(url)}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("switches the live analysis page from wind rose to histogram using seeded backend data", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/samples used/i);

  await user.click(screen.getByRole("button", { name: /histogram/i }));

  await screen.findByText(/distribution of speed 80m/i);
  await screen.findByText("100.0%");
  await screen.findByText(/k parameter/i);
  expect(screen.getByText(/maximum likelihood/i)).toBeInTheDocument();

  await user.click(screen.getByLabelText(/exclude south/i));

  await waitFor(() => {
    expect(screen.getByText("75.0%")).toBeInTheDocument();
  });

  const binInput = screen.getByLabelText(/number of bins/i);
  await user.click(binInput);
  await user.keyboard("{Control>}a{/Control}4");

  await waitFor(() => {
    expect(apiClient.post).toHaveBeenCalledWith(`/analysis/histogram/${seededDatasetSummary.id}`, {
      column_id: "spd-80m",
      num_bins: 4,
      exclude_flags: [seededFlags[0].id],
    });
  });

  await user.click(screen.getByLabelText(/moments/i));

  await waitFor(() => {
    expect(apiClient.post).toHaveBeenCalledWith(`/analysis/weibull/${seededDatasetSummary.id}`, {
      column_id: "spd-80m",
      num_bins: 4,
      exclude_flags: [seededFlags[0].id],
      method: "moments",
    });
  });

  await screen.findByText(/wasp moments/i);
});

test("renders shear analysis and saves an extrapolated channel using seeded backend data", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/samples used/i);
  await user.click(screen.getByRole("button", { name: /shear/i }));

  await screen.findByText(/vertical profile/i);
  expect(await screen.findAllByText(/60m to 80m/i)).not.toHaveLength(0);
  await screen.findByText(/target mean speed/i);

  await user.click(screen.getByRole("button", { name: /create extrapolated channel/i }));

  await waitFor(() => {
    expect(apiClient.post).toHaveBeenCalledWith(`/analysis/extrapolate/${seededDatasetSummary.id}`, {
      speed_column_ids: ["spd-80m", "spd-60m"],
      exclude_flags: [],
      method: "power",
      target_height: 100,
      create_column: true,
    });
  });

  await screen.findByText(/created derived channel: speed_100m_power/i);
});

test("renders turbulence analysis using seeded backend data", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/samples used/i);
  await user.click(screen.getByRole("button", { name: /turbulence/i }));

  await screen.findByText(/iec turbulence intensity diagnostics/i);
  await screen.findByText(/characteristic ti at 15 m\/s/i);
  await screen.findByText(/above iec class a/i);

  await waitFor(() => {
    expect(apiClient.post).toHaveBeenCalledWith(`/analysis/turbulence/${seededDatasetSummary.id}`, {
      speed_column_id: "spd-80m",
      sd_column_id: "sd-80m",
      direction_column_id: "dir-80m",
      exclude_flags: [],
      bin_width: 1,
      num_sectors: 12,
    });
  });
});

test("renders air density analysis using seeded backend data", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/samples used/i);
  await user.click(screen.getByRole("button", { name: /air density/i }));

  await screen.findByText(/density and wind power density/i);
  await screen.findByText(/mean density/i);
  await screen.findByText(/mean wind power density/i, { selector: "div" });

  await waitFor(() => {
    expect(apiClient.post).toHaveBeenCalledWith(`/analysis/air-density/${seededDatasetSummary.id}`, {
      temperature_column_id: "temp-2m",
      speed_column_id: "spd-80m",
      pressure_column_id: "press-2m",
      pressure_source: "auto",
      elevation_m: 12,
      exclude_flags: [],
    });
  });
});