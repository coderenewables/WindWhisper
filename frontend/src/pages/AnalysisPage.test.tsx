import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import { AnalysisPage } from "./AnalysisPage";

const analysisMocks = vi.hoisted(() => ({
  listProjectDatasets: vi.fn(),
  getDataset: vi.fn(),
  listFlags: vi.fn(),
  getWindRoseAnalysis: vi.fn(),
  getHistogramAnalysis: vi.fn(),
  getShearAnalysis: vi.fn(),
  createExtrapolatedChannel: vi.fn(),
  getWeibullAnalysis: vi.fn(),
}));

vi.mock("../api/datasets", () => ({
  listProjectDatasets: analysisMocks.listProjectDatasets,
  getDataset: analysisMocks.getDataset,
}));

vi.mock("../api/qc", () => ({
  listFlags: analysisMocks.listFlags,
}));

vi.mock("../api/analysis", () => ({
  createExtrapolatedChannel: analysisMocks.createExtrapolatedChannel,
  getWindRoseAnalysis: analysisMocks.getWindRoseAnalysis,
  getHistogramAnalysis: analysisMocks.getHistogramAnalysis,
  getShearAnalysis: analysisMocks.getShearAnalysis,
  getWeibullAnalysis: analysisMocks.getWeibullAnalysis,
}));

vi.mock("../stores/projectStore", () => ({
  useProjectStore: () => ({
    projects: [{ id: "project-1", name: "Alpha Site" }],
    fetchProjects: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../components/analysis/WindRoseChart", () => ({
  WindRoseChart: ({ data, isLoading, error }: { data: { total_count: number } | null; isLoading: boolean; error: string | null }) => (
    <div>
      <div>Wind rose chart stub</div>
      <div>loading: {String(isLoading)}</div>
      <div>error: {error ?? "none"}</div>
      <div>samples: {data?.total_count ?? 0}</div>
    </div>
  ),
}));

const datasetDetail = {
  id: "dataset-1",
  project_id: "project-1",
  name: "Mast A",
  source_type: "mast",
  file_name: null,
  time_step_seconds: 600,
  start_time: "2025-01-01T00:00:00Z",
  end_time: "2025-01-02T00:00:00Z",
  created_at: "2025-01-02T00:00:00Z",
  row_count: 144,
  column_count: 4,
  columns: [
    { id: "dir-1", name: "Dir 80m", measurement_type: "direction", unit: "deg", height_m: 80, sensor_info: null },
    { id: "spd-1", name: "Speed 80m", measurement_type: "speed", unit: "m/s", height_m: 80, sensor_info: null },
    { id: "spd-2", name: "Speed 60m", measurement_type: "speed", unit: "m/s", height_m: 60, sensor_info: null },
    { id: "tmp-1", name: "Temp 2m", measurement_type: "temperature", unit: "C", height_m: 2, sensor_info: null },
  ],
};

function renderPage(initialEntry = "/analysis?projectId=project-1&datasetId=dataset-1") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/analysis" element={<AnalysisPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  analysisMocks.listProjectDatasets.mockResolvedValue({ datasets: [{ id: "dataset-1", name: "Mast A" }], total: 1 });
  analysisMocks.getDataset.mockResolvedValue(datasetDetail);
  analysisMocks.listFlags.mockResolvedValue([
    {
      id: "flag-1",
      dataset_id: "dataset-1",
      name: "Icing",
      color: "#1f8f84",
      description: "Cold periods",
      rule_count: 1,
      flagged_count: 2,
    },
  ]);
  analysisMocks.getWindRoseAnalysis.mockResolvedValue({
    dataset_id: "dataset-1",
    direction_column_id: "dir-1",
    value_column_id: "spd-1",
    num_sectors: 12,
    excluded_flag_ids: [],
    total_count: 120,
    sectors: [],
  });
  analysisMocks.getHistogramAnalysis.mockResolvedValue({
    dataset_id: "dataset-1",
    column_id: "spd-1",
    excluded_flag_ids: [],
    bins: [{ lower: 0, upper: 5, count: 5, frequency_pct: 50 }],
    stats: { mean: 5.5, std: 1.2, min: 2, max: 8, median: 5, count: 10, data_recovery_pct: 83.3 },
  });
  analysisMocks.getWeibullAnalysis.mockResolvedValue({
    dataset_id: "dataset-1",
    column_id: "spd-1",
    excluded_flag_ids: [],
    fit: { method: "mle", k: 2.01, A: 7.1, mean_speed: 6.3, mean_power_density: 288.1, r_squared: 0.981, rmse: 0.024, ks_stat: 0.059 },
    curve_points: [
      { x: 0, pdf: 0, frequency_pct: 0 },
      { x: 5, pdf: 0.12, frequency_pct: 15 },
      { x: 10, pdf: 0.04, frequency_pct: 5 },
    ],
  });
  analysisMocks.getShearAnalysis.mockResolvedValue({
    dataset_id: "dataset-1",
    method: "power",
    excluded_flag_ids: [],
    direction_column_id: "dir-1",
    target_height: 100,
    target_mean_speed: 8.4,
    representative_pair: { lower_column_id: "spd-2", upper_column_id: "spd-1", lower_height_m: 60, upper_height_m: 80, mean_value: 0.2, median_value: 0.2, std_value: 0, count: 24 },
    pair_stats: [{ lower_column_id: "spd-2", upper_column_id: "spd-1", lower_height_m: 60, upper_height_m: 80, mean_value: 0.2, median_value: 0.2, std_value: 0, count: 24 }],
    profile_points: [
      { height_m: 60, mean_speed: 7.1, source: "measured" },
      { height_m: 80, mean_speed: 7.6, source: "measured" },
      { height_m: 100, mean_speed: 8.4, source: "extrapolated" },
    ],
    direction_bins: Array.from({ length: 12 }, (_, index) => ({ sector_index: index, direction: index * 30, start_angle: index * 30, end_angle: index * 30 + 30, mean_value: 0.2, median_value: 0.2, std_value: 0, count: 2 })),
    time_of_day: Array.from({ length: 24 }, (_, hour) => ({ hour, mean_value: hour < 2 ? 0.2 : null, median_value: hour < 2 ? 0.2 : null, std_value: hour < 2 ? 0 : null, count: hour < 2 ? 1 : 0 })),
  });
  analysisMocks.createExtrapolatedChannel.mockResolvedValue({
    dataset_id: "dataset-1",
    method: "power",
    target_height: 100,
    excluded_flag_ids: [],
    representative_pair: { lower_column_id: "spd-2", upper_column_id: "spd-1", lower_height_m: 60, upper_height_m: 80, mean_value: 0.2, median_value: 0.2, std_value: 0, count: 24 },
    summary: { mean_speed: 8.4, median_speed: 8.3, std_speed: 0.8, count: 24 },
    timestamps: [],
    values: [],
    created_column: { id: "spd-3", name: "Speed_100m_power", unit: "m/s", measurement_type: "speed", height_m: 100, sensor_info: null },
  });
});

test("requests wind rose analysis with the default dataset channels", async () => {
  renderPage();

  await screen.findByText(/wind rose chart stub/i);

  await waitFor(() => {
    expect(analysisMocks.getWindRoseAnalysis).toHaveBeenCalledWith("dataset-1", {
      direction_column_id: "dir-1",
      value_column_id: "spd-1",
      num_sectors: 12,
      exclude_flags: [],
    });
  });
});

test("refetches wind rose data when a QC flag is excluded", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/exclude icing/i);
  await user.click(screen.getByRole("checkbox"));

  await waitFor(() => {
    expect(analysisMocks.getWindRoseAnalysis).toHaveBeenLastCalledWith("dataset-1", {
      direction_column_id: "dir-1",
      value_column_id: "spd-1",
      num_sectors: 12,
      exclude_flags: ["flag-1"],
    });
  });
});

test("requests histogram analysis when the histogram tab is opened", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/wind rose chart stub/i);
  await user.click(screen.getByRole("button", { name: /histogram/i }));

  await waitFor(() => {
    expect(analysisMocks.getHistogramAnalysis).toHaveBeenCalledWith("dataset-1", {
      column_id: "spd-1",
      num_bins: 24,
      exclude_flags: [],
    });
  });

  await waitFor(() => {
    expect(analysisMocks.getWeibullAnalysis).toHaveBeenCalledWith("dataset-1", {
      column_id: "spd-1",
      num_bins: 24,
      exclude_flags: [],
      method: "mle",
    });
  });
});

test("requests shear analysis and can create an extrapolated channel", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/wind rose chart stub/i);
  await user.click(screen.getByRole("button", { name: /shear/i }));

  await waitFor(() => {
    expect(analysisMocks.getShearAnalysis).toHaveBeenCalledWith("dataset-1", {
      speed_column_ids: ["spd-1", "spd-2"],
      direction_column_id: "dir-1",
      exclude_flags: [],
      method: "power",
      num_sectors: 12,
      target_height: 100,
    });
  });

  await screen.findByText(/vertical profile/i);
  await user.click(screen.getByRole("button", { name: /create extrapolated channel/i }));

  await waitFor(() => {
    expect(analysisMocks.createExtrapolatedChannel).toHaveBeenCalledWith("dataset-1", {
      speed_column_ids: ["spd-1", "spd-2"],
      exclude_flags: [],
      method: "power",
      target_height: 100,
      create_column: true,
    });
  });

  await screen.findByText(/created derived channel: speed_100m_power/i);
});