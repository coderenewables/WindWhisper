import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import { MCPPage } from "./MCPPage";

const mcpMocks = vi.hoisted(() => ({
  listProjectDatasets: vi.fn(),
  getDataset: vi.fn(),
  getMcpCorrelation: vi.fn(),
  getMcpComparison: vi.fn(),
  getMcpPrediction: vi.fn(),
}));

vi.mock("../api/datasets", () => ({
  listProjectDatasets: mcpMocks.listProjectDatasets,
  getDataset: mcpMocks.getDataset,
}));

vi.mock("../api/analysis", () => ({
  getMcpCorrelation: mcpMocks.getMcpCorrelation,
  getMcpComparison: mcpMocks.getMcpComparison,
  getMcpPrediction: mcpMocks.getMcpPrediction,
}));

vi.mock("../stores/projectStore", () => ({
  useProjectStore: () => ({
    projects: [
      {
        id: "project-1",
        name: "Alpha Site",
        description: "Project",
        latitude: 12,
        longitude: 15,
        elevation: 120,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
        dataset_count: 2,
      },
    ],
    fetchProjects: vi.fn().mockResolvedValue(undefined),
  }),
}));

const datasets = [
  {
    id: "dataset-site",
    project_id: "project-1",
    name: "Site Mast",
    source_type: "mast",
    file_name: null,
    time_step_seconds: 3600,
    start_time: "2025-01-01T00:00:00Z",
    end_time: "2025-03-31T23:00:00Z",
    created_at: "2025-04-01T00:00:00Z",
    row_count: 90,
    column_count: 2,
  },
  {
    id: "dataset-ref",
    project_id: "project-1",
    name: "ERA5 Reference",
    source_type: "reanalysis",
    file_name: null,
    time_step_seconds: 3600,
    start_time: "2025-01-01T00:00:00Z",
    end_time: "2025-04-30T23:00:00Z",
    created_at: "2025-05-01T00:00:00Z",
    row_count: 120,
    column_count: 2,
  },
];

const siteDetail = {
  ...datasets[0],
  columns: [
    { id: "site-80", name: "Site 80m", measurement_type: "speed", unit: "m/s", height_m: 80, sensor_info: null },
    { id: "site-100", name: "Site 100m", measurement_type: "speed", unit: "m/s", height_m: 100, sensor_info: null },
  ],
};

const refDetail = {
  ...datasets[1],
  columns: [
    { id: "ref-100", name: "Ref 100m", measurement_type: "speed", unit: "m/s", height_m: 100, sensor_info: null },
    { id: "ref-120", name: "Ref 120m", measurement_type: "speed", unit: "m/s", height_m: 120, sensor_info: null },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/mcp?projectId=project-1&siteDatasetId=dataset-site&refDatasetId=dataset-ref"]}>
      <Routes>
        <Route path="/mcp" element={<MCPPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mcpMocks.listProjectDatasets.mockResolvedValue({ datasets, total: 2 });
  mcpMocks.getDataset.mockImplementation(async (datasetId: string) => (datasetId === "dataset-site" ? siteDetail : refDetail));
  mcpMocks.getMcpCorrelation.mockResolvedValue({
    site_dataset_id: "dataset-site",
    site_column_id: "site-80",
    ref_dataset_id: "dataset-ref",
    ref_column_id: "ref-100",
    site_column_ids: ["site-80", "site-100"],
    ref_column_ids: ["ref-100", "ref-120"],
    site_excluded_flag_ids: [],
    ref_excluded_flag_ids: [],
    stats: {
      sample_count: 90,
      pearson_r: 0.97,
      r_squared: 0.94,
      rmse: 0.21,
      bias: 0.02,
      slope: 1.04,
      intercept: 0.12,
      concurrent_start: "2025-01-01T00:00:00Z",
      concurrent_end: "2025-03-31T23:00:00Z",
    },
    scatter_points: [
      { timestamp: "2025-01-01T00:00:00Z", site_value: 6.2, ref_value: 5.9, month: 1 },
      { timestamp: "2025-02-01T00:00:00Z", site_value: 7.4, ref_value: 7.0, month: 2 },
    ],
  });
  mcpMocks.getMcpComparison.mockResolvedValue({
    site_dataset_id: "dataset-site",
    site_column_id: "site-80",
    ref_dataset_id: "dataset-ref",
    ref_column_id: "ref-100",
    site_column_ids: ["site-80", "site-100"],
    ref_column_ids: ["ref-100", "ref-120"],
    site_excluded_flag_ids: [],
    ref_excluded_flag_ids: [],
    recommended_method: "matrix",
    results: [
      {
        method: "matrix",
        params: { intercept: 0.4, coefficient_Ref_100m: 0.7, coefficient_Ref_120m: 0.3 },
        stats: { sample_count: 90, pearson_r: 0.99, r_squared: 0.98, rmse: 0.03, bias: 0.0, slope: 0.7, intercept: 0.4, concurrent_start: "2025-01-01T00:00:00Z", concurrent_end: "2025-03-31T23:00:00Z" },
        summary: {
          method: "matrix",
          sample_count: 120,
          start_time: "2025-01-01T00:00:00Z",
          end_time: "2025-04-30T23:00:00Z",
          long_term_mean_speed: 8.12,
          monthly_means: [
            { month: 1, mean_speed: 7.6, sample_count: 31 },
            { month: 2, mean_speed: 8.0, sample_count: 28 },
            { month: 3, mean_speed: 8.2, sample_count: 31 },
          ],
          annual_means: [{ year: 2025, mean_speed: 8.12, sample_count: 120 }],
          weibull: { method: "mle", k: 2.0, A: 7.4, mean_speed: 8.12, mean_power_density: 330, r_squared: 0.98, rmse: 0.03, ks_stat: 0.04 },
        },
        cross_validation: {
          fold_count: 3,
          rmse: 0.03,
          bias: 0,
          skill_score: 0.92,
          uncertainty: 0.03,
          folds: [{ period: "2025-01", sample_count: 31, rmse: 0.03, bias: 0, skill_score: 0.92 }],
        },
        uncertainty: 0.03,
      },
    ],
  });
  mcpMocks.getMcpPrediction.mockResolvedValue({
    site_dataset_id: "dataset-site",
    site_column_id: "site-80",
    ref_dataset_id: "dataset-ref",
    ref_column_id: "ref-100",
    site_column_ids: ["site-80", "site-100"],
    ref_column_ids: ["ref-100", "ref-120"],
    method: "matrix",
    site_excluded_flag_ids: [],
    ref_excluded_flag_ids: [],
    params: { intercept: 0.4, coefficient_Ref_100m: 0.7, coefficient_Ref_120m: 0.3 },
    stats: { sample_count: 90, pearson_r: 0.99, r_squared: 0.98, rmse: 0.03, bias: 0.0, slope: 0.7, intercept: 0.4, concurrent_start: "2025-01-01T00:00:00Z", concurrent_end: "2025-03-31T23:00:00Z" },
    summary: {
      method: "matrix",
      sample_count: 120,
      start_time: "2025-01-01T00:00:00Z",
      end_time: "2025-04-30T23:00:00Z",
      long_term_mean_speed: 8.12,
      monthly_means: [
        { month: 1, mean_speed: 7.6, sample_count: 31 },
        { month: 2, mean_speed: 8.0, sample_count: 28 },
      ],
      annual_means: [{ year: 2025, mean_speed: 8.12, sample_count: 120 }],
      weibull: { method: "mle", k: 2.0, A: 7.4, mean_speed: 8.12, mean_power_density: 330, r_squared: 0.98, rmse: 0.03, ks_stat: 0.04 },
    },
    predicted_points: [
      { timestamp: "2025-01-01T00:00:00Z", value: 7.2 },
      { timestamp: "2025-01-02T00:00:00Z", value: 7.4 },
    ],
    matrix_outputs: [
      {
        site_column_id: "site-80",
        params: { intercept: 0.4, coefficient_Ref_100m: 0.7, coefficient_Ref_120m: 0.3 },
        stats: { sample_count: 90, pearson_r: 0.99, r_squared: 0.98, rmse: 0.03, bias: 0.0, slope: 0.7, intercept: 0.4, concurrent_start: "2025-01-01T00:00:00Z", concurrent_end: "2025-03-31T23:00:00Z" },
        summary: {
          method: "matrix",
          sample_count: 120,
          start_time: "2025-01-01T00:00:00Z",
          end_time: "2025-04-30T23:00:00Z",
          long_term_mean_speed: 8.12,
          monthly_means: [{ month: 1, mean_speed: 7.6, sample_count: 31 }],
          annual_means: [{ year: 2025, mean_speed: 8.12, sample_count: 120 }],
          weibull: { method: "mle", k: 2.0, A: 7.4, mean_speed: 8.12, mean_power_density: 330, r_squared: 0.98, rmse: 0.03, ks_stat: 0.04 },
        },
        predicted_points: [{ timestamp: "2025-01-01T00:00:00Z", value: 7.2 }],
      },
      {
        site_column_id: "site-100",
        params: { intercept: 0.2, coefficient_Ref_100m: 0.5, coefficient_Ref_120m: 0.5 },
        stats: { sample_count: 90, pearson_r: 0.98, r_squared: 0.97, rmse: 0.04, bias: 0.0, slope: 0.5, intercept: 0.2, concurrent_start: "2025-01-01T00:00:00Z", concurrent_end: "2025-03-31T23:00:00Z" },
        summary: {
          method: "matrix",
          sample_count: 120,
          start_time: "2025-01-01T00:00:00Z",
          end_time: "2025-04-30T23:00:00Z",
          long_term_mean_speed: 8.01,
          monthly_means: [{ month: 1, mean_speed: 7.4, sample_count: 31 }],
          annual_means: [{ year: 2025, mean_speed: 8.01, sample_count: 120 }],
          weibull: { method: "mle", k: 1.95, A: 7.2, mean_speed: 8.01, mean_power_density: 320, r_squared: 0.97, rmse: 0.04, ks_stat: 0.05 },
        },
        predicted_points: [{ timestamp: "2025-01-01T00:00:00Z", value: 7.0 }],
      },
    ],
  });
});

test("runs the matrix MCP workflow with additional site and reference channels", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByRole("heading", { name: /correlate short-term site measurements/i });

  await user.click(screen.getByRole("button", { name: /matrix method/i }));
  await user.click(screen.getByRole("checkbox", { name: /site 100m/i }));
  await user.click(screen.getByRole("checkbox", { name: /ref 120m/i }));

  await user.click(screen.getByRole("button", { name: /run correlation/i }));
  await waitFor(() => {
    expect(mcpMocks.getMcpCorrelation).toHaveBeenCalledWith({
      site_dataset_id: "dataset-site",
      site_column_id: "site-80",
      site_column_ids: ["site-100"],
      ref_dataset_id: "dataset-ref",
      ref_column_id: "ref-100",
      ref_column_ids: ["ref-120"],
      max_points: 2500,
    });
  });

  await user.click(screen.getByRole("button", { name: /compare all methods/i }));
  await waitFor(() => {
    expect(mcpMocks.getMcpComparison).toHaveBeenCalledWith({
      site_dataset_id: "dataset-site",
      site_column_id: "site-80",
      site_column_ids: ["site-100"],
      ref_dataset_id: "dataset-ref",
      ref_column_id: "ref-100",
      ref_column_ids: ["ref-120"],
      methods: ["linear", "variance_ratio", "matrix"],
      max_points: 2500,
    });
  });

  expect(await screen.findByText(/recommended: matrix/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /predict with matrix/i }));
  await waitFor(() => {
    expect(mcpMocks.getMcpPrediction).toHaveBeenCalledWith({
      site_dataset_id: "dataset-site",
      site_column_id: "site-80",
      site_column_ids: ["site-100"],
      ref_dataset_id: "dataset-ref",
      ref_column_id: "ref-100",
      ref_column_ids: ["ref-120"],
      method: "matrix",
      max_points: 2500,
      max_prediction_points: 5000,
    });
  });

  expect((await screen.findAllByText(/matrix output/i)).length).toBeGreaterThan(1);
});