import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { GapFillPanel } from "./GapFillPanel";

const qcMocks = vi.hoisted(() => ({
  runGapReconstruction: vi.fn(),
}));

const datasetMocks = vi.hoisted(() => ({
  getDataset: vi.fn(),
}));

vi.mock("../../api/qc", () => ({
  runGapReconstruction: qcMocks.runGapReconstruction,
}));

vi.mock("../../api/datasets", () => ({
  getDataset: datasetMocks.getDataset,
}));

vi.mock("react-plotly.js", () => ({
  default: () => <div>Plot stub</div>,
}));

const columns = [
  { id: "speed", name: "Speed_80m", measurement_type: "speed", unit: "m/s", height_m: 80, sensor_info: null },
  { id: "ref", name: "RefSpeed_80m", measurement_type: "speed", unit: "m/s", height_m: 80, sensor_info: null },
  { id: "temp", name: "Temp_2m", measurement_type: "temperature", unit: "C", height_m: 2, sensor_info: null },
];

const datasets = [{ id: "dataset-1", name: "Mast A", project_id: "project-1", source_type: "mast", file_name: null, time_step_seconds: 600, start_time: "2025-01-01T00:00:00Z", end_time: "2025-01-01T01:00:00Z", created_at: "2025-01-01T00:00:00Z", column_count: 3, row_count: 6 }];

const previewResponse = {
  dataset_id: "dataset-1",
  column_id: "speed",
  method: "interpolation",
  save_mode: "preview",
  predictor_column_ids: [],
  reference_dataset_id: null,
  reference_column_id: null,
  gaps: [{ start_time: "2025-01-01T00:20:00Z", end_time: "2025-01-01T00:30:00Z", duration_hours: 0.33, num_missing: 2 }],
  preview: {
    timestamps: ["2025-01-01T00:00:00Z", "2025-01-01T00:10:00Z", "2025-01-01T00:20:00Z"],
    original_values: [2, 4, null],
    reconstructed_values: [2, 4, 6],
    filled_mask: [false, false, true],
  },
  summary: {
    expected_step_seconds: 600,
    gap_count: 1,
    original_missing_count: 2,
    filled_count: 2,
    remaining_missing_count: 0,
    fill_ratio_pct: 100,
    recovery_before_pct: 66.7,
    recovery_after_pct: 100,
    original_mean: 3,
    reconstructed_mean: 4,
    original_std: 1,
    reconstructed_std: 1.6,
  },
  saved_column: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  datasetMocks.getDataset.mockResolvedValue({ columns });
  qcMocks.runGapReconstruction.mockResolvedValue(previewResponse);
});

test("runs preview with interpolation settings", async () => {
  const user = userEvent.setup();
  render(<GapFillPanel datasetId="dataset-1" datasets={datasets} columns={columns} />);

  await user.click(screen.getByRole("button", { name: /preview fill/i }));

  await waitFor(() => {
    expect(qcMocks.runGapReconstruction).toHaveBeenCalledWith("dataset-1", expect.objectContaining({
      column_id: "speed",
      method: "interpolation",
      save_mode: "preview",
      max_gap_hours: 6,
    }));
  });

  expect(await screen.findByText(/gap inventory/i)).toBeInTheDocument();
  expect(screen.getByText(/filled points/i)).toBeInTheDocument();
});

test("saves a reconstructed column after preview", async () => {
  const user = userEvent.setup();
  const onSaved = vi.fn().mockResolvedValue(undefined);
  qcMocks.runGapReconstruction
    .mockResolvedValueOnce(previewResponse)
    .mockResolvedValueOnce({
      ...previewResponse,
      save_mode: "new_column",
      saved_column: {
        id: "saved-1",
        name: "Speed_80m_filled_interpolation",
        unit: "m/s",
        measurement_type: "speed",
        height_m: 80,
      },
    });

  render(<GapFillPanel datasetId="dataset-1" datasets={datasets} columns={columns} onSaved={onSaved} />);

  await user.click(screen.getByRole("button", { name: /preview fill/i }));
  await screen.findByText(/gap inventory/i);

  await user.click(screen.getByRole("button", { name: /save as new column/i }));

  await waitFor(() => {
    expect(qcMocks.runGapReconstruction).toHaveBeenLastCalledWith("dataset-1", expect.objectContaining({
      save_mode: "new_column",
      new_column_name: "Speed_80m_filled_interpolation",
    }));
  });

  await waitFor(() => {
    expect(onSaved).toHaveBeenCalled();
  });
});