import { Clock3, Download, FileJson, FileSpreadsheet, TableProperties } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { downloadCsvExport, downloadIeaJsonExport, downloadOpenwindExport, downloadWaspTabExport } from "../../api/export";
import type { DatasetColumn, DatasetDetail } from "../../types/dataset";
import type { ExportDownload, ExportFormat } from "../../types/export";
import type { Flag } from "../../types/qc";
import { LoadingSpinner } from "../common/LoadingSpinner";


interface ExportWizardProps {
  datasetDetail: DatasetDetail;
  flags: Flag[];
}


const exportFormats: Array<{ id: ExportFormat; label: string; description: string; icon: typeof FileSpreadsheet }> = [
  { id: "csv", label: "Clean CSV", description: "Flag-aware tabular export with optional resampling.", icon: FileSpreadsheet },
  { id: "wasp-tab", label: "WAsP TAB", description: "Sector frequency table with per-sector Weibull parameters.", icon: TableProperties },
  { id: "iea-json", label: "IEA Task 43 JSON", description: "Structured metadata and time-series export.", icon: FileJson },
  { id: "openwind", label: "Openwind", description: "Openwind-ready time-series CSV with separate date and time fields.", icon: Clock3 },
];


const resampleOptions = [
  { value: "", label: "Raw" },
  { value: "10min", label: "10-minute" },
  { value: "1h", label: "Hourly" },
  { value: "1D", label: "Daily" },
  { value: "1M", label: "Monthly" },
];


function defaultSelectedColumns(columns: DatasetColumn[]) {
  return columns.map((column) => column.id);
}


function isWindSpeedColumn(column: DatasetColumn) {
  return column.measurement_type === "speed";
}


function isDirectionColumn(column: DatasetColumn) {
  return column.measurement_type === "direction";
}


function trimPreview(content: string, format: ExportFormat) {
  const lines = content.split(/\r?\n/);
  const lineLimit = format === "iea-json" ? 28 : 18;
  if (lines.length <= lineLimit) {
    return content;
  }
  return `${lines.slice(0, lineLimit).join("\n")}\n...`;
}


function triggerDownload(download: ExportDownload) {
  const url = window.URL.createObjectURL(download.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = download.fileName;
  link.click();
  if (window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL(url);
  }
}


export function ExportWizard({ datasetDetail, flags }: ExportWizardProps) {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>(() => defaultSelectedColumns(datasetDetail.columns));
  const [excludedFlagIds, setExcludedFlagIds] = useState<string[]>([]);
  const [resample, setResample] = useState("");
  const [selectedSpeedColumnId, setSelectedSpeedColumnId] = useState("");
  const [selectedDirectionColumnId, setSelectedDirectionColumnId] = useState("");
  const [numSectors, setNumSectors] = useState<12 | 16 | 36>(12);
  const [speedBinWidth, setSpeedBinWidth] = useState("1");
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setSelectedColumnIds(defaultSelectedColumns(datasetDetail.columns));
    setExcludedFlagIds((current) => current.filter((flagId) => flags.some((flag) => flag.id === flagId)));
    setPreviewFileName(null);
    setPreviewText(null);
    setPreviewError(null);
    setDownloadError(null);

    const firstSpeedColumn = datasetDetail.columns.find(isWindSpeedColumn)?.id ?? "";
    const firstDirectionColumn = datasetDetail.columns.find(isDirectionColumn)?.id ?? "";
    setSelectedSpeedColumnId(firstSpeedColumn);
    setSelectedDirectionColumnId(firstDirectionColumn);
  }, [datasetDetail, flags]);

  const selectedColumns = useMemo(
    () => datasetDetail.columns.filter((column) => selectedColumnIds.includes(column.id)),
    [datasetDetail.columns, selectedColumnIds],
  );

  const canExport = useMemo(() => {
    if (format === "wasp-tab") {
      return Boolean(selectedSpeedColumnId && selectedDirectionColumnId);
    }
    return selectedColumnIds.length > 0;
  }, [format, selectedColumnIds.length, selectedDirectionColumnId, selectedSpeedColumnId]);

  function toggleColumn(columnId: string) {
    setSelectedColumnIds((current) => current.includes(columnId) ? current.filter((item) => item !== columnId) : [...current, columnId]);
  }

  function toggleFlag(flagId: string) {
    setExcludedFlagIds((current) => current.includes(flagId) ? current.filter((item) => item !== flagId) : [...current, flagId]);
  }

  async function requestExport(): Promise<ExportDownload> {
    const parsedSpeedBinWidth = Number(speedBinWidth);

    if (format === "csv") {
      return downloadCsvExport(datasetDetail.id, {
        column_ids: selectedColumnIds,
        exclude_flags: excludedFlagIds,
        ...(resample ? { resample } : {}),
      });
    }

    if (format === "wasp-tab") {
      return downloadWaspTabExport(datasetDetail.id, {
        speed_column_id: selectedSpeedColumnId,
        direction_column_id: selectedDirectionColumnId,
        exclude_flags: excludedFlagIds,
        num_sectors: numSectors,
        speed_bin_width: Number.isFinite(parsedSpeedBinWidth) && parsedSpeedBinWidth > 0 ? parsedSpeedBinWidth : 1,
      });
    }

    if (format === "openwind") {
      return downloadOpenwindExport(datasetDetail.id, {
        column_ids: selectedColumnIds,
        exclude_flags: excludedFlagIds,
        ...(resample ? { resample } : {}),
      });
    }

    return downloadIeaJsonExport(datasetDetail.id, {
      column_ids: selectedColumnIds,
      exclude_flags: excludedFlagIds,
      ...(resample ? { resample } : {}),
    });
  }

  async function handlePreview() {
    if (!canExport) {
      return;
    }

    setIsPreviewing(true);
    setPreviewError(null);
    setDownloadError(null);

    try {
      const download = await requestExport();
      const content = await download.blob.text();
      setPreviewFileName(download.fileName);
      setPreviewText(trimPreview(content, format));
    } catch (error) {
      setPreviewText(null);
      setPreviewFileName(null);
      setPreviewError(error instanceof Error ? error.message : "Unable to generate export preview");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleDownload() {
    if (!canExport) {
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const download = await requestExport();
      triggerDownload(download);
      if (!previewFileName) {
        setPreviewFileName(download.fileName);
      }
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to download export");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.95fr)]">
      <section className="panel-surface p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-ember-500">Export options</span>
            <h2 className="mt-3 text-2xl font-semibold text-ink-900">Choose a delivery format and scope</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-600">
              Preview is generated from the same backend download endpoint used for the final file, so the panel reflects the actual exported content.
            </p>
          </div>
          <div className="rounded-2xl border border-ink-100 bg-ink-50 px-4 py-3 text-right text-sm text-ink-600">
            <div className="font-medium text-ink-900">{datasetDetail.name}</div>
            <div>{datasetDetail.row_count.toLocaleString()} rows</div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {exportFormats.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFormat(item.id)}
              className={[
                "rounded-[24px] border px-4 py-4 text-left transition",
                format === item.id ? "border-teal-400 bg-teal-50 shadow-sm" : "border-ink-100 bg-white hover:border-ink-200",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5 text-teal-600" />
                <span className="text-sm font-semibold text-ink-900">{item.label}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-600">{item.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
          <div className="space-y-6">
            {format !== "wasp-tab" ? (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-ink-900">Columns</label>
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={() => setSelectedColumnIds(defaultSelectedColumns(datasetDetail.columns))} className="rounded-full border border-ink-200 px-3 py-1 text-ink-600">
                      Select all
                    </button>
                    <button type="button" onClick={() => setSelectedColumnIds([])} className="rounded-full border border-ink-200 px-3 py-1 text-ink-600">
                      Clear
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {datasetDetail.columns.map((column) => (
                    <label key={column.id} className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-sm text-ink-700">
                      <input type="checkbox" checked={selectedColumnIds.includes(column.id)} onChange={() => toggleColumn(column.id)} className="mt-1 rounded border-ink-300 text-teal-600" />
                      <span>
                        <span className="block font-medium text-ink-900">{column.name}</span>
                        <span className="block text-xs uppercase tracking-[0.22em] text-ink-500">
                          {column.measurement_type ?? "other"}
                          {column.height_m != null ? ` • ${column.height_m}m` : ""}
                          {column.unit ? ` • ${column.unit}` : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-ink-800">
                  Speed column
                  <select value={selectedSpeedColumnId} onChange={(event) => setSelectedSpeedColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                    <option value="">Select wind speed column</option>
                    {datasetDetail.columns.filter(isWindSpeedColumn).map((column) => (
                      <option key={column.id} value={column.id}>{column.name}</option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium text-ink-800">
                  Direction column
                  <select value={selectedDirectionColumnId} onChange={(event) => setSelectedDirectionColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                    <option value="">Select direction column</option>
                    {datasetDetail.columns.filter(isDirectionColumn).map((column) => (
                      <option key={column.id} value={column.id}>{column.name}</option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium text-ink-800">
                  Number of sectors
                  <select value={numSectors} onChange={(event) => setNumSectors(Number(event.target.value) as 12 | 16 | 36)} className="rounded-2xl border-ink-200 bg-white">
                    <option value={12}>12 sectors</option>
                    <option value={16}>16 sectors</option>
                    <option value={36}>36 sectors</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium text-ink-800">
                  Speed bin width (m/s)
                  <input value={speedBinWidth} onChange={(event) => setSpeedBinWidth(event.target.value)} className="rounded-2xl border-ink-200 bg-white" inputMode="decimal" />
                </label>
              </div>
            )}

            {format !== "wasp-tab" ? (
              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Resample
                <select value={resample} onChange={(event) => setResample(event.target.value)} className="max-w-xs rounded-2xl border-ink-200 bg-white">
                  {resampleOptions.map((option) => (
                    <option key={option.value || "raw"} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="space-y-4 rounded-[28px] border border-ink-100 bg-ink-50/70 p-5">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">QC exclusions</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">Choose which flags should be excluded from the exported file.</p>
            </div>

            {flags.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-4 py-5 text-sm text-ink-500">No dataset flags are available yet.</div>
            ) : (
              <div className="space-y-3">
                {flags.map((flag) => (
                  <label key={flag.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white bg-white px-4 py-3 text-sm text-ink-700 shadow-sm">
                    <span className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: flag.color ?? "#94a3b8" }} />
                      <span>
                        <span className="block font-medium text-ink-900">{flag.name}</span>
                        <span className="block text-xs text-ink-500">{flag.flagged_count} flagged ranges</span>
                      </span>
                    </span>
                    <input type="checkbox" checked={excludedFlagIds.includes(flag.id)} onChange={() => toggleFlag(flag.id)} className="rounded border-ink-300 text-teal-600" />
                  </label>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-4 py-4 text-sm text-ink-600">
              {format === "wasp-tab"
                ? `${selectedSpeedColumnId && selectedDirectionColumnId ? "Directional frequency table ready" : "Choose speed and direction columns to continue"}`
                : format === "openwind"
                  ? `${selectedColumns.length} selected columns will be exported with Openwind date/time fields.`
                  : `${selectedColumns.length} selected columns will be exported.`}
            </div>
          </div>
        </div>

        {(previewError || downloadError) ? (
          <div className="mt-6 space-y-3">
            {previewError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{previewError}</div> : null}
            {downloadError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{downloadError}</div> : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => void handlePreview()} disabled={!canExport || isPreviewing || isDownloading} className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60">
            {isPreviewing ? <LoadingSpinner label="Generating preview" /> : "Preview export"}
          </button>
          <button type="button" onClick={() => void handleDownload()} disabled={!canExport || isDownloading || isPreviewing} className="inline-flex items-center gap-2 rounded-full border border-ink-300 bg-white px-5 py-3 text-sm font-semibold text-ink-800 transition hover:border-ink-400 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60">
            <Download className="h-4 w-4" />
            {isDownloading ? "Preparing download" : "Download file"}
          </button>
        </div>
      </section>

      <section className="panel-surface flex min-h-[520px] flex-col p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-teal-600">Preview</span>
            <h2 className="mt-3 text-2xl font-semibold text-ink-900">File excerpt</h2>
            <p className="mt-3 text-sm leading-7 text-ink-600">
              {previewFileName ? previewFileName : "Generate a preview to inspect the first lines before downloading."}
            </p>
          </div>
        </div>

        <div className="mt-6 flex-1 overflow-hidden rounded-[24px] border border-ink-100 bg-ink-950 text-sm text-ink-100 shadow-inner">
          {isPreviewing ? (
            <div className="flex h-full items-center justify-center p-6">
              <LoadingSpinner label="Rendering preview" />
            </div>
          ) : previewText ? (
            <pre className="h-full overflow-auto p-5 font-mono text-xs leading-6">{previewText}</pre>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-300">
              Export preview will appear here once a format and dataset scope have been selected.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}