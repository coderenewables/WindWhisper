import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import { TimeSeriesPage } from "./TimeSeriesPage";

const datasetMocks = vi.hoisted(() => ({
  listProjectDatasets: vi.fn(),
  getDataset: vi.fn(),
}));

const qcMocks = vi.hoisted(() => ({
  listFlags: vi.fn(),
  listFlaggedRanges: vi.fn(),
}));

const hookMocks = vi.hoisted(() => ({
  useTimeSeries: vi.fn(),
}));

const storeMocks = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
}));

vi.mock("../api/datasets", () => ({
  listProjectDatasets: datasetMocks.listProjectDatasets,
  getDataset: datasetMocks.getDataset,
}));

vi.mock("../api/qc", () => ({
  listFlags: qcMocks.listFlags,
  listFlaggedRanges: qcMocks.listFlaggedRanges,
}));

vi.mock("../hooks/useTimeSeries", () => ({
  useTimeSeries: hookMocks.useTimeSeries,
}));

vi.mock("../stores/projectStore", () => ({
  useProjectStore: () => ({
    projects: [
      {
        id: "project-1",
        name: "Time Series Project",
        description: "Project for time-series page test",
        latitude: null,
        longitude: null,
        elevation: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
        dataset_count: 1,
      },
    ],
    fetchProjects: storeMocks.fetchProjects,
  }),
}));

vi.mock("../components/timeseries/TimeSeriesChart", () => ({
  TimeSeriesChart: () => <section>Mock chart</section>,
}));

vi.mock("../components/timeseries/ChannelSelector", () => ({
  ChannelSelector: () => <section>Mock channel selector</section>,
}));

vi.mock("../components/timeseries/TimeSeriesControls", () => ({
  TimeSeriesControls: () => <section>Mock controls</section>,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/time-series?projectId=project-1&datasetId=dataset-1"]}>
      <Routes>
        <Route path="/time-series" element={<TimeSeriesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  datasetMocks.listProjectDatasets.mockResolvedValue({
    datasets: [
      {
        id: "dataset-1",
        project_id: "project-1",
        name: "Mast A",
        source_type: "file_upload",
        file_name: "mast-a.csv",
        time_step_seconds: 600,
        start_time: "2025-01-01T00:00:00Z",
        end_time: "2025-01-01T01:00:00Z",
        created_at: "2025-01-02T00:00:00Z",
        column_count: 2,
        row_count: 6,
      },
    ],
    total: 1,
  });
  datasetMocks.getDataset.mockResolvedValue({
    id: "dataset-1",
    project_id: "project-1",
    name: "Mast A",
    source_type: "file_upload",
    file_name: "mast-a.csv",
    time_step_seconds: 600,
    start_time: "2025-01-01T00:00:00Z",
    end_time: "2025-01-01T01:00:00Z",
    created_at: "2025-01-02T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
    column_count: 2,
    row_count: 6,
    columns: [
      { id: "col-speed", name: "Speed_80m", measurement_type: "speed", unit: "m/s", height_m: 80, sensor_info: null },
      { id: "col-dir", name: "Dir_80m", measurement_type: "direction", unit: "deg", height_m: 80, sensor_info: null },
    ],
  });
  qcMocks.listFlags.mockResolvedValue([]);
  qcMocks.listFlaggedRanges.mockResolvedValue([]);
  hookMocks.useTimeSeries.mockReturnValue({
    data: null,
    visibleRange: { start: "2025-01-01T00:00:00Z", end: "2025-01-01T01:00:00Z" },
    setVisibleRange: vi.fn(),
    isLoading: true,
    error: null,
  });
});

test("shows zero returned points before time-series data arrives without crashing", async () => {
  renderPage();

  await screen.findByRole("heading", { name: /interactive, zoomable time-series workspace/i });
  await screen.findByText("Returned points");
  expect(screen.getByText("0")).toBeInTheDocument();
  expect(screen.getByText("Mock chart")).toBeInTheDocument();
});