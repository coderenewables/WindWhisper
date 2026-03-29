import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { TimeSeriesChart } from "./TimeSeriesChart";
import type { DatasetColumn, TimeSeriesResponse } from "../../types/dataset";

vi.mock("react-plotly.js", () => ({
  default: ({ data }: { data: Array<{ name?: string }> }) => (
    <div>
      Mock Plot
      <div>{data.map((trace) => trace.name).join(", ")}</div>
    </div>
  ),
}));

const datasetColumns: DatasetColumn[] = [
  { id: "speed", name: "Speed_80m", unit: "m/s", measurement_type: "speed", height_m: 80, sensor_info: null },
  { id: "direction", name: "Dir_80m", unit: "deg", measurement_type: "direction", height_m: 80, sensor_info: null },
];

const loadedData: TimeSeriesResponse = {
  dataset_id: "dataset-1",
  resample: null,
  start_time: "2025-01-01T00:00:00Z",
  end_time: "2025-01-01T00:20:00Z",
  excluded_flag_ids: [],
  timestamps: ["2025-01-01T00:00:00Z", "2025-01-01T00:10:00Z", "2025-01-01T00:20:00Z"],
  columns: {
    speed: { name: "Speed_80m", unit: "m/s", measurement_type: "speed", values: [7.1, 7.4, 6.9] },
    direction: { name: "Dir_80m", unit: "deg", measurement_type: "direction", values: [182, 188, 176] },
  },
};

test("keeps hook order stable when chart transitions from loading to loaded", () => {
  const onRangeChange = vi.fn();
  const onFitAll = vi.fn();

  const { rerender } = render(
    <TimeSeriesChart
      datasetColumns={datasetColumns}
      selectedColumnIds={["speed", "direction"]}
      colorByColumnId={{ speed: "#1f8f84", direction: "#f06f32" }}
      data={null}
      isLoading={true}
      error={null}
      onRangeChange={onRangeChange}
      onFitAll={onFitAll}
      flaggedRanges={[]}
      flagMetaById={{}}
      excludedFlagIds={[]}
    />,
  );

  expect(screen.getByText(/loading time-series data/i)).toBeInTheDocument();

  rerender(
    <TimeSeriesChart
      datasetColumns={datasetColumns}
      selectedColumnIds={["speed", "direction"]}
      colorByColumnId={{ speed: "#1f8f84", direction: "#f06f32" }}
      data={loadedData}
      isLoading={false}
      error={null}
      onRangeChange={onRangeChange}
      onFitAll={onFitAll}
      flaggedRanges={[]}
      flagMetaById={{}}
      excludedFlagIds={[]}
    />,
  );

  expect(screen.getByText("Mock Plot")).toBeInTheDocument();
  expect(screen.getByText(/Speed_80m, Dir_80m/i)).toBeInTheDocument();
});