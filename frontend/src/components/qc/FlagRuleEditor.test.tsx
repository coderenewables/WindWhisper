import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { FlagRuleEditor } from "./FlagRuleEditor";
import type { DatasetColumn } from "../../types/dataset";
import type { Flag, FlagRule } from "../../types/qc";

const columns: DatasetColumn[] = [
  {
    id: "speed-column",
    name: "Speed 80m",
    measurement_type: "speed",
    unit: "m/s",
    height_m: 80,
    sensor_info: null,
  },
  {
    id: "temp-column",
    name: "Temp 2m",
    measurement_type: "temperature",
    unit: "C",
    height_m: 2,
    sensor_info: null,
  },
];

const activeFlag: Flag = {
  id: "flag-1",
  dataset_id: "dataset-1",
  name: "Icing",
  color: "#1f8f84",
  description: null,
  rule_count: 1,
  flagged_count: 0,
};

const rules: FlagRule[] = [
  {
    id: "rule-1",
    flag_id: "flag-1",
    column_id: "speed-column",
    operator: "<",
    value: 3,
    logic: "AND",
    group_index: 1,
    order_index: 1,
  },
];

test("edits an existing rule", async () => {
  const user = userEvent.setup();
  const onCreateRule = vi.fn().mockResolvedValue(undefined);
  const onUpdateRule = vi.fn().mockResolvedValue(undefined);
  const onDeleteRule = vi.fn().mockResolvedValue(undefined);

  render(
    <FlagRuleEditor
      activeFlag={activeFlag}
      columns={columns}
      rules={rules}
      onCreateRule={onCreateRule}
      onUpdateRule={onUpdateRule}
      onDeleteRule={onDeleteRule}
    />,
  );

  await user.click(screen.getByRole("button", { name: /edit rule rule-1/i }));
  await user.clear(screen.getByLabelText(/value/i));
  await user.type(screen.getByLabelText(/value/i), "4");
  await user.click(screen.getByRole("button", { name: /save rule/i }));

  expect(onUpdateRule).toHaveBeenCalledWith("rule-1", {
    column_id: "speed-column",
    operator: "<",
    value: 4,
    logic: "AND",
    group_index: 1,
    order_index: 1,
  });
  expect(onCreateRule).not.toHaveBeenCalled();
});

test("deletes a rule from the list", async () => {
  const user = userEvent.setup();
  const onDeleteRule = vi.fn().mockResolvedValue(undefined);

  render(
    <FlagRuleEditor
      activeFlag={activeFlag}
      columns={columns}
      rules={rules}
      onCreateRule={vi.fn().mockResolvedValue(undefined)}
      onUpdateRule={vi.fn().mockResolvedValue(undefined)}
      onDeleteRule={onDeleteRule}
    />,
  );

  await user.click(screen.getByRole("button", { name: /delete rule rule-1/i }));

  expect(onDeleteRule).toHaveBeenCalledWith("rule-1");
});
