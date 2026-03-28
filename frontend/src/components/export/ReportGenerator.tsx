import { FileText, FileType2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { downloadProjectReport } from "../../api/reports";
import type { PowerCurveLibraryItem } from "../../types/analysis";
import type { DatasetDetail } from "../../types/dataset";
import type { Flag } from "../../types/qc";
import type { ReportDownload, ReportFormat, ReportSectionId } from "../../types/report";


interface ReportGeneratorProps {
  projectId: string;
  projectName: string;
  datasetDetail: DatasetDetail;
  flags: Flag[];
  powerCurves: PowerCurveLibraryItem[];
}


const sectionOptions: Array<{ id: ReportSectionId; label: string; description: string }> = [
  { id: "title_page", label: "Title Page", description: "Project, dataset, and generation metadata." },
  { id: "executive_summary", label: "Executive Summary", description: "Mean speed, Weibull fit, and a compact summary of results." },
  { id: "site_description", label: "Site Description", description: "Project coordinates, elevation, and measured channels." },
  { id: "data_summary", label: "Data Summary", description: "Date range, row count, time step, and channel recovery snapshot." },
  { id: "qc_summary", label: "QC Summary", description: "Flag inventory and which exclusions were applied." },
  { id: "wind_rose", label: "Wind Rose", description: "Directional frequency chart using the selected speed and direction columns." },
  { id: "frequency_distribution", label: "Frequency Distribution", description: "Histogram with a Weibull overlay when speed data is available." },
  { id: "wind_shear", label: "Wind Shear", description: "Vertical profile and pairwise shear statistics when multiple heights exist." },
  { id: "turbulence", label: "Turbulence", description: "Representative TI by speed bin when speed SD or TI data exists." },
  { id: "air_density", label: "Air Density", description: "Monthly density profile using measured or elevation-estimated pressure." },
  { id: "extreme_wind", label: "Extreme Wind", description: "Annual maxima and return-period fit for extreme-wind reporting." },
  { id: "long_term_adjustment", label: "Long-Term Adjustment", description: "Embeds the latest stored MCP result if one exists for the dataset." },
  { id: "energy_estimate", label: "Energy Estimate", description: "Uses the selected power curve for a gross energy estimate." },
];


const defaultSections = sectionOptions.filter((section) => section.id !== "long_term_adjustment").map((section) => section.id);


function triggerDownload(download: ReportDownload) {
  const url = window.URL.createObjectURL(download.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = download.fileName;
  link.click();
  if (window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL(url);
  }
}


function selectFirstColumnId(datasetDetail: DatasetDetail, measurementTypes: string[]) {
  return datasetDetail.columns.find((column) => column.measurement_type != null && measurementTypes.includes(column.measurement_type))?.id ?? "";
}


function selectSpeedColumnIds(datasetDetail: DatasetDetail) {
  return datasetDetail.columns.filter((column) => column.measurement_type === "speed").map((column) => column.id);
}


export function ReportGenerator({ projectId, projectName, datasetDetail, flags, powerCurves }: ReportGeneratorProps) {
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [title, setTitle] = useState(`${projectName} Wind Resource Report`);
  const [selectedSections, setSelectedSections] = useState<ReportSectionId[]>(defaultSections);
  const [excludedFlagIds, setExcludedFlagIds] = useState<string[]>([]);
  const [selectedSpeedColumnId, setSelectedSpeedColumnId] = useState("");
  const [selectedDirectionColumnId, setSelectedDirectionColumnId] = useState("");
  const [selectedTemperatureColumnId, setSelectedTemperatureColumnId] = useState("");
  const [selectedPressureColumnId, setSelectedPressureColumnId] = useState("");
  const [selectedTurbulenceColumnId, setSelectedTurbulenceColumnId] = useState("");
  const [selectedGustColumnId, setSelectedGustColumnId] = useState("");
  const [selectedShearColumnIds, setSelectedShearColumnIds] = useState<string[]>([]);
  const [selectedPowerCurveId, setSelectedPowerCurveId] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadedFileName, setDownloadedFileName] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setTitle(`${projectName} Wind Resource Report`);
  }, [projectName]);

  useEffect(() => {
    setSelectedSpeedColumnId(selectFirstColumnId(datasetDetail, ["speed"]));
    setSelectedDirectionColumnId(selectFirstColumnId(datasetDetail, ["direction"]));
    setSelectedTemperatureColumnId(selectFirstColumnId(datasetDetail, ["temperature"]));
    setSelectedPressureColumnId(selectFirstColumnId(datasetDetail, ["pressure"]));
    setSelectedTurbulenceColumnId(selectFirstColumnId(datasetDetail, ["speed_sd", "turbulence_intensity"]));
    setSelectedGustColumnId(selectFirstColumnId(datasetDetail, ["gust"]));
    setSelectedShearColumnIds(selectSpeedColumnIds(datasetDetail));
    setExcludedFlagIds((current) => current.filter((flagId) => flags.some((flag) => flag.id === flagId)));
    setDownloadedFileName(null);
    setDownloadError(null);
  }, [datasetDetail, flags]);

  const selectedFlagCount = excludedFlagIds.length;
  const canGenerate = selectedSections.length > 0;

  const sectionSummary = useMemo(() => {
    return sectionOptions.filter((section) => selectedSections.includes(section.id));
  }, [selectedSections]);

  function toggleSection(sectionId: ReportSectionId) {
    setSelectedSections((current) => current.includes(sectionId)
      ? current.filter((item) => item !== sectionId)
      : [...current, sectionId]);
  }

  function toggleFlag(flagId: string) {
    setExcludedFlagIds((current) => current.includes(flagId)
      ? current.filter((item) => item !== flagId)
      : [...current, flagId]);
  }

  function toggleShearColumn(columnId: string) {
    setSelectedShearColumnIds((current) => current.includes(columnId)
      ? current.filter((item) => item !== columnId)
      : [...current, columnId]);
  }

  async function handleDownload() {
    if (!canGenerate) {
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const download = await downloadProjectReport(projectId, {
        dataset_id: datasetDetail.id,
        sections: selectedSections,
        exclude_flags: excludedFlagIds,
        format,
        title: title.trim() || undefined,
        column_selection: {
          ...(selectedSpeedColumnId ? { speed_column_id: selectedSpeedColumnId } : {}),
          ...(selectedDirectionColumnId ? { direction_column_id: selectedDirectionColumnId } : {}),
          ...(selectedTemperatureColumnId ? { temperature_column_id: selectedTemperatureColumnId } : {}),
          ...(selectedPressureColumnId ? { pressure_column_id: selectedPressureColumnId } : {}),
          ...(selectedTurbulenceColumnId ? { turbulence_column_id: selectedTurbulenceColumnId } : {}),
          ...(selectedGustColumnId ? { gust_column_id: selectedGustColumnId } : {}),
          ...(selectedShearColumnIds.length > 0 ? { shear_column_ids: selectedShearColumnIds } : {}),
        },
        ...(selectedPowerCurveId ? { power_curve_id: selectedPowerCurveId } : {}),
      });
      setDownloadedFileName(download.fileName);
      triggerDownload(download);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to generate report");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
      <section className="panel-surface p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-amber-600">Report generator</span>
            <h2 className="mt-3 text-2xl font-semibold text-ink-900">Build a Word or PDF analysis report</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-600">
              The report is generated on the backend from the selected dataset and current QC exclusions. Sections that do not have enough source data are still included with an explicit note instead of failing the whole document.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-900">
            <div className="font-medium">{datasetDetail.name}</div>
            <div>{datasetDetail.row_count.toLocaleString()} rows</div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(250px,0.9fr)]">
          <div className="space-y-6">
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Report title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-2xl border-ink-200 bg-white"
                placeholder="Wind resource assessment report"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setFormat("pdf")}
                className={[
                  "rounded-[24px] border px-4 py-4 text-left transition",
                  format === "pdf" ? "border-amber-400 bg-amber-50 shadow-sm" : "border-ink-100 bg-white hover:border-ink-200",
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-amber-700" />
                  <span className="text-sm font-semibold text-ink-900">PDF report</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink-600">Best for sharing, review, and fixed-layout deliverables.</p>
              </button>

              <button
                type="button"
                onClick={() => setFormat("docx")}
                className={[
                  "rounded-[24px] border px-4 py-4 text-left transition",
                  format === "docx" ? "border-amber-400 bg-amber-50 shadow-sm" : "border-ink-100 bg-white hover:border-ink-200",
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  <FileType2 className="h-5 w-5 text-amber-700" />
                  <span className="text-sm font-semibold text-ink-900">Word report</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink-600">Best when the report needs manual editing after generation.</p>
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-semibold text-ink-900">Sections</label>
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={() => setSelectedSections(sectionOptions.map((section) => section.id))} className="rounded-full border border-ink-200 px-3 py-1 text-ink-600">
                    Select all
                  </button>
                  <button type="button" onClick={() => setSelectedSections(defaultSections)} className="rounded-full border border-ink-200 px-3 py-1 text-ink-600">
                    Reset
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                {sectionOptions.map((section) => (
                  <label key={section.id} className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={selectedSections.includes(section.id)}
                      onChange={() => toggleSection(section.id)}
                      className="mt-1 rounded border-ink-300 text-amber-600"
                    />
                    <span>
                      <span className="block font-medium text-ink-900">{section.label}</span>
                      <span className="mt-1 block text-sm leading-6 text-ink-600">{section.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-[28px] border border-ink-100 bg-ink-50/70 p-5">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Report inputs</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">These selections control which dataset columns and turbine curve feed the generated report sections.</p>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Primary speed column
                <select value={selectedSpeedColumnId} onChange={(event) => setSelectedSpeedColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                  <option value="">Auto-detect on backend</option>
                  {datasetDetail.columns.filter((column) => column.measurement_type === "speed").map((column) => (
                    <option key={column.id} value={column.id}>{column.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Direction column
                <select value={selectedDirectionColumnId} onChange={(event) => setSelectedDirectionColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                  <option value="">Auto-detect on backend</option>
                  {datasetDetail.columns.filter((column) => column.measurement_type === "direction").map((column) => (
                    <option key={column.id} value={column.id}>{column.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Temperature column
                <select value={selectedTemperatureColumnId} onChange={(event) => setSelectedTemperatureColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                  <option value="">Auto-detect on backend</option>
                  {datasetDetail.columns.filter((column) => column.measurement_type === "temperature").map((column) => (
                    <option key={column.id} value={column.id}>{column.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Pressure column
                <select value={selectedPressureColumnId} onChange={(event) => setSelectedPressureColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                  <option value="">Auto-detect or estimate from elevation</option>
                  {datasetDetail.columns.filter((column) => column.measurement_type === "pressure").map((column) => (
                    <option key={column.id} value={column.id}>{column.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Turbulence column
                <select value={selectedTurbulenceColumnId} onChange={(event) => setSelectedTurbulenceColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                  <option value="">Auto-detect on backend</option>
                  {datasetDetail.columns.filter((column) => ["speed_sd", "turbulence_intensity"].includes(column.measurement_type ?? "")).map((column) => (
                    <option key={column.id} value={column.id}>{column.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Gust column
                <select value={selectedGustColumnId} onChange={(event) => setSelectedGustColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                  <option value="">Auto-detect on backend</option>
                  {datasetDetail.columns.filter((column) => column.measurement_type === "gust").map((column) => (
                    <option key={column.id} value={column.id}>{column.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Power curve
                <select value={selectedPowerCurveId} onChange={(event) => setSelectedPowerCurveId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                  <option value="">Default seeded curve</option>
                  {powerCurves.map((curve) => (
                    <option key={curve.id} value={curve.id}>{curve.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-900">Wind-shear speed columns</h3>
                <button type="button" onClick={() => setSelectedShearColumnIds(selectSpeedColumnIds(datasetDetail))} className="rounded-full border border-ink-200 px-3 py-1 text-xs text-ink-600">
                  Select all
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {datasetDetail.columns.filter((column) => column.measurement_type === "speed").map((column) => (
                  <label key={column.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white bg-white px-4 py-3 text-sm text-ink-700 shadow-sm">
                    <span>
                      <span className="block font-medium text-ink-900">{column.name}</span>
                      <span className="block text-xs text-ink-500">{column.height_m != null ? `${column.height_m} m` : "Height not set"}</span>
                    </span>
                    <input type="checkbox" checked={selectedShearColumnIds.includes(column.id)} onChange={() => toggleShearColumn(column.id)} className="rounded border-ink-300 text-amber-600" />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-ink-900">QC exclusions</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">Exclude any flag ranges that should be removed before report metrics and figures are calculated.</p>
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
                    <input type="checkbox" checked={excludedFlagIds.includes(flag.id)} onChange={() => toggleFlag(flag.id)} className="rounded border-ink-300 text-amber-600" />
                  </label>
                ))}
              </div>
            )}

            <div className="panel-muted px-4 py-4 text-sm text-ink-700">
              <div className="flex items-center gap-2 font-medium text-ink-900">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                Output summary
              </div>
              <p className="mt-2 leading-6">
                {selectedSections.length} sections selected. {selectedFlagCount} QC exclusions will be applied. The generated report uses the explicit input selections shown above for {datasetDetail.name}.
              </p>
            </div>

            {downloadError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{downloadError}</div> : null}
            {downloadedFileName ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Last generated file: {downloadedFileName}</div> : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!canGenerate || isDownloading}
            className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileText className="h-4 w-4" />
            {isDownloading ? "Generating report" : `Generate ${format.toUpperCase()} report`}
          </button>
        </div>
      </section>

      <section className="panel-surface p-6 sm:p-7">
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-teal-600">Section scope</span>
        <h2 className="mt-3 text-2xl font-semibold text-ink-900">Included content</h2>
        <p className="mt-3 text-sm leading-7 text-ink-600">
          This panel shows exactly which sections will be requested from the backend. The server fills each section from the selected dataset inputs and inserts an explicit note when a required input column is missing.
        </p>

        <div className="mt-6 space-y-3">
          {sectionSummary.map((section) => (
            <div key={section.id} className="rounded-[24px] border border-ink-100 bg-white px-4 py-4">
              <div className="text-sm font-semibold text-ink-900">{section.label}</div>
              <p className="mt-2 text-sm leading-6 text-ink-600">{section.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
