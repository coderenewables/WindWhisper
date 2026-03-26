import { Pencil, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { DatasetColumn } from "../../types/dataset";
import type { Flag, FlagRule } from "../../types/qc";

const operatorOptions: Array<{ value: FlagRule["operator"]; label: string }> = [
  { value: "==", label: "Equals" },
  { value: "!=", label: "Not equals" },
  { value: "<", label: "Less than" },
  { value: ">", label: "Greater than" },
  { value: "<=", label: "Less than or equal" },
  { value: ">=", label: "Greater than or equal" },
  { value: "between", label: "Between" },
  { value: "is_null", label: "Is null" },
];

interface FlagRuleEditorProps {
  activeFlag: Flag | null;
  columns: DatasetColumn[];
  rules: FlagRule[];
  onCreateRule: (payload: { column_id: string; operator: FlagRule["operator"]; value?: unknown }) => Promise<void>;
  onUpdateRule: (ruleId: string, payload: { column_id: string; operator: FlagRule["operator"]; value?: unknown }) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
}

function ruleValueToFields(rule: FlagRule) {
  if (rule.operator === "between" && Array.isArray(rule.value)) {
    return {
      primaryValue: String(rule.value[0] ?? ""),
      secondaryValue: String(rule.value[1] ?? ""),
    };
  }

  return {
    primaryValue: rule.value == null ? "" : String(rule.value),
    secondaryValue: "",
  };
}

export function FlagRuleEditor({ activeFlag, columns, rules, onCreateRule, onUpdateRule, onDeleteRule }: FlagRuleEditorProps) {
  const [selectedColumnId, setSelectedColumnId] = useState("");
  const [operator, setOperator] = useState<FlagRule["operator"]>("<");
  const [primaryValue, setPrimaryValue] = useState("");
  const [secondaryValue, setSecondaryValue] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  useEffect(() => {
    setEditingRuleId(null);
    setSelectedColumnId("");
    setOperator("<");
    setPrimaryValue("");
    setSecondaryValue("");
  }, [activeFlag?.id]);

  const preview = useMemo(() => {
    const column = columns.find((item) => item.id === selectedColumnId);
    if (!column) {
      return "Select a column to define a QC rule.";
    }
    if (operator === "between") {
      return `Flag data where ${column.name} is between ${primaryValue || "min"} and ${secondaryValue || "max"}`;
    }
    if (operator === "is_null") {
      return `Flag data where ${column.name} is null`;
    }
    return `Flag data where ${column.name} ${operator} ${primaryValue || "value"}`;
  }, [columns, operator, primaryValue, secondaryValue, selectedColumnId]);

  const temperatureColumn = columns.find((column) => column.measurement_type === "temperature");
  const speedSdColumn = columns.find((column) => column.measurement_type === "speed_sd");

  async function submitRule() {
    if (!activeFlag || !selectedColumnId) {
      return;
    }

    const value = operator === "between"
      ? [Number(primaryValue), Number(secondaryValue)]
      : operator === "is_null"
        ? undefined
        : Number.isNaN(Number(primaryValue))
          ? primaryValue
          : Number(primaryValue);

    if (editingRuleId) {
      await onUpdateRule(editingRuleId, { column_id: selectedColumnId, operator, value });
      setEditingRuleId(null);
    } else {
      await onCreateRule({ column_id: selectedColumnId, operator, value });
    }
    setPrimaryValue("");
    setSecondaryValue("");
    setSelectedColumnId("");
    setOperator("<");
  }

  async function applyIcingTemplate() {
    if (!activeFlag || !temperatureColumn || !speedSdColumn) {
      return;
    }
    await onCreateRule({ column_id: temperatureColumn.id, operator: "<", value: 2 });
    await onCreateRule({ column_id: speedSdColumn.id, operator: "==", value: 0 });
  }

  function applyRangeTemplate() {
    const firstSpeedColumn = columns.find((column) => column.measurement_type === "speed") ?? columns[0];
    if (!firstSpeedColumn) {
      return;
    }
    setSelectedColumnId(firstSpeedColumn.id);
    setOperator("between");
    setPrimaryValue("0");
    setSecondaryValue("25");
  }

  function applyFlatLineTemplate() {
    const sdColumn = speedSdColumn ?? columns[0];
    if (!sdColumn) {
      return;
    }
    setSelectedColumnId(sdColumn.id);
    setOperator("==");
    setPrimaryValue("0");
    setSecondaryValue("");
  }

  function startEditingRule(rule: FlagRule) {
    const values = ruleValueToFields(rule);
    setEditingRuleId(rule.id);
    setSelectedColumnId(rule.column_id);
    setOperator(rule.operator);
    setPrimaryValue(values.primaryValue);
    setSecondaryValue(values.secondaryValue);
  }

  function cancelEditingRule() {
    setEditingRuleId(null);
    setSelectedColumnId("");
    setOperator("<");
    setPrimaryValue("");
    setSecondaryValue("");
  }

  return (
    <section className="panel-surface p-5">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Rules</p>
        <h2 className="mt-2 text-xl font-semibold text-ink-900">{activeFlag ? `Rule editor for ${activeFlag.name}` : "Select a flag to edit rules"}</h2>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => void applyIcingTemplate()} disabled={!activeFlag || !temperatureColumn || !speedSdColumn} className="rounded-full border border-ink-200 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-600 transition hover:border-ink-400 hover:text-ink-900 disabled:opacity-50">
          Icing Detection
        </button>
        <button type="button" onClick={applyRangeTemplate} disabled={!activeFlag || columns.length === 0} className="rounded-full border border-ink-200 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-600 transition hover:border-ink-400 hover:text-ink-900 disabled:opacity-50">
          Range Check
        </button>
        <button type="button" onClick={applyFlatLineTemplate} disabled={!activeFlag || columns.length === 0} className="rounded-full border border-ink-200 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-600 transition hover:border-ink-400 hover:text-ink-900 disabled:opacity-50">
          Flat Line Detection
        </button>
      </div>

      {activeFlag ? (
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Column
            <select value={selectedColumnId} onChange={(event) => setSelectedColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
              <option value="">Select a column</option>
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Operator
              <select value={operator} onChange={(event) => setOperator(event.target.value as FlagRule["operator"])} className="rounded-2xl border-ink-200 bg-white">
                {operatorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {operator !== "is_null" ? (
              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Value
                <input value={primaryValue} onChange={(event) => setPrimaryValue(event.target.value)} className="rounded-2xl border-ink-200 bg-white" />
              </label>
            ) : null}
          </div>

          {operator === "between" ? (
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Upper bound
              <input value={secondaryValue} onChange={(event) => setSecondaryValue(event.target.value)} className="rounded-2xl border-ink-200 bg-white" />
            </label>
          ) : null}

          <div className="panel-muted px-4 py-4 text-sm text-ink-600">{preview}</div>

          <div className="flex justify-end">
            <div className="flex gap-3">
              {editingRuleId ? (
                <button type="button" onClick={cancelEditingRule} className="rounded-2xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900">
                  Cancel edit
                </button>
              ) : null}
              <button type="button" onClick={() => void submitRule()} disabled={!selectedColumnId} className="rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-700 disabled:opacity-60">
                {editingRuleId ? "Save rule" : "Add rule"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 panel-muted px-4 py-4 text-sm text-ink-600">Create or select a flag first, then define rule conditions for that flag.</div>
      )}

      <div className="mt-5 space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-500">Current rules</p>
        {rules.length === 0 ? (
          <p className="text-sm text-ink-500">No rules configured for this flag.</p>
        ) : (
          rules.map((rule) => {
            const column = columns.find((item) => item.id === rule.column_id);
            return (
              <div key={rule.id} className="rounded-2xl border border-ink-100 bg-white/70 px-3 py-3 text-sm text-ink-700">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {column?.name ?? "Column"} {rule.operator} {Array.isArray(rule.value) ? rule.value.join(" - ") : String(rule.value ?? "null")}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEditingRule(rule)} className="rounded-full border border-ink-200 p-2 text-ink-500 transition hover:border-ink-400 hover:text-ink-900" aria-label={`Edit rule ${rule.id}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => void onDeleteRule(rule.id)} className="rounded-full border border-ink-200 p-2 text-ink-500 transition hover:border-red-300 hover:text-red-700" aria-label={`Delete rule ${rule.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {editingRuleId === rule.id ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink-900/5 px-3 py-1 text-xs font-medium text-ink-600">
                    <Save className="h-3.5 w-3.5" />
                    Editing this rule
                    <button type="button" onClick={cancelEditingRule} className="rounded-full p-1 text-ink-500 transition hover:bg-white hover:text-ink-900" aria-label="Cancel rule edit">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
