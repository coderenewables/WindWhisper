import { RotateCcw } from "lucide-react";

import type { ColumnInfo, MeasurementType } from "../../types/dataset";

const measurementOptions: Array<{ value: MeasurementType; label: string }> = [
  { value: "speed", label: "Speed" },
  { value: "direction", label: "Direction" },
  { value: "temperature", label: "Temperature" },
  { value: "pressure", label: "Pressure" },
  { value: "speed_sd", label: "Speed SD" },
  { value: "direction_sd", label: "Direction SD" },
  { value: "ti", label: "Turbulence intensity" },
  { value: "gust", label: "Gust" },
  { value: "other", label: "Other" },
];

interface ColumnMapperProps {
  columns: ColumnInfo[];
  defaultColumns: ColumnInfo[];
  onChange: (columns: ColumnInfo[]) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function ColumnMapper({ columns, defaultColumns, onChange, onContinue, onBack }: ColumnMapperProps) {
  function updateColumn(index: number, updates: Partial<ColumnInfo>) {
    onChange(columns.map((column, columnIndex) => (columnIndex === index ? { ...column, ...updates } : column)));
  }

  function resetColumn(index: number) {
    onChange(columns.map((column, columnIndex) => (columnIndex === index ? defaultColumns[index] : column)));
  }

  return (
    <section className="panel-surface p-6 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-teal-500">Step 2</p>
          <h2 className="mt-3 text-2xl font-semibold text-ink-900">Review detected channel mapping</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">
            Adjust measurement type, height, and inclusion before the import is committed. Confidence scores come from the
            backend auto-detection pass.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-2xl border border-ink-200 px-5 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900"
          >
            Back to upload
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-2xl bg-ink-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-ink-700"
          >
            Continue to preview
          </button>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
          <thead>
            <tr className="text-ink-500">
              <th className="px-3 pb-2 font-medium">Column</th>
              <th className="px-3 pb-2 font-medium">Detected type</th>
              <th className="px-3 pb-2 font-medium">Height (m)</th>
              <th className="px-3 pb-2 font-medium">Unit</th>
              <th className="px-3 pb-2 font-medium">Confidence</th>
              <th className="px-3 pb-2 font-medium">Include</th>
              <th className="px-3 pb-2 font-medium">Reset</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column, index) => {
              const included = column.measurement_type !== null;
              return (
                <tr key={column.name} className="panel-muted align-top">
                  <td className="rounded-l-2xl px-3 py-4 font-medium text-ink-900">{column.name}</td>
                  <td className="px-3 py-4">
                    <select
                      value={column.measurement_type ?? "other"}
                      onChange={(event) => updateColumn(index, { measurement_type: event.target.value })}
                      className="w-full rounded-2xl border-ink-200 bg-white"
                    >
                      {measurementOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-4">
                    <input
                      type="number"
                      step="any"
                      value={column.height_m ?? ""}
                      onChange={(event) =>
                        updateColumn(index, {
                          height_m: event.target.value === "" ? null : Number(event.target.value),
                        })
                      }
                      className="w-28 rounded-2xl border-ink-200 bg-white"
                    />
                  </td>
                  <td className="px-3 py-4">
                    <input
                      value={column.unit ?? ""}
                      onChange={(event) => updateColumn(index, { unit: event.target.value.trim() || null })}
                      className="w-28 rounded-2xl border-ink-200 bg-white"
                    />
                  </td>
                  <td className="px-3 py-4 text-ink-600">{Math.round(column.confidence * 100)}%</td>
                  <td className="px-3 py-4">
                    <label className="inline-flex items-center gap-2 text-ink-700">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={(event) => updateColumn(index, { measurement_type: event.target.checked ? column.measurement_type ?? "other" : null })}
                        className="rounded border-ink-300 text-teal-500 focus:ring-teal-500"
                      />
                      <span>{included ? "Included" : "Excluded"}</span>
                    </label>
                  </td>
                  <td className="rounded-r-2xl px-3 py-4">
                    <button
                      type="button"
                      onClick={() => resetColumn(index)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-ink-600 transition hover:border-ink-400 hover:text-ink-900"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
