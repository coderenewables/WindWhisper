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
  onResampleChange: (value: string) => void;
  onRangeChange: (next: { start: string | null; end: string | null }) => void;
  onFitAll: () => void;
}

export function TimeSeriesControls({
  resample,
  appliedResample,
  start,
  end,
  onResampleChange,
  onRangeChange,
  onFitAll,
}: TimeSeriesControlsProps) {
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
    </section>
  );
}
