import type { Flag } from "../../types/qc";

const resampleOptions = [
  { label: "Raw", value: "raw" },
  { label: "10-min", value: "10min" },
  { label: "Hourly", value: "1h" },
  { label: "Daily", value: "1D" },
  { label: "Monthly", value: "1MS" },
];

function toDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

interface TimeSeriesControlsProps {
  resample: string;
  appliedResample: string | null;
  start: string | null;
  end: string | null;
  flags?: Flag[];
  excludedFlagIds?: string[];
  onResampleChange: (value: string) => void;
  onRangeChange: (next: { start: string | null; end: string | null }) => void;
  onFitAll: () => void;
  onToggleFlagExclusion?: (flagId: string) => void;
  onSetShowCleanDataOnly?: (value: boolean) => void;
}

export function TimeSeriesControls({
  resample,
  appliedResample,
  start,
  end,
  flags = [],
  excludedFlagIds = [],
  onResampleChange,
  onRangeChange,
  onFitAll,
  onToggleFlagExclusion,
  onSetShowCleanDataOnly,
}: TimeSeriesControlsProps) {
  const showCleanDataOnly = flags.length > 0 && excludedFlagIds.length === flags.length;

  return (
    <section className="panel-surface p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Controls</p>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">Window and resampling</h2>
          <p className="mt-2 text-sm leading-7 text-ink-600">
            Adjust the visible time window and aggregation level. Zooming and panning on the chart updates the requested range.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Resample
            <select value={resample} onChange={(event) => onResampleChange(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
              {resampleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Start
            <input
              type="datetime-local"
              value={toDateInputValue(start)}
              onChange={(event) => onRangeChange({ start: event.target.value ? new Date(event.target.value).toISOString() : null, end })}
              className="rounded-2xl border-ink-200 bg-white"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-ink-800">
            End
            <input
              type="datetime-local"
              value={toDateInputValue(end)}
              onChange={(event) => onRangeChange({ start, end: event.target.value ? new Date(event.target.value).toISOString() : null })}
              className="rounded-2xl border-ink-200 bg-white"
            />
          </label>

          <div className="grid gap-2 text-sm font-medium text-ink-800">
            <span>Quick action</span>
            <button
              type="button"
              onClick={onFitAll}
              className="rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-700"
            >
              Fit all
            </button>
          </div>
        </div>
      </div>

      {appliedResample && appliedResample !== resample && resample === "raw" ? (
        <p className="mt-4 text-sm text-ink-600">Auto-downsampling applied for performance: {appliedResample}</p>
      ) : null}

      {flags.length > 0 ? (
        <div className="mt-5 border-t border-ink-100 pt-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-teal-500">Flag filters</p>
              <p className="mt-2 text-sm leading-7 text-ink-600">Turn flags off to exclude their ranges from the chart response and show gaps where data was removed.</p>
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800">
              <input type="checkbox" checked={showCleanDataOnly} onChange={(event) => onSetShowCleanDataOnly?.(event.target.checked)} className="rounded border-ink-300 text-teal-600 focus:ring-teal-500" />
              Show clean data only
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {flags.map((flag) => {
              const isExcluded = excludedFlagIds.includes(flag.id);
              return (
                <button
                  key={flag.id}
                  type="button"
                  onClick={() => onToggleFlagExclusion?.(flag.id)}
                  className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${isExcluded ? "border-ink-200 bg-white text-ink-500 hover:border-ink-300" : "border-teal-200 bg-teal-50 text-ink-800 hover:border-teal-300"}`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: flag.color ?? "#1f8f84" }} />
                  <span>{flag.name}</span>
                  <span className="rounded-full bg-black/5 px-2 py-1 text-[11px] uppercase tracking-[0.14em]">{isExcluded ? "Off" : "On"}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
