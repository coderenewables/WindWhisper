import { CalendarRange, Database, Download, KeyRound, Layers3, Radar, Wind } from "lucide-react";

import type { DatasetColumn, DatasetDetail, DatasetSummary } from "../../types/dataset";
import type { MCPCorrelationResponse, MCPMethod, MCPReferenceDataSource, MCPReferenceDownloadStatusResponse } from "../../types/analysis";

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
  downloadSource: MCPReferenceDataSource;
  downloadLatitude: string;
  downloadLongitude: string;
  downloadStartYear: string;
  downloadEndYear: string;
  downloadDatasetName: string;
  downloadApiKey: string;
  downloadStatus: MCPReferenceDownloadStatusResponse | null;
  downloadError: string | null;
  isDownloading: boolean;
  onSiteDatasetChange: (datasetId: string) => void;
  onRefDatasetChange: (datasetId: string) => void;
  onSiteColumnChange: (columnId: string) => void;
  onRefColumnChange: (columnId: string) => void;
  onExtraSiteColumnsChange: (columnIds: string[]) => void;
  onExtraRefColumnsChange: (columnIds: string[]) => void;
  onMethodChange: (method: MCPMethod) => void;
  onDownloadSourceChange: (source: MCPReferenceDataSource) => void;
  onDownloadLatitudeChange: (value: string) => void;
  onDownloadLongitudeChange: (value: string) => void;
  onDownloadStartYearChange: (value: string) => void;
  onDownloadEndYearChange: (value: string) => void;
  onDownloadDatasetNameChange: (value: string) => void;
  onDownloadApiKeyChange: (value: string) => void;
  onStartDownload: () => void;
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
  const hasColumns = columns.length > 0;

  return (
    <label className="space-y-2 text-sm text-ink-700">
      <span className="font-medium text-ink-800">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={!hasColumns}
        className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200"
      >
        {!hasColumns ? <option value="">No speed columns available</option> : null}
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
  downloadSource,
  downloadLatitude,
  downloadLongitude,
  downloadStartYear,
  downloadEndYear,
  downloadDatasetName,
  downloadApiKey,
  downloadStatus,
  downloadError,
  isDownloading,
  onSiteDatasetChange,
  onRefDatasetChange,
  onSiteColumnChange,
  onRefColumnChange,
  onExtraSiteColumnsChange,
  onExtraRefColumnsChange,
  onMethodChange,
  onDownloadSourceChange,
  onDownloadLatitudeChange,
  onDownloadLongitudeChange,
  onDownloadStartYearChange,
  onDownloadEndYearChange,
  onDownloadDatasetNameChange,
  onDownloadApiKeyChange,
  onStartDownload,
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
            {datasets.length === 0 ? <option value="">No datasets available</option> : null}
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
            <option value="">Select a reference dataset</option>
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

      <div className="mt-6 panel-muted p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
          <Download className="h-4 w-4 text-ember-500" />
          Download reference data
        </div>
        <p className="mt-3 text-sm leading-7 text-ink-600">Fetch a new reanalysis dataset into this project without leaving the MCP workspace. ERA5 requires a user-provided EarthDataHub key. MERRA-2 uses NASA POWER Hourly.</p>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,220px)_repeat(2,minmax(0,1fr))]">
          <label className="space-y-2 text-sm text-ink-700">
            <span className="font-medium text-ink-800">Source</span>
            <select
              value={downloadSource}
              onChange={(event) => onDownloadSourceChange(event.target.value as MCPReferenceDataSource)}
              className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-ember-300 focus:ring-2 focus:ring-ember-100"
            >
              <option value="era5">ERA5 EarthDataHub</option>
              <option value="merra2">MERRA-2 POWER Hourly</option>
            </select>
          </label>

          <label className="space-y-2 text-sm text-ink-700">
            <span className="font-medium text-ink-800">Latitude</span>
            <input
              value={downloadLatitude}
              onChange={(event) => onDownloadLatitudeChange(event.target.value)}
              inputMode="decimal"
              className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200"
            />
          </label>

          <label className="space-y-2 text-sm text-ink-700">
            <span className="font-medium text-ink-800">Longitude</span>
            <input
              value={downloadLongitude}
              onChange={(event) => onDownloadLongitudeChange(event.target.value)}
              inputMode="decimal"
              className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[repeat(2,minmax(0,160px))_minmax(0,1fr)]">
          <label className="space-y-2 text-sm text-ink-700">
            <span className="font-medium text-ink-800">Start year</span>
            <input
              value={downloadStartYear}
              onChange={(event) => onDownloadStartYearChange(event.target.value)}
              inputMode="numeric"
              className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200"
            />
          </label>

          <label className="space-y-2 text-sm text-ink-700">
            <span className="font-medium text-ink-800">End year</span>
            <input
              value={downloadEndYear}
              onChange={(event) => onDownloadEndYearChange(event.target.value)}
              inputMode="numeric"
              className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200"
            />
          </label>

          <label className="space-y-2 text-sm text-ink-700">
            <span className="font-medium text-ink-800">Dataset name</span>
            <input
              value={downloadDatasetName}
              onChange={(event) => onDownloadDatasetNameChange(event.target.value)}
              placeholder="Optional custom dataset name"
              className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200"
            />
          </label>
        </div>

        {downloadSource === "era5" ? (
          <label className="mt-4 block space-y-2 text-sm text-ink-700">
            <span className="flex items-center gap-2 font-medium text-ink-800">
              <KeyRound className="h-4 w-4 text-ember-500" />
              EarthDataHub API key
            </span>
            <input
              type="password"
              value={downloadApiKey}
              onChange={(event) => onDownloadApiKeyChange(event.target.value)}
              placeholder="Paste your EarthDataHub / DestinE key"
              className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-ember-300 focus:ring-2 focus:ring-ember-100"
            />
            <p className="text-xs leading-6 text-ink-600">The key is used only for this request flow and is not stored in the project metadata returned to the UI.</p>
          </label>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-ink-200 bg-white/70 px-4 py-3 text-sm text-ink-600">NASA POWER Hourly access does not require a separate user credential for this flow.</div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onStartDownload}
            disabled={isDownloading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ember-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-ember-400 disabled:cursor-not-allowed disabled:bg-ember-200"
          >
            <Download className="h-4 w-4" />
            {isDownloading ? "Downloading reference data..." : "Download reference data"}
          </button>
          {downloadStatus ? <span className="text-sm text-ink-600">{downloadStatus.progress}% · {downloadStatus.message}</span> : null}
        </div>

        {downloadError ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{downloadError}</div> : null}
        {downloadStatus?.status === "completed" ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Imported {downloadStatus.dataset_name ?? "reference dataset"} with {downloadStatus.row_count} rows and {downloadStatus.column_count} columns.
          </div>
        ) : null}
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