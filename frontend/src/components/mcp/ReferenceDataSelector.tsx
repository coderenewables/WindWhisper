import { CalendarRange, Database, Layers3, Radar, Wind } from "lucide-react";

import type { DatasetColumn, DatasetDetail, DatasetSummary } from "../../types/dataset";
import type { MCPCorrelationResponse, MCPMethod } from "../../types/analysis";

interface ReferenceDataSelectorProps {
  datasets: DatasetSummary[];
  siteDatasetId: string;
  refDatasetId: string;
  siteDetail: DatasetDetail | null;
  refDetail: DatasetDetail | null;
  siteColumnId: string;
  refColumnId: string;
  extraSiteColumnIds: string[];
  extraRefColumnIds: string[];
  method: MCPMethod;
  correlationData: MCPCorrelationResponse | null;
  onSiteDatasetChange: (datasetId: string) => void;
  onRefDatasetChange: (datasetId: string) => void;
  onSiteColumnChange: (columnId: string) => void;
  onRefColumnChange: (columnId: string) => void;
  onExtraSiteColumnsChange: (columnIds: string[]) => void;
  onExtraRefColumnsChange: (columnIds: string[]) => void;
  onMethodChange: (method: MCPMethod) => void;
}

function formatDateRange(startTime: string | null, endTime: string | null) {
  if (!startTime || !endTime) {
    return "Date range unavailable";
  }

  return `${new Date(startTime).toLocaleDateString()} to ${new Date(endTime).toLocaleDateString()}`;
}

function getSpeedColumns(datasetDetail: DatasetDetail | null) {
  return datasetDetail?.columns.filter((column) => column.measurement_type === "speed") ?? [];
}

function computeOverlap(site: DatasetSummary | undefined, reference: DatasetSummary | undefined) {
  if (!site?.start_time || !site?.end_time || !reference?.start_time || !reference?.end_time) {
    return null;
  }

  const start = new Date(Math.max(new Date(site.start_time).getTime(), new Date(reference.start_time).getTime()));
  const end = new Date(Math.min(new Date(site.end_time).getTime(), new Date(reference.end_time).getTime()));
  if (start.getTime() > end.getTime()) {
    return null;
  }

  const durationHours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
  return {
    start,
    end,
    durationHours,
  };
}

function estimatedRecovery(overlap: ReturnType<typeof computeOverlap>, site: DatasetSummary | undefined, reference: DatasetSummary | undefined, sampleCount: number | null) {
  if (!overlap || !site?.time_step_seconds || !reference?.time_step_seconds || sampleCount == null) {
    return null;
  }

  const stepSeconds = Math.max(site.time_step_seconds, reference.time_step_seconds);
  const expectedCount = Math.max(1, Math.round((overlap.durationHours * 3600) / stepSeconds) + 1);
  return Math.min(100, (sampleCount / expectedCount) * 100);
}

function DatasetColumnSelect({
  label,
  columns,
  value,
  onChange,
}: {
  label: string;
  columns: DatasetColumn[];
  value: string;
  onChange: (nextValue: string) => void;
}) {
  return (
    <label className="space-y-2 text-sm text-ink-700">
      <span className="font-medium text-ink-800">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200"
      >
        {columns.map((column) => (
          <option key={column.id} value={column.id}>
            {column.name}
            {column.height_m != null ? ` · ${column.height_m} m` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function MultiColumnPicker({
  title,
  columns,
  primaryColumnId,
  selectedColumnIds,
  onChange,
}: {
  title: string;
  columns: DatasetColumn[];
  primaryColumnId: string;
  selectedColumnIds: string[];
  onChange: (columnIds: string[]) => void;
}) {
  const optionalColumns = columns.filter((column) => column.id !== primaryColumnId);

  if (optionalColumns.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white/80 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
        <Layers3 className="h-4 w-4 text-teal-500" />
        {title}
      </div>
      <p className="mt-2 text-xs leading-6 text-ink-600">Optional extra channels for matrix MCP. Leave these cleared if you want to compare single-channel methods only.</p>
      <div className="mt-4 grid gap-2">
        {optionalColumns.map((column) => {
          const checked = selectedColumnIds.includes(column.id);
          return (
            <label key={column.id} className="flex items-center justify-between rounded-2xl border border-ink-100 bg-ink-50/70 px-3 py-2 text-sm text-ink-700">
              <span>
                {column.name}
                {column.height_m != null ? ` · ${column.height_m} m` : ""}
              </span>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...selectedColumnIds, column.id]);
                    return;
                  }
                  onChange(selectedColumnIds.filter((item) => item !== column.id));
                }}
                className="h-4 w-4 rounded border-ink-300 text-teal-500 focus:ring-teal-400"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function ReferenceDataSelector({
  datasets,
  siteDatasetId,
  refDatasetId,
  siteDetail,
  refDetail,
  siteColumnId,
  refColumnId,
  extraSiteColumnIds,
  extraRefColumnIds,
  method,
  correlationData,
  onSiteDatasetChange,
  onRefDatasetChange,
  onSiteColumnChange,
  onRefColumnChange,
  onExtraSiteColumnsChange,
  onExtraRefColumnsChange,
  onMethodChange,
}: ReferenceDataSelectorProps) {
  const siteDataset = datasets.find((dataset) => dataset.id === siteDatasetId);
  const referenceDataset = datasets.find((dataset) => dataset.id === refDatasetId);
  const overlap = computeOverlap(siteDataset, referenceDataset);
  const recovery = estimatedRecovery(overlap, siteDataset, referenceDataset, correlationData?.stats.sample_count ?? null);
  const siteSpeedColumns = getSpeedColumns(siteDetail);
  const refSpeedColumns = getSpeedColumns(refDetail);

  return (
    <section className="panel-surface p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Step 1</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">Select site and reference data</h2>
        </div>
        <div className="rounded-2xl bg-ink-900 px-4 py-3 text-xs uppercase tracking-[0.24em] text-emerald-200">MCP setup</div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="panel-muted p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
            <Wind className="h-4 w-4 text-teal-500" />
            Site dataset
          </div>
          <select
            value={siteDatasetId}
            onChange={(event) => onSiteDatasetChange(event.target.value)}
            className="mt-4 w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200"
          >
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs leading-6 text-ink-600">{formatDateRange(siteDataset?.start_time ?? null, siteDataset?.end_time ?? null)}</p>
          <DatasetColumnSelect label="Primary site column" columns={siteSpeedColumns} value={siteColumnId} onChange={onSiteColumnChange} />
          {method === "matrix" ? (
            <div className="mt-4">
              <MultiColumnPicker
                title="Additional site sensors"
                columns={siteSpeedColumns}
                primaryColumnId={siteColumnId}
                selectedColumnIds={extraSiteColumnIds}
                onChange={onExtraSiteColumnsChange}
              />
            </div>
          ) : null}
        </div>

        <div className="panel-muted p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
            <Database className="h-4 w-4 text-ember-500" />
            Reference dataset
          </div>
          <select
            value={refDatasetId}
            onChange={(event) => onRefDatasetChange(event.target.value)}
            className="mt-4 w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-ember-300 focus:ring-2 focus:ring-ember-100"
          >
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name}
                {dataset.source_type === "reanalysis" ? " · reference" : ""}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs leading-6 text-ink-600">{formatDateRange(referenceDataset?.start_time ?? null, referenceDataset?.end_time ?? null)}</p>
          <DatasetColumnSelect label="Primary reference column" columns={refSpeedColumns} value={refColumnId} onChange={onRefColumnChange} />
          {method === "matrix" ? (
            <div className="mt-4">
              <MultiColumnPicker
                title="Additional reference predictors"
                columns={refSpeedColumns}
                primaryColumnId={refColumnId}
                selectedColumnIds={extraRefColumnIds}
                onChange={onExtraRefColumnsChange}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        <div className="panel-muted p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
            <CalendarRange className="h-4 w-4 text-teal-500" />
            Concurrent overlap
          </div>
          {overlap ? (
            <>
              <p className="mt-3 text-sm leading-7 text-ink-700">
                {overlap.start.toLocaleDateString()} to {overlap.end.toLocaleDateString()} · {overlap.durationHours.toFixed(1)} hours overlap
              </p>
              <p className="text-sm leading-7 text-ink-600">
                {recovery != null ? `${recovery.toFixed(1)}% estimated overlap recovery from ${correlationData?.stats.sample_count ?? 0} concurrent samples.` : "Run correlation to calculate overlap recovery from concurrent samples."}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm leading-7 text-ink-600">The selected datasets do not currently overlap in time.</p>
          )}
        </div>

        <div className="panel-muted p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
            <Radar className="h-4 w-4 text-ember-500" />
            Method
          </div>
          <div className="mt-4 grid gap-2">
            {([
              ["linear", "Linear least squares"],
              ["variance_ratio", "Variance ratio"],
              ["matrix", "Matrix method"],
            ] as Array<[MCPMethod, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onMethodChange(value)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${method === value ? "border-teal-500 bg-teal-50 text-teal-900" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:text-ink-900"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}