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
  getTurbulenceAnalysis: vi.fn(),
  getAirDensityAnalysis: vi.fn(),
  getExtremeWindAnalysis: vi.fn(),
  getScatterAnalysis: vi.fn(),
  getProfileAnalysis: vi.fn(),
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
  getTurbulenceAnalysis: analysisMocks.getTurbulenceAnalysis,
  getAirDensityAnalysis: analysisMocks.getAirDensityAnalysis,
  getExtremeWindAnalysis: analysisMocks.getExtremeWindAnalysis,
  getScatterAnalysis: analysisMocks.getScatterAnalysis,
  getProfileAnalysis: analysisMocks.getProfileAnalysis,
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

vi.mock("../components/analysis/ScatterPlot", () => ({
  ScatterPlot: ({ data, isLoading, error }: { data: { sample_count: number } | null; isLoading: boolean; error: string | null }) => (
    <div>
      <div>Scatter plot stub</div>
      <div>loading: {String(isLoading)}</div>
      <div>error: {error ?? "none"}</div>
      <div>samples: {data?.sample_count ?? 0}</div>
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
  column_count: 7,
  columns: [
    { id: "dir-1", name: "Dir 80m", measurement_type: "direction", unit: "deg", height_m: 80, sensor_info: null },
    { id: "spd-1", name: "Speed 80m", measurement_type: "speed", unit: "m/s", height_m: 80, sensor_info: null },
    { id: "spd-2", name: "Speed 60m", measurement_type: "speed", unit: "m/s", height_m: 60, sensor_info: null },
    { id: "gst-1", name: "Gust 80m", measurement_type: "gust", unit: "m/s", height_m: 80, sensor_info: null },
    { id: "sd-1", name: "Speed SD 80m", measurement_type: "speed_sd", unit: "m/s", height_m: 80, sensor_info: null },
    { id: "tmp-1", name: "Temp 2m", measurement_type: "temperature", unit: "C", height_m: 2, sensor_info: null },
    { id: "prs-1", name: "Pressure hPa", measurement_type: "pressure", unit: "hPa", height_m: 2, sensor_info: null },
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
  analysisMocks.getTurbulenceAnalysis.mockResolvedValue({
    dataset_id: "dataset-1",
    speed_column_id: "spd-1",
    sd_column_id: "sd-1",
    direction_column_id: "dir-1",
    excluded_flag_ids: [],
    bin_width: 1,
    num_sectors: 12,
    summary: { mean_ti: 0.12, median_ti: 0.11, p90_ti: 0.16, characteristic_ti_15: 0.18, iec_class: "Above IEC Class A", sample_count: 24, mean_speed: 7.4 },
    scatter_points: [
      { speed: 6, ti: 0.1 },
      { speed: 8, ti: 0.11 },
    ],
    speed_bins: [
      { lower: 5, upper: 6, center: 5.5, sample_count: 4, mean_ti: 0.1, representative_ti: 0.12, p90_ti: 0.13, iec_class_a: 0.30, iec_class_b: 0.27, iec_class_c: 0.23 },
      { lower: 6, upper: 7, center: 6.5, sample_count: 4, mean_ti: 0.11, representative_ti: 0.13, p90_ti: 0.14, iec_class_a: 0.26, iec_class_b: 0.22, iec_class_c: 0.20 },
    ],
    direction_bins: Array.from({ length: 12 }, (_, index) => ({ sector_index: index, direction: index * 30, start_angle: index * 30, end_angle: index * 30 + 30, mean_ti: 0.1, representative_ti: 0.12, p90_ti: 0.13, sample_count: 2 })),
    iec_curves: [
      { label: "IEC Class A", reference_intensity: 0.16, points: [{ speed: 5, ti: 0.3 }, { speed: 15, ti: 0.18 }] },
      { label: "IEC Class B", reference_intensity: 0.14, points: [{ speed: 5, ti: 0.26 }, { speed: 15, ti: 0.16 }] },
      { label: "IEC Class C", reference_intensity: 0.12, points: [{ speed: 5, ti: 0.22 }, { speed: 15, ti: 0.14 }] },
    ],
  });
  analysisMocks.getAirDensityAnalysis.mockResolvedValue({
    dataset_id: "dataset-1",
    temperature_column_id: "tmp-1",
    speed_column_id: "spd-1",
    pressure_column_id: "prs-1",
    excluded_flag_ids: [],
    summary: {
      pressure_source: "measured",
      elevation_m: 110,
      estimated_pressure_hpa: null,
      mean_density: 1.224,
      median_density: 1.223,
      std_density: 0.01,
      min_density: 1.21,
      max_density: 1.24,
      mean_wind_power_density: 342,
      annual_wind_power_density: 342,
      sample_count: 24,
    },
    density_points: [
      { timestamp: "2025-01-01T00:00:00Z", density: 1.22, wind_power_density: 320 },
      { timestamp: "2025-01-01T01:00:00Z", density: 1.23, wind_power_density: 345 },
    ],
    monthly: [
      { month: 1, label: "Jan", mean_density: 1.224, mean_wind_power_density: 342, sample_count: 24 },
    ],
  });
  analysisMocks.getExtremeWindAnalysis.mockResolvedValue({
    dataset_id: "dataset-1",
    speed_column_id: "spd-1",
    gust_column_id: "gst-1",
    excluded_flag_ids: [],
    summary: {
      data_source: "gust",
      record_years: 5.1,
      annual_max_count: 5,
      ve10: 36.4,
      ve20: 39.1,
      ve50: 42.8,
      ve100: 45.0,
      gust_factor: 1.34,
      short_record_warning: false,
      warning_message: null,
    },
    gumbel_fit: { location: 28.4, scale: 3.2, sample_count: 5 },
    annual_maxima: [
      { year: 2020, timestamp: "2020-12-01T00:00:00Z", speed_max: 18.5, gust_max: 24.0, analysis_value: 24.0 },
      { year: 2021, timestamp: "2021-12-01T00:00:00Z", speed_max: 19.8, gust_max: 25.7, analysis_value: 25.7 },
    ],
    return_periods: [
      { return_period_years: 10, speed: 36.4, lower_ci: 31.5, upper_ci: 40.1 },
      { return_period_years: 20, speed: 39.1, lower_ci: 33.2, upper_ci: 43.4 },
      { return_period_years: 50, speed: 42.8, lower_ci: 35.9, upper_ci: 47.8 },
      { return_period_years: 100, speed: 45.0, lower_ci: 37.1, upper_ci: 50.5 },
    ],
    return_period_curve: [
      { return_period_years: 2, speed: 28.0, lower_ci: null, upper_ci: null },
      { return_period_years: 10, speed: 36.4, lower_ci: null, upper_ci: null },
      { return_period_years: 50, speed: 42.8, lower_ci: null, upper_ci: null },
    ],
    observed_points: [
      { year: 2020, rank: 2, return_period_years: 3, speed: 24.0 },
      { year: 2021, rank: 1, return_period_years: 6, speed: 25.7 },
    ],
  });
  analysisMocks.getScatterAnalysis.mockResolvedValue({
    dataset_id: "dataset-1",
    x_column_id: "dir-1",
    y_column_id: "spd-1",
    color_column_id: "tmp-1",
    excluded_flag_ids: [],
    total_count: 24,
    sample_count: 24,
    is_downsampled: false,
    points: [
      { x: 0, y: 6, color: 8 },
      { x: 90, y: 8, color: 10 },
    ],
  });
  analysisMocks.getProfileAnalysis.mockResolvedValue({
    dataset_id: "dataset-1",
    column_id: "spd-1",
    excluded_flag_ids: [],
    years_available: [2025],
    diurnal: Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, mean_value: hour < 2 ? 7 + hour : null, std_value: hour < 2 ? 0.4 : null, min_value: hour < 2 ? 6.5 + hour : null, max_value: hour < 2 ? 7.5 + hour : null, sample_count: hour < 2 ? 2 : 0 })),
    monthly: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index], mean_value: index === 0 ? 7.4 : null, std_value: index === 0 ? 0.6 : null, min_value: index === 0 ? 6.8 : null, max_value: index === 0 ? 8.1 : null, sample_count: index === 0 ? 4 : 0 })),
    heatmap: Array.from({ length: 12 * 24 }, (_, index) => ({ month: Math.floor(index / 24) + 1, month_label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Math.floor(index / 24)], hour: index % 24, hour_label: `${String(index % 24).padStart(2, "0")}:00`, mean_value: index < 2 ? 7 + index : null, sample_count: index < 2 ? 2 : 0 })),
    diurnal_by_year: [{ year: 2025, points: Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, mean_value: hour < 2 ? 7 + hour : null, std_value: null, min_value: null, max_value: null, sample_count: hour < 2 ? 2 : 0 })) }],
    monthly_by_year: [{ year: 2025, points: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index], mean_value: index === 0 ? 7.4 : null, std_value: null, min_value: null, max_value: null, sample_count: index === 0 ? 4 : 0 })) }],
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

test("requests turbulence analysis when the turbulence tab is opened", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/wind rose chart stub/i);
  await user.click(screen.getByRole("button", { name: /turbulence/i }));

  await waitFor(() => {
    expect(analysisMocks.getTurbulenceAnalysis).toHaveBeenCalledWith("dataset-1", {
      speed_column_id: "spd-1",
      sd_column_id: "sd-1",
      direction_column_id: "dir-1",
      exclude_flags: [],
      bin_width: 1,
      num_sectors: 12,
    });
  });

  await screen.findByText(/iec turbulence intensity diagnostics/i);
  await screen.findByText(/above iec class a/i);
});

test("requests air density analysis when the air density tab is opened", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/wind rose chart stub/i);
  await user.click(screen.getByRole("button", { name: /air density/i }));

  await waitFor(() => {
    expect(analysisMocks.getAirDensityAnalysis).toHaveBeenCalledWith("dataset-1", {
      temperature_column_id: "tmp-1",
      speed_column_id: "spd-1",
      pressure_column_id: "prs-1",
      pressure_source: "auto",
      elevation_m: undefined,
      exclude_flags: [],
    });
  });

  await screen.findByText(/density and wind power density/i);
  await screen.findByText(/^1.224 kg\/m³$/i, { selector: "div" });
  await screen.findByText(/^342 w\/m²$/i, { selector: "div" });
});

test("requests extreme wind analysis when the extreme wind tab is opened", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/wind rose chart stub/i);
  await user.click(screen.getByRole("button", { name: /extreme wind/i }));

  await waitFor(() => {
    expect(analysisMocks.getExtremeWindAnalysis).toHaveBeenCalledWith("dataset-1", {
      speed_column_id: "spd-1",
      gust_column_id: "gst-1",
      exclude_flags: [],
    });
  });

  await screen.findByText(/extreme wind return periods/i);
  await screen.findByText(/^42.8 m\/s$/i, { selector: "div" });
});

test("requests scatter analysis when the scatter tab is opened", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/wind rose chart stub/i);
  await user.click(screen.getByRole("button", { name: /scatter/i }));

  await waitFor(() => {
    expect(analysisMocks.getScatterAnalysis).toHaveBeenCalledWith("dataset-1", {
      x_column_id: "dir-1",
      y_column_id: "spd-1",
      color_column_id: "tmp-1",
      exclude_flags: [],
    });
  });

  await screen.findByText(/scatter plot stub/i);
  await screen.findByText(/samples: 24/i);
});

test("requests profile analysis when the profiles tab is opened", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/wind rose chart stub/i);
  await user.click(screen.getByRole("button", { name: /profiles/i }));

  await waitFor(() => {
    expect(analysisMocks.getProfileAnalysis).toHaveBeenCalledWith("dataset-1", {
      column_id: "spd-1",
      exclude_flags: [],
      include_yearly_overlays: true,
    });
  });

  await screen.findByText(/daily and monthly profiles for speed 80m/i);
  await screen.findByText(/samples used/i);
  await user.click(screen.getByRole("button", { name: /heatmap/i }));
  await screen.findByRole("heading", { name: /monthly-diurnal heatmap/i });
});