import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import { QCPage } from "./QCPage";

const qcMocks = vi.hoisted(() => ({
  listProjectDatasets: vi.fn(),
  getDataset: vi.fn(),
  getDatasetHistory: vi.fn(),
  undoDatasetChange: vi.fn(),
  listFlags: vi.fn(),
  listFlaggedRanges: vi.fn(),
  listFlagRules: vi.fn(),
  createFlag: vi.fn(),
  createFlagRule: vi.fn(),
  updateFlagRule: vi.fn(),
  deleteFlagRule: vi.fn(),
  applyFlagRules: vi.fn(),
  deleteFlag: vi.fn(),
  deleteFlaggedRange: vi.fn(),
  createManualFlaggedRange: vi.fn(),
}));

vi.mock("../api/datasets", () => ({
  listProjectDatasets: qcMocks.listProjectDatasets,
  getDataset: qcMocks.getDataset,
  getDatasetHistory: qcMocks.getDatasetHistory,
  undoDatasetChange: qcMocks.undoDatasetChange,
}));

vi.mock("../api/qc", () => ({
  listFlags: qcMocks.listFlags,
  listFlaggedRanges: qcMocks.listFlaggedRanges,
  listFlagRules: qcMocks.listFlagRules,
  createFlag: qcMocks.createFlag,
  createFlagRule: qcMocks.createFlagRule,
  updateFlagRule: qcMocks.updateFlagRule,
  deleteFlagRule: qcMocks.deleteFlagRule,
  applyFlagRules: qcMocks.applyFlagRules,
  deleteFlag: qcMocks.deleteFlag,
  deleteFlaggedRange: qcMocks.deleteFlaggedRange,
  createManualFlaggedRange: qcMocks.createManualFlaggedRange,
}));

vi.mock("../hooks/useTimeSeries", () => ({
  useTimeSeries: () => ({
    data: { dataset_id: "dataset-1", timestamps: ["2025-01-01T00:00:00Z"], columns: {}, resample: null, start_time: null, end_time: null },
    visibleRange: { start: "2025-01-01T00:00:00Z", end: "2025-01-01T01:00:00Z" },
    setVisibleRange: vi.fn(),
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../components/timeseries/TimeSeriesChart", () => ({
  TimeSeriesChart: () => <div>Chart stub</div>,
}));

vi.mock("../components/qc/TowerShadowDetector", () => ({
  TowerShadowDetector: () => <div>Tower shadow stub</div>,
}));

vi.mock("../components/qc/GapFillPanel", () => ({
  GapFillPanel: () => <div>Gap fill stub</div>,
}));

vi.mock("../stores/projectStore", () => ({
  useProjectStore: () => ({
    projects: [{ id: "project-1", name: "Alpha Site" }],
    fetchProjects: vi.fn().mockResolvedValue(undefined),
  }),
}));

const datasetDetail = {
  id: "dataset-1",
  project_id: "project-1",
  name: "Mast A",
  source_type: "mast",
  file_name: null,
  time_step_seconds: 600,
  start_time: "2025-01-01T00:00:00Z",
  end_time: "2025-01-01T01:00:00Z",
  row_count: 6,
  column_count: 2,
  metadata: null,
  columns: [
    {
      id: "col-1",
      name: "Speed 80m",
      measurement_type: "speed",
      unit: "m/s",
      height_m: 80,
      sensor_info: null,
    },
    {
      id: "col-2",
      name: "Temp 2m",
      measurement_type: "temperature",
      unit: "C",
      height_m: 2,
      sensor_info: null,
    },
  ],
};

function renderPage(initialEntry = "/qc?projectId=project-1&datasetId=dataset-1") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/qc" element={<QCPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  qcMocks.listProjectDatasets.mockResolvedValue({ datasets: [{ id: "dataset-1", name: "Mast A" }] });
  qcMocks.getDataset.mockResolvedValue(datasetDetail);
  qcMocks.listFlags.mockResolvedValue([
    {
      id: "flag-1",
      dataset_id: "dataset-1",
      name: "Icing",
      color: "#1f8f84",
      description: "Cold low-speed periods",
      rule_count: 1,
      flagged_count: 0,
    },
  ]);
  qcMocks.listFlaggedRanges.mockResolvedValue([]);
  qcMocks.getDatasetHistory.mockResolvedValue({
    changes: [
      {
        id: "change-1",
        dataset_id: "dataset-1",
        action_type: "data_reconstructed",
        description: "Reconstructed missing values for Speed 80m using interpolation overwrite.",
        before_state: { save_mode: "overwrite" },
        after_state: { save_mode: "overwrite" },
        created_at: "2025-01-01T00:15:00Z",
      },
    ],
    total: 1,
  });
  qcMocks.undoDatasetChange.mockResolvedValue({
    undone_change: {
      id: "change-1",
      dataset_id: "dataset-1",
      action_type: "data_reconstructed",
      description: "Reconstructed missing values for Speed 80m using interpolation overwrite.",
      before_state: { save_mode: "overwrite" },
      after_state: { save_mode: "overwrite" },
      created_at: "2025-01-01T00:15:00Z",
    },
  });
  qcMocks.listFlagRules.mockResolvedValue([
    {
      id: "rule-1",
      flag_id: "flag-1",
      column_id: "col-2",
      operator: "<",
      value: 2,
      logic: "AND",
      group_index: 1,
      order_index: 1,
    },
  ]);
  qcMocks.createFlag.mockResolvedValue({
    id: "flag-2",
    dataset_id: "dataset-1",
    name: "Manual",
    color: "#ef4444",
    description: "",
    rule_count: 0,
    flagged_count: 0,
  });
  qcMocks.createFlagRule.mockResolvedValue(undefined);
  qcMocks.updateFlagRule.mockResolvedValue(undefined);
  qcMocks.deleteFlagRule.mockResolvedValue(undefined);
  qcMocks.applyFlagRules.mockResolvedValue([]);
  qcMocks.deleteFlag.mockResolvedValue(undefined);
  qcMocks.deleteFlaggedRange.mockResolvedValue(undefined);
  qcMocks.createManualFlaggedRange.mockResolvedValue(undefined);
});

test("creates a flag from the QC page", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/manage qc flags/i);
  await user.click(screen.getByRole("button", { name: /add flag/i }));
  await user.type(screen.getByPlaceholderText(/flag name/i), "Shear anomaly");
  await user.type(screen.getByPlaceholderText(/description/i), "Tower wake periods");
  await user.click(screen.getByRole("button", { name: /create flag/i }));

  await waitFor(() => {
    expect(qcMocks.createFlag).toHaveBeenCalledWith("dataset-1", {
      name: "Shear anomaly",
      color: "#1f8f84",
      description: "Tower wake periods",
    });
  });
});

test("updates a rule from the QC page", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/rule editor for icing/i);
  await user.click(screen.getByRole("button", { name: /edit rule rule-1/i }));
  await user.clear(screen.getByLabelText(/value/i));
  await user.type(screen.getByLabelText(/value/i), "5");
  await user.click(screen.getByRole("button", { name: /save rule/i }));

  await waitFor(() => {
    expect(qcMocks.updateFlagRule).toHaveBeenCalledWith("rule-1", {
      column_id: "col-2",
      operator: "<",
      value: 5,
      logic: "AND",
      group_index: 1,
      order_index: 1,
    });
  });
});

test("removes a rule immediately while delete is in flight", async () => {
  const user = userEvent.setup();
  const deferred = createDeferred<void>();
  qcMocks.deleteFlagRule.mockImplementation(() => deferred.promise);
  renderPage();

  await screen.findByText(/temp 2m < 2/i);
  await user.click(screen.getByRole("button", { name: /delete rule rule-1/i }));

  await waitFor(() => {
    expect(screen.queryByText(/temp 2m < 2/i)).not.toBeInTheDocument();
  });

  deferred.resolve(undefined);
});

test("undoes the latest change from the history panel", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByText(/change timeline/i);
  await user.click(screen.getByRole("button", { name: /undo latest change/i }));

  await waitFor(() => {
    expect(qcMocks.undoDatasetChange).toHaveBeenCalledWith("dataset-1");
  });
});