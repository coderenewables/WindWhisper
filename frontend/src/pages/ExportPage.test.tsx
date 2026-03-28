import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import { ExportPage } from "./ExportPage";


const exportMocks = vi.hoisted(() => ({
  listPowerCurves: vi.fn(),
  listProjectDatasets: vi.fn(),
  getDataset: vi.fn(),
  listFlags: vi.fn(),
  downloadCsvExport: vi.fn(),
  downloadWaspTabExport: vi.fn(),
  downloadIeaJsonExport: vi.fn(),
  downloadOpenwindExport: vi.fn(),
  downloadProjectReport: vi.fn(),
}));


vi.mock("../api/analysis", () => ({
  listPowerCurves: exportMocks.listPowerCurves,
}));


vi.mock("../api/datasets", () => ({
  listProjectDatasets: exportMocks.listProjectDatasets,
  getDataset: exportMocks.getDataset,
}));


vi.mock("../api/qc", () => ({
  listFlags: exportMocks.listFlags,
}));


vi.mock("../api/export", () => ({
  downloadCsvExport: exportMocks.downloadCsvExport,
  downloadWaspTabExport: exportMocks.downloadWaspTabExport,
  downloadIeaJsonExport: exportMocks.downloadIeaJsonExport,
  downloadOpenwindExport: exportMocks.downloadOpenwindExport,
}));


vi.mock("../api/reports", () => ({
  downloadProjectReport: exportMocks.downloadProjectReport,
}));


vi.mock("../stores/projectStore", () => ({
  useProjectStore: () => ({
    projects: [
      {
        id: "project-1",
        name: "Export Project",
        description: "Export validation project",
        latitude: 11.2,
        longitude: 76.6,
        elevation: 1200,
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
  name: "Export Mast",
  source_type: "mast",
  file_name: "export.csv",
  time_step_seconds: 600,
  start_time: "2025-06-01T00:00:00Z",
  end_time: "2025-06-01T00:30:00Z",
  created_at: "2025-06-02T00:00:00Z",
  row_count: 4,
  column_count: 3,
};


const datasetDetail = {
  ...datasetSummary,
  columns: [
    { id: "speed-2", name: "Speed_100m", measurement_type: "speed", unit: "m/s", height_m: 100, sensor_info: null },
    { id: "direction-1", name: "Dir_80m", measurement_type: "direction", unit: "deg", height_m: 80, sensor_info: null },
    { id: "speed-1", name: "Speed_80m", measurement_type: "speed", unit: "m/s", height_m: 80, sensor_info: null },
    { id: "temp-1", name: "Temp_2m", measurement_type: "temperature", unit: "C", height_m: 2, sensor_info: null },
    { id: "pressure-1", name: "Pressure_hPa", measurement_type: "pressure", unit: "hPa", height_m: 2, sensor_info: null },
    { id: "speed-sd-1", name: "Speed_SD_80m", measurement_type: "speed_sd", unit: "m/s", height_m: 80, sensor_info: null },
  ],
};


function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/export?projectId=project-1&datasetId=dataset-1"]}>
      <Routes>
        <Route path="/export" element={<ExportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}


function getSelectByLabel(label: RegExp) {
  return screen.getAllByLabelText(label).find((element) => element.tagName === "SELECT") as HTMLSelectElement;
}


beforeEach(() => {
  vi.clearAllMocks();
  exportMocks.listPowerCurves.mockResolvedValue({
    items: [
      {
        id: "curve-1",
        name: "Saved Curve",
        file_name: "saved-curve.csv",
        summary: { point_count: 4, rated_power_kw: 3000, cut_in_speed_ms: 3, rated_speed_ms: 12, cut_out_speed_ms: 25 },
        points: [
          { wind_speed_ms: 0, power_kw: 0 },
          { wind_speed_ms: 3, power_kw: 20 },
          { wind_speed_ms: 8, power_kw: 1500 },
          { wind_speed_ms: 12, power_kw: 3000 },
        ],
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
      },
    ],
    total: 1,
  });
  exportMocks.listProjectDatasets.mockResolvedValue({ datasets: [datasetSummary], total: 1 });
  exportMocks.getDataset.mockResolvedValue(datasetDetail);
  exportMocks.listFlags.mockResolvedValue([
    { id: "flag-1", dataset_id: "dataset-1", name: "Icing", color: "#1f8f84", description: null, rule_count: 1, flagged_count: 2 },
  ]);
  exportMocks.downloadCsvExport.mockResolvedValue({
    blob: new Blob(["timestamp,Speed_80m\n2025-06-01T00:00:00+00:00,5.0\n"], { type: "text/csv" }),
    fileName: "export-clean.csv",
    contentType: "text/csv",
  });
  exportMocks.downloadWaspTabExport.mockResolvedValue({
    blob: new Blob(["Station: Export Mast\n12 9\n"], { type: "text/plain" }),
    fileName: "export-wasp.tab",
    contentType: "text/plain",
  });
  exportMocks.downloadIeaJsonExport.mockResolvedValue({
    blob: new Blob([JSON.stringify({ dataset: { name: "Export Mast" } }, null, 2)], { type: "application/json" }),
    fileName: "export.json",
    contentType: "application/json",
  });
  exportMocks.downloadOpenwindExport.mockResolvedValue({
    blob: new Blob(["Date,Time,Dir_80m,Speed_80m\n2025-06-01,00:00:00,350.0,5.0\n"], { type: "text/csv" }),
    fileName: "export-openwind.csv",
    contentType: "text/csv",
  });
  exportMocks.downloadProjectReport.mockResolvedValue({
    blob: new Blob(["pdf-data"], { type: "application/pdf" }),
    fileName: "project-report.pdf",
    contentType: "application/pdf",
  });
});


test("renders a CSV preview using the backend export endpoint", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByRole("heading", { name: /download clean csv, wasp tab, iea task 43 json, and openwind deliverables/i });
  await user.click(screen.getByRole("button", { name: /preview export/i }));

  await waitFor(() => {
    expect(exportMocks.downloadCsvExport).toHaveBeenCalledWith("dataset-1", expect.objectContaining({
      column_ids: ["speed-2", "direction-1", "speed-1", "temp-1", "pressure-1", "speed-sd-1"],
      exclude_flags: [],
    }));
  });
});


test("switches to WAsP TAB export and requests a directional frequency table preview", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByRole("heading", { name: /choose a delivery format and scope/i });
  await user.click(screen.getByRole("button", { name: /wasp tab/i }));
  await user.click(screen.getByRole("button", { name: /preview export/i }));

  await waitFor(() => {
    expect(exportMocks.downloadWaspTabExport).toHaveBeenCalledWith("dataset-1", expect.objectContaining({
      speed_column_id: "speed-2",
      direction_column_id: "direction-1",
      num_sectors: 12,
    }));
  });
});


test("switches to Openwind export and requests an Openwind-ready time-series preview", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByRole("heading", { name: /choose a delivery format and scope/i });
  await user.click(screen.getByRole("button", { name: /openwind/i }));
  await user.click(screen.getByRole("button", { name: /preview export/i }));

  await waitFor(() => {
    expect(exportMocks.downloadOpenwindExport).toHaveBeenCalledWith("dataset-1", expect.objectContaining({
      column_ids: ["speed-2", "direction-1", "speed-1", "temp-1", "pressure-1", "speed-sd-1"],
      exclude_flags: [],
    }));
  });
});


test("requests a report with explicit column and power-curve selections", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByRole("heading", { name: /build a word or pdf analysis report/i });
  await user.selectOptions(getSelectByLabel(/primary speed column/i), "speed-1");
  await user.selectOptions(getSelectByLabel(/direction column/i), "direction-1");
  await user.selectOptions(getSelectByLabel(/temperature column/i), "temp-1");
  await user.selectOptions(getSelectByLabel(/pressure column/i), "pressure-1");
  await user.selectOptions(getSelectByLabel(/turbulence column/i), "speed-sd-1");
  await user.selectOptions(getSelectByLabel(/power curve/i), "curve-1");
  await user.click(screen.getByRole("button", { name: /generate pdf report/i }));

  await waitFor(() => {
    expect(exportMocks.downloadProjectReport).toHaveBeenCalledWith("project-1", {
      dataset_id: "dataset-1",
      sections: expect.any(Array),
      exclude_flags: [],
      format: "pdf",
      title: "Export Project Wind Resource Report",
      column_selection: {
        speed_column_id: "speed-1",
        direction_column_id: "direction-1",
        temperature_column_id: "temp-1",
        pressure_column_id: "pressure-1",
        turbulence_column_id: "speed-sd-1",
        shear_column_ids: ["speed-2", "speed-1"],
      },
      power_curve_id: "curve-1",
    });
  });
});