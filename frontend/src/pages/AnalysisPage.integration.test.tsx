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
    { id: "temp-2m", name: "Temp 2m", measurement_type: "temperature", unit: "C", height_m: 2, sensor_info: null },
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
  { timestamp: "2025-03-01T00:00:00Z", direction: 350, speed: 5, temp: 7 },
  { timestamp: "2025-03-01T00:10:00Z", direction: 10, speed: 7, temp: 6 },
  { timestamp: "2025-03-01T00:20:00Z", direction: 95, speed: 8, temp: 5 },
  { timestamp: "2025-03-01T00:30:00Z", direction: 185, speed: 9, temp: 4 },
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