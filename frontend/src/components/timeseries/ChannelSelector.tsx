import type { DatasetColumn } from "../../types/dataset";

const measurementLabels: Record<string, string> = {
  speed: "Speeds",
  direction: "Directions",
  temperature: "Temperature",
  pressure: "Pressure",
  speed_sd: "Speed SD",
  direction_sd: "Direction SD",
  ti: "Turbulence intensity",
  gust: "Gusts",
  other: "Other",
};

interface ChannelSelectorProps {
  columns: DatasetColumn[];
  selectedColumnIds: string[];
  colorByColumnId: Record<string, string>;
  onToggle: (columnId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

export function ChannelSelector({
  columns,
  selectedColumnIds,
  colorByColumnId,
  onToggle,
  onSelectAll,
  onClearAll,
}: ChannelSelectorProps) {
  const groupedColumns = columns.reduce<Record<string, DatasetColumn[]>>((groups, column) => {
    const group = column.measurement_type ?? "other";
    groups[group] ??= [];
    groups[group].push(column);
    return groups;
  }, {});

  return (
    <section className="panel-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Channels</p>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">Select series to display</h2>
        </div>
        <div className="flex gap-2 text-xs font-medium uppercase tracking-[0.18em]">
          <button type="button" onClick={onSelectAll} className="rounded-full border border-ink-200 px-3 py-2 text-ink-600 transition hover:border-ink-400 hover:text-ink-900">
            All
          </button>
          <button type="button" onClick={onClearAll} className="rounded-full border border-ink-200 px-3 py-2 text-ink-600 transition hover:border-ink-400 hover:text-ink-900">
            None
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {Object.entries(groupedColumns).map(([group, groupColumns]) => (
          <div key={group} className="panel-muted px-4 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-500">{measurementLabels[group] ?? group}</p>
            <div className="mt-3 space-y-2">
              {groupColumns.map((column) => {
                const checked = selectedColumnIds.includes(column.id);
                return (
                  <label key={column.id} className="flex items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-white/80">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(column.id)}
                      className="rounded border-ink-300 text-teal-500 focus:ring-teal-500"
                    />
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorByColumnId[column.id] ?? "#1f8f84" }} />
                    <span className="flex-1 text-sm text-ink-800">{column.name}</span>
                    <span className="text-xs text-ink-500">
                      {column.height_m != null ? `${column.height_m}m` : "-"}
                      {column.unit ? ` · ${column.unit}` : ""}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
