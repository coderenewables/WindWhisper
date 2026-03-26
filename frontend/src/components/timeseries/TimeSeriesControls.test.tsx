import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { TimeSeriesControls } from "./TimeSeriesControls";

test("toggles an individual flag exclusion", async () => {
  const user = userEvent.setup();
  const onToggleFlagExclusion = vi.fn();

  render(
    <TimeSeriesControls
      resample="raw"
      appliedResample={null}
      start={null}
      end={null}
      flags={[
        {
          id: "flag-1",
          dataset_id: "dataset-1",
          name: "Icing",
          color: "#1f8f84",
          description: null,
          rule_count: 1,
          flagged_count: 2,
        },
      ]}
      excludedFlagIds={[]}
      onResampleChange={vi.fn()}
      onRangeChange={vi.fn()}
      onFitAll={vi.fn()}
      onToggleFlagExclusion={onToggleFlagExclusion}
      onSetShowCleanDataOnly={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: /icing/i }));

  expect(onToggleFlagExclusion).toHaveBeenCalledWith("flag-1");
});

test("toggles show clean data only", async () => {
  const user = userEvent.setup();
  const onSetShowCleanDataOnly = vi.fn();

  render(
    <TimeSeriesControls
      resample="raw"
      appliedResample={null}
      start={null}
      end={null}
      flags={[
        {
          id: "flag-1",
          dataset_id: "dataset-1",
          name: "Icing",
          color: "#1f8f84",
          description: null,
          rule_count: 1,
          flagged_count: 2,
        },
      ]}
      excludedFlagIds={[]}
      onResampleChange={vi.fn()}
      onRangeChange={vi.fn()}
      onFitAll={vi.fn()}
      onToggleFlagExclusion={vi.fn()}
      onSetShowCleanDataOnly={onSetShowCleanDataOnly}
    />,
  );

  await user.click(screen.getByRole("checkbox", { name: /show clean data only/i }));

  expect(onSetShowCleanDataOnly).toHaveBeenCalledWith(true);
});