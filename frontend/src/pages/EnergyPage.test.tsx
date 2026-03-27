import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import { EnergyPage } from "./EnergyPage";

const energyMocks = vi.hoisted(() => ({
  listProjectDatasets: vi.fn(),
  getDataset: vi.fn(),
  listFlags: vi.fn(),
  listPowerCurves: vi.fn(),
  createPowerCurve: vi.fn(),
  updatePowerCurve: vi.fn(),
  deletePowerCurve: vi.fn(),
  uploadPowerCurve: vi.fn(),
  getEnergyEstimate: vi.fn(),
}));

vi.mock("../api/datasets", () => ({
  listProjectDatasets: energyMocks.listProjectDatasets,
  getDataset: energyMocks.getDataset,
}));

vi.mock("../api/qc", () => ({
  listFlags: energyMocks.listFlags,
}));

vi.mock("../api/analysis", () => ({
  listPowerCurves: energyMocks.listPowerCurves,
  createPowerCurve: energyMocks.createPowerCurve,
  updatePowerCurve: energyMocks.updatePowerCurve,
  deletePowerCurve: energyMocks.deletePowerCurve,
  uploadPowerCurve: energyMocks.uploadPowerCurve,
  getEnergyEstimate: energyMocks.getEnergyEstimate,
}));

vi.mock("../stores/projectStore", () => ({
  useProjectStore: () => ({
    projects: [
      {
        id: "project-1",
        name: "Alpha Site",
        description: "Energy project",
        latitude: 11.2,
        longitude: 76.5,
        elevation: 120,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
        dataset_count: 1,
      },
    ],
    fetchProjects: vi.fn().mockResolvedValue(undefined),
  }),
}));

const datasetSummary = {
  id: "dataset-1",
  project_id: "project-1",
  name: "Hub Mast",
  source_type: "mast",
  file_name: null,
  time_step_seconds: 3600,
  start_time: "2025-01-01T00:00:00Z",
  end_time: "2025-01-31T23:00:00Z",
  created_at: "2025-02-01T00:00:00Z",
  row_count: 744,
  column_count: 3,
};

const datasetDetail = {
  ...datasetSummary,
  columns: [
    { id: "speed-1", name: "Speed 100m", measurement_type: "speed", unit: "m/s", height_m: 100, sensor_info: null },
    { id: "temp-1", name: "Temp 2m", measurement_type: "temperature", unit: "C", height_m: 2, sensor_info: null },
    { id: "press-1", name: "Pressure hPa", measurement_type: "pressure", unit: "hPa", height_m: 2, sensor_info: null },
  ],
};

const savedCurve = {
  id: "curve-1",
  name: "Saved IEC Curve",
  file_name: "saved_iec.csv",
  summary: { point_count: 5, rated_power_kw: 3000, cut_in_speed_ms: 4, rated_speed_ms: 12, cut_out_speed_ms: 25 },
  points: [
    { wind_speed_ms: 0, power_kw: 0 },
    { wind_speed_ms: 4, power_kw: 100 },
    { wind_speed_ms: 8, power_kw: 1350 },
    { wind_speed_ms: 12, power_kw: 3000 },
    { wind_speed_ms: 25, power_kw: 0 },
  ],
  created_at: "2025-03-27T08:00:00Z",
  updated_at: "2025-03-27T08:00:00Z",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/energy?projectId=project-1&datasetId=dataset-1"]}>
      <Routes>
        <Route path="/energy" element={<EnergyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  energyMocks.listProjectDatasets.mockResolvedValue({ datasets: [datasetSummary], total: 1 });
  energyMocks.getDataset.mockResolvedValue(datasetDetail);
  energyMocks.listFlags.mockResolvedValue([
    { id: "flag-1", dataset_id: "dataset-1", name: "Icing", color: "#1f8f84", description: "QC exclusion", rule_count: 1, flagged_count: 3 },
  ]);
  energyMocks.listPowerCurves.mockResolvedValue({ items: [savedCurve], total: 1 });
  energyMocks.createPowerCurve.mockResolvedValue({ ...savedCurve, id: "curve-2", name: "New Saved Curve" });
  energyMocks.updatePowerCurve.mockResolvedValue({ ...savedCurve, name: "Saved IEC Curve Updated" });
  energyMocks.deletePowerCurve.mockResolvedValue(undefined);
  energyMocks.uploadPowerCurve.mockResolvedValue({
    file_name: "uploaded_curve.csv",
    summary: { point_count: 5, rated_power_kw: 3200, cut_in_speed_ms: 3.5, rated_speed_ms: 12, cut_out_speed_ms: 25 },
    points: [
      { wind_speed_ms: 0, power_kw: 0 },
      { wind_speed_ms: 3.5, power_kw: 60 },
      { wind_speed_ms: 8, power_kw: 1500 },
      { wind_speed_ms: 12, power_kw: 3200 },
      { wind_speed_ms: 25, power_kw: 0 },
    ],
  });
  energyMocks.getEnergyEstimate.mockResolvedValue({
    dataset_id: "dataset-1",
    speed_column_id: "speed-1",
    temperature_column_id: null,
    pressure_column_id: null,
    excluded_flag_ids: [],
    air_density_adjustment: false,
    power_curve: savedCurve.points,
    power_curve_summary: savedCurve.summary,
    summary: {
      rated_power_kw: 3000,
      mean_power_kw: 1650,
      annual_energy_mwh: 14454,
      capacity_factor_pct: 55,
      equivalent_full_load_hours: 4818,
      time_step_hours: 1,
      sample_count: 744,
      air_density_adjusted: false,
      pressure_source: null,
      elevation_m: 120,
      estimated_pressure_hpa: null,
    },
    monthly: [{ month: 1, label: "Jan", energy_mwh: 1200, mean_power_kw: 1600, sample_count: 744 }],
    speed_bins: [{ lower: 7, upper: 8, center: 7.5, sample_count: 50, mean_power_kw: 1200, energy_mwh: 60 }],
  });
});

test("loads saved power curves and lets the user update and delete a selected curve", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByRole("heading", { name: /upload or edit a turbine power curve/i });

  await user.selectOptions(screen.getByLabelText(/saved curves/i), "curve-1");
  expect(screen.getByLabelText(/curve name/i)).toHaveValue("Saved IEC Curve");

  const curveNameInput = screen.getByLabelText(/curve name/i);
  await user.clear(curveNameInput);
  await user.type(curveNameInput, "Saved IEC Curve Updated");
  await user.click(screen.getByRole("button", { name: /save curve|update saved curve/i }));

  await waitFor(() => {
    expect(energyMocks.updatePowerCurve).toHaveBeenCalledWith("curve-1", expect.objectContaining({
      name: "Saved IEC Curve Updated",
      points: expect.any(Array),
    }));
  });

  await user.click(screen.getByRole("button", { name: /delete saved curve/i }));
  await waitFor(() => {
    expect(energyMocks.deletePowerCurve).toHaveBeenCalledWith("curve-1");
  });
});


test("can save a new curve and run an energy estimate", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByRole("heading", { name: /gross energy from measured wind speeds/i });

  const curveSelector = screen.getByLabelText(/saved curves/i);
  await user.selectOptions(curveSelector, "");

  const curveNameInput = screen.getByLabelText(/curve name/i);
  await user.clear(curveNameInput);
  await user.type(curveNameInput, "New Saved Curve");
  await user.click(screen.getByRole("button", { name: /^save curve$/i }));

  await waitFor(() => {
    expect(energyMocks.createPowerCurve).toHaveBeenCalledWith(expect.objectContaining({
      name: "New Saved Curve",
      points: expect.any(Array),
    }));
  });

  await user.selectOptions(screen.getByLabelText(/speed channel/i), "speed-1");
  await user.click(screen.getByRole("button", { name: /run estimate/i }));

  await waitFor(() => {
    expect(energyMocks.getEnergyEstimate).toHaveBeenCalledWith("dataset-1", expect.objectContaining({
      speed_column_id: "speed-1",
      power_curve_points: expect.any(Array),
    }));
  });

  expect(await screen.findByText(/14454\.0 mwh/i)).toBeInTheDocument();
});