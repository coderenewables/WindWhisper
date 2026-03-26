import { CheckCircle2, FileDigit, TableProperties } from "lucide-react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { ColumnInfo, UploadPreviewResponse } from "../../types/dataset";

const typeAccent: Record<string, string> = {
  speed: "bg-teal-50 text-teal-700 ring-teal-200",
  direction: "bg-sky-50 text-sky-700 ring-sky-200",
  temperature: "bg-amber-50 text-amber-700 ring-amber-200",
  pressure: "bg-violet-50 text-violet-700 ring-violet-200",
  speed_sd: "bg-rose-50 text-rose-700 ring-rose-200",
  direction_sd: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  ti: "bg-lime-50 text-lime-700 ring-lime-200",
  gust: "bg-orange-50 text-orange-700 ring-orange-200",
  other: "bg-slate-100 text-slate-700 ring-slate-200",
};

function colorForColumn(key: string, columns: ColumnInfo[]) {
  const matchedColumn = columns.find((column) => column.name === key);
  return typeAccent[matchedColumn?.measurement_type ?? "other"] ?? typeAccent.other;
}

interface ImportPreviewProps {
  preview: UploadPreviewResponse;
  columns: ColumnInfo[];
  datasetName: string;
  isConfirming?: boolean;
  onDatasetNameChange: (value: string) => void;
  onBack: () => void;
  onConfirm: () => Promise<void>;
}

function formatTimeStep(value: number | null) {
  if (!value) {
    return "Unknown";
  }
  if (value % 3600 === 0) {
    return `${value / 3600}h`;
  }
  if (value % 60 === 0) {
    return `${value / 60} min`;
  }
  return `${value}s`;
}

export function ImportPreview({
  preview,
  columns,
  datasetName,
  isConfirming = false,
  onDatasetNameChange,
  onBack,
  onConfirm,
}: ImportPreviewProps) {
  const orderedKeys = Object.keys(preview.preview_rows[0] ?? {});

  return (
    <section className="space-y-6">
      <section className="panel-surface p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-teal-500">Step 3</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink-900">Preview rows and confirm the import</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">
              The import preview is ready. Set the dataset name, check the detected time step, and confirm to persist the
              dataset, data columns, and time-series records.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[440px]">
            <div className="panel-muted px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Rows</p>
              <p className="mt-2 text-2xl font-semibold text-ink-900">{preview.row_count.toLocaleString()}</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Time step</p>
              <p className="mt-2 text-2xl font-semibold text-ink-900">{formatTimeStep(preview.time_step_seconds)}</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Included</p>
              <p className="mt-2 text-2xl font-semibold text-ink-900">{columns.filter((column) => column.measurement_type !== null).length}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_320px]">
          <div className="space-y-4">
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Dataset name
              <input
                value={datasetName}
                onChange={(event) => onDatasetNameChange(event.target.value)}
                className="rounded-2xl border-ink-200 bg-white"
              />
            </label>

            <div className="overflow-x-auto rounded-[1.75rem] border border-ink-100 bg-white/70 p-3">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-ink-500">
                    {orderedKeys.map((key) => (
                      <th key={key} className="px-3 py-3 font-medium">
                        <span className={["inline-flex rounded-full px-3 py-1 ring-1", colorForColumn(key, columns)].join(" ")}>
                          {key}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview_rows.map((row, index) => (
                    <tr key={`${index}-${String(row[orderedKeys[0]] ?? index)}`} className="border-b border-ink-100/80 last:border-b-0">
                      {orderedKeys.map((key) => (
                        <td key={key} className="px-3 py-3 text-ink-700">
                          {row[key] == null ? <span className="text-ink-400">-</span> : String(row[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <TableProperties className="h-4 w-4 text-ember-500" />
                Mapping summary
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {columns
                  .filter((column) => column.measurement_type !== null)
                  .map((column) => (
                    <span
                      key={column.name}
                      className={[
                        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1",
                        typeAccent[column.measurement_type ?? "other"] ?? typeAccent.other,
                      ].join(" ")}
                    >
                      <span>{column.name}</span>
                      <span>{column.height_m != null ? `${column.height_m}m` : "no height"}</span>
                    </span>
                  ))}
              </div>
            </div>

            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <FileDigit className="h-4 w-4 text-ember-500" />
                File details
              </div>
              <dl className="mt-4 space-y-3 text-sm text-ink-600">
                <div className="flex items-start justify-between gap-4">
                  <dt>Source file</dt>
                  <dd className="text-right font-medium text-ink-800">{preview.file_name}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt>Delimiter</dt>
                  <dd className="text-right font-medium text-ink-800">{preview.delimiter ?? "Auto / workbook"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt>Selected sheet</dt>
                  <dd className="text-right font-medium text-ink-800">{preview.selected_sheet ?? "Primary sheet"}</dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={onBack}
                className="rounded-2xl border border-ink-200 px-5 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900"
              >
                Back to mapping
              </button>
              <button
                type="button"
                onClick={() => void onConfirm()}
                disabled={isConfirming}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConfirming ? <LoadingSpinner label="Importing" /> : <><CheckCircle2 className="h-4 w-4" />Confirm import</>}
              </button>
            </div>
          </aside>
        </div>
      </section>
    </section>
  );
}
