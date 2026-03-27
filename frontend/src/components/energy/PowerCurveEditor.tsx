import * as d3 from "d3";
import { Save, Trash2, Upload } from "lucide-react";
import { useMemo, type ChangeEvent } from "react";

import type { PowerCurveLibraryItem, PowerCurvePoint } from "../../types/analysis";

interface PowerCurveEditorProps {
  points: PowerCurvePoint[];
  curveName: string;
  savedCurves: PowerCurveLibraryItem[];
  selectedSavedCurveId: string;
  isUploading: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  uploadError: string | null;
  saveError: string | null;
  onChange: (points: PowerCurvePoint[]) => void;
  onCurveNameChange: (value: string) => void;
  onSelectSavedCurve: (curveId: string) => void;
  onUpload: (file: File) => void;
  onUseDefaultCurve: () => void;
  onSave: () => void;
  onDelete: () => void;
}

const chartWidth = 440;
const chartHeight = 260;
const margin = { top: 16, right: 20, bottom: 38, left: 56 };

function summarize(points: PowerCurvePoint[]) {
  const clean = points
    .filter((point) => Number.isFinite(point.wind_speed_ms) && Number.isFinite(point.power_kw))
    .slice()
    .sort((left, right) => left.wind_speed_ms - right.wind_speed_ms);
  const ratedPower = clean.reduce((max, point) => Math.max(max, point.power_kw), 0);
  const cutIn = clean.find((point) => point.power_kw > 0)?.wind_speed_ms ?? null;
  const ratedSpeed = clean.find((point) => point.power_kw >= ratedPower * 0.99)?.wind_speed_ms ?? null;
  const cutOut = clean.length > 0 ? clean[clean.length - 1].wind_speed_ms : null;
  return {
    clean,
    ratedPower,
    cutIn,
    ratedSpeed,
    cutOut,
  };
}

function formatValue(value: number | null | undefined, digits = 1, suffix = "") {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

export function PowerCurveEditor({
  points,
  curveName,
  savedCurves,
  selectedSavedCurveId,
  isUploading,
  isSaving,
  isDeleting,
  uploadError,
  saveError,
  onChange,
  onCurveNameChange,
  onSelectSavedCurve,
  onUpload,
  onUseDefaultCurve,
  onSave,
  onDelete,
}: PowerCurveEditorProps) {
  const chart = useMemo(() => {
    const summary = summarize(points);
    if (summary.clean.length < 2) {
      return null;
    }

    const innerWidth = chartWidth - margin.left - margin.right;
    const innerHeight = chartHeight - margin.top - margin.bottom;
    const xScale = d3.scaleLinear().domain([0, d3.max(summary.clean, (point) => point.wind_speed_ms) ?? 1]).nice().range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([0, d3.max(summary.clean, (point) => point.power_kw) ?? 1]).nice().range([innerHeight, 0]);
    const line = d3
      .line<PowerCurvePoint>()
      .x((point) => xScale(point.wind_speed_ms))
      .y((point) => yScale(point.power_kw))(summary.clean);

    return {
      ...summary,
      innerWidth,
      innerHeight,
      xScale,
      yScale,
      line,
      xTicks: xScale.ticks(6),
      yTicks: yScale.ticks(5),
    };
  }, [points]);

  function updatePoint(index: number, key: keyof PowerCurvePoint, value: string) {
    const next = points.map((point, pointIndex) => {
      if (pointIndex !== index) {
        return point;
      }
      return {
        ...point,
        [key]: value === "" ? 0 : Number(value),
      };
    });
    onChange(next);
  }

  function addPoint() {
    const last = points.length > 0 ? points[points.length - 1] : undefined;
    const nextSpeed = last ? last.wind_speed_ms + 1 : 0;
    onChange([...points, { wind_speed_ms: nextSpeed, power_kw: last?.power_kw ?? 0 }]);
  }

  function removePoint(index: number) {
    onChange(points.filter((_, pointIndex) => pointIndex !== index));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    event.target.value = "";
  }

  const summary = summarize(points);

  return (
    <section className="panel-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-ink-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember-500">Power curve</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">Upload or edit a turbine power curve</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-600">
            Import a CSV with wind speed and power columns, or edit the speed-power pairs directly before running the gross energy estimate.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="grid min-w-[220px] gap-2 text-sm font-medium text-ink-800">
            Saved curves
            <select value={selectedSavedCurveId} onChange={(event) => onSelectSavedCurve(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
              <option value="">Unsaved curve</option>
              {savedCurves.map((curve) => (
                <option key={curve.id} value={curve.id}>{curve.name}</option>
              ))}
            </select>
          </label>
          <label className="grid min-w-[220px] gap-2 text-sm font-medium text-ink-800">
            Curve name
            <input value={curveName} onChange={(event) => onCurveNameChange(event.target.value)} placeholder="Example: Generic 3 MW" className="rounded-2xl border-ink-200 bg-white" />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800 transition hover:border-teal-300 hover:text-teal-700">
            <Upload className="h-4 w-4" />
            <span>{isUploading ? "Uploading..." : "Upload CSV"}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} disabled={isUploading} />
          </label>
          <button type="button" onClick={onUseDefaultCurve} className="rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800 transition hover:border-teal-300 hover:text-teal-700">
            Use Default Curve
          </button>
          <button type="button" onClick={addPoint} className="rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-700">
            Add Point
          </button>
          <button type="button" onClick={onSave} disabled={isSaving || curveName.trim().length === 0 || points.length < 2} className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800 transition hover:border-teal-300 hover:text-teal-700 disabled:opacity-60">
            <Save className="h-4 w-4" />
            <span>{isSaving ? "Saving..." : selectedSavedCurveId ? "Update Saved Curve" : "Save Curve"}</span>
          </button>
          <button type="button" onClick={onDelete} disabled={isDeleting || !selectedSavedCurveId} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50">
            <Trash2 className="h-4 w-4" />
            <span>{isDeleting ? "Deleting..." : "Delete Saved Curve"}</span>
          </button>
        </div>
      </div>

      {uploadError ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{uploadError}</div> : null}
      {saveError ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{saveError}</div> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,248,0.88))] px-4 py-5">
          <h3 className="text-lg font-semibold text-ink-900">Curve preview</h3>
          {chart ? (
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="mt-4 w-full">
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {chart.xTicks.map((tick) => (
                  <g key={`x-${tick}`} transform={`translate(${chart.xScale(tick)}, 0)`}>
                    <line y1={0} y2={chart.innerHeight} stroke="rgba(24,36,47,0.08)" strokeDasharray="4 6" />
                    <text y={chart.innerHeight + 22} textAnchor="middle" className="fill-ink-500 text-[10px] font-medium">{tick.toFixed(0)}</text>
                  </g>
                ))}
                {chart.yTicks.map((tick) => (
                  <g key={`y-${tick}`} transform={`translate(0, ${chart.yScale(tick)})`}>
                    <line x1={0} x2={chart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.08)" strokeDasharray="4 6" />
                    <text x={-10} y={4} textAnchor="end" className="fill-ink-500 text-[10px] font-medium">{tick.toFixed(0)}</text>
                  </g>
                ))}
                {chart.line ? <path d={chart.line} fill="none" stroke="#1f8f84" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
                {chart.clean.map((point) => (
                  <circle key={`${point.wind_speed_ms}-${point.power_kw}`} cx={chart.xScale(point.wind_speed_ms)} cy={chart.yScale(point.power_kw)} r={4} fill="#f06f32" />
                ))}
                <text x={chart.innerWidth / 2} y={chart.innerHeight + 34} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Wind speed (m/s)</text>
                <text transform={`translate(${-40}, ${chart.innerHeight / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Power (kW)</text>
              </g>
            </svg>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-ink-200 px-4 py-10 text-sm text-ink-500">
              Add at least two valid points to preview the curve.
            </div>
          )}
        </div>

        <div className="panel-muted px-4 py-4">
          <h3 className="text-lg font-semibold text-ink-900">Curve summary</h3>
          <div className="mt-4 space-y-3 text-sm text-ink-700">
            <div className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">Rated power</div>
              <div className="mt-1 text-xl font-semibold text-ink-900">{formatValue(summary.ratedPower, 0, " kW")}</div>
            </div>
            <div className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">Cut-in speed</div>
              <div className="mt-1 text-lg font-semibold text-ink-900">{formatValue(summary.cutIn, 1, " m/s")}</div>
            </div>
            <div className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">Rated speed</div>
              <div className="mt-1 text-lg font-semibold text-ink-900">{formatValue(summary.ratedSpeed, 1, " m/s")}</div>
            </div>
            <div className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">Cut-out speed</div>
              <div className="mt-1 text-lg font-semibold text-ink-900">{formatValue(summary.cutOut, 1, " m/s")}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.16em] text-ink-500">
              <th className="px-3 py-2">Wind speed (m/s)</th>
              <th className="px-3 py-2">Power (kW)</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={`${index}-${point.wind_speed_ms}-${point.power_kw}`} className="rounded-2xl bg-white/80 text-ink-800 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <td className="px-3 py-3">
                  <input type="number" min="0" step="0.1" value={point.wind_speed_ms} onChange={(event) => updatePoint(index, "wind_speed_ms", event.target.value)} className="w-full rounded-2xl border-ink-200 bg-white" />
                </td>
                <td className="px-3 py-3">
                  <input type="number" min="0" step="1" value={point.power_kw} onChange={(event) => updatePoint(index, "power_kw", event.target.value)} className="w-full rounded-2xl border-ink-200 bg-white" />
                </td>
                <td className="px-3 py-3">
                  <button type="button" onClick={() => removePoint(index)} disabled={points.length <= 2} className="rounded-2xl border border-ink-200 px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-ink-700 transition hover:border-red-300 hover:text-red-700 disabled:opacity-40">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}