/* Scenario manager — side-by-side energy scenario comparison */

import { Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";

interface Scenario {
  id: string;
  name: string;
  hubHeight: number | null;
  powerCurve: string;
  mcpMethod: string;
  aepMwh: number | null;
  capacityFactor: number | null;
}

interface ScenarioManagerProps {
  projectId: string;
}

let nextId = 1;

function newScenario(name?: string): Scenario {
  const id = `scenario-${nextId++}`;
  return {
    id,
    name: name ?? `Scenario ${nextId - 1}`,
    hubHeight: null,
    powerCurve: "",
    mcpMethod: "",
    aepMwh: null,
    capacityFactor: null,
  };
}

export function ScenarioManager({ projectId: _projectId }: ScenarioManagerProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  function addScenario() {
    setScenarios((prev) => [...prev, newScenario()]);
  }

  function removeScenario(id: string) {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }

  function updateField(id: string, field: keyof Scenario, value: string | number | null) {
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    );
  }

  if (scenarios.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <Zap className="h-6 w-6 text-ink-300" />
        <p className="mt-2 text-xs text-ink-500">No energy scenarios defined</p>
        <button
          type="button"
          onClick={addScenario}
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-700 dark:bg-teal-600 dark:hover:bg-teal-700"
        >
          <Plus className="h-3 w-3" /> Add Scenario
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink-700 dark:text-ink-300">
          <Zap className="h-3.5 w-3.5" /> Scenarios
        </h3>
        <button
          type="button"
          onClick={addScenario}
          className="inline-flex items-center gap-1 rounded-lg bg-ink-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-ink-700 dark:bg-teal-600 dark:hover:bg-teal-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-2" style={{ minWidth: scenarios.length * 180 }}>
          {scenarios.map((s) => (
            <div
              key={s.id}
              className="w-44 shrink-0 rounded-lg border border-ink-100 bg-white p-3 dark:border-ink-700 dark:bg-ink-800"
            >
              <div className="flex items-center justify-between">
                <input
                  value={s.name}
                  onChange={(e) => updateField(s.id, "name", e.target.value)}
                  className="w-full rounded border-0 bg-transparent p-0 text-xs font-semibold text-ink-900 focus:outline-none dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => removeScenario(s.id)}
                  className="ml-1 shrink-0 text-ink-400 hover:text-red-500"
                  aria-label="Remove scenario"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              <div className="mt-2 space-y-1.5">
                <label className="block">
                  <span className="text-[10px] text-ink-500">Hub Height (m)</span>
                  <input
                    type="number"
                    value={s.hubHeight ?? ""}
                    onChange={(e) => updateField(s.id, "hubHeight", e.target.value ? Number(e.target.value) : null)}
                    className="mt-0.5 block w-full rounded border border-ink-200 bg-ink-50 px-2 py-1 text-xs dark:border-ink-600 dark:bg-ink-700"
                    placeholder="e.g. 80"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] text-ink-500">Power Curve</span>
                  <input
                    value={s.powerCurve}
                    onChange={(e) => updateField(s.id, "powerCurve", e.target.value)}
                    className="mt-0.5 block w-full rounded border border-ink-200 bg-ink-50 px-2 py-1 text-xs dark:border-ink-600 dark:bg-ink-700"
                    placeholder="Turbine name"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] text-ink-500">MCP Method</span>
                  <select
                    value={s.mcpMethod}
                    onChange={(e) => updateField(s.id, "mcpMethod", e.target.value)}
                    className="mt-0.5 block w-full rounded border border-ink-200 bg-ink-50 px-2 py-1 text-xs dark:border-ink-600 dark:bg-ink-700"
                  >
                    <option value="">None</option>
                    <option value="linear">Linear</option>
                    <option value="variance_ratio">Variance Ratio</option>
                    <option value="matrix">Matrix</option>
                    <option value="weibull_scale">Weibull Scale</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 border-t border-ink-100 pt-2 dark:border-ink-700">
                <div className="text-[10px] text-ink-400">AEP (MWh)</div>
                <div className="text-sm font-bold text-ink-900 dark:text-white">
                  {s.aepMwh != null ? s.aepMwh.toLocaleString() : "—"}
                </div>
                <div className="text-[10px] text-ink-400">Capacity Factor</div>
                <div className="text-sm font-bold text-ink-900 dark:text-white">
                  {s.capacityFactor != null ? `${s.capacityFactor.toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
