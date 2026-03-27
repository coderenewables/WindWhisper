import * as d3 from "d3";
import { useMemo } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { EnergyEstimateResponse } from "../../types/analysis";
import type { DatasetColumn } from "../../types/dataset";
import type { Flag } from "../../types/qc";

interface EnergyEstimatePanelProps {
  data: EnergyEstimateResponse | null;
  isLoading: boolean;
  error: string | null;
  speedColumns: DatasetColumn[];
  temperatureColumns: DatasetColumn[];
  pressureColumns: DatasetColumn[];
  flags: Flag[];
  selectedSpeedColumnId: string;
  selectedTemperatureColumnId: string;
  selectedPressureColumnId: string;
  excludedFlagIds: string[];
  airDensityAdjustment: boolean;
  pressureSource: "auto" | "measured" | "estimated";
  elevation: string;
  canRun: boolean;
  onSpeedColumnChange: (value: string) => void;
  onTemperatureColumnChange: (value: string) => void;
  onPressureColumnChange: (value: string) => void;
  onToggleFlag: (flagId: string) => void;
  onAirDensityAdjustmentChange: (value: boolean) => void;
  onPressureSourceChange: (value: "auto" | "measured" | "estimated") => void;
  onElevationChange: (value: string) => void;
  onRunEstimate: () => void;
}

const chartWidth = 420;
const chartHeight = 250;
const margin = { top: 18, right: 18, bottom: 38, left: 54 };

function formatNumber(value: number | null | undefined, digits = 1, suffix = "") {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

export function EnergyEstimatePanel({
  data,
  isLoading,
  error,
  speedColumns,
  temperatureColumns,
  pressureColumns,
  flags,
  selectedSpeedColumnId,
  selectedTemperatureColumnId,
  selectedPressureColumnId,
  excludedFlagIds,
  airDensityAdjustment,
  pressureSource,
  elevation,
  canRun,
  onSpeedColumnChange,
  onTemperatureColumnChange,
  onPressureColumnChange,
  onToggleFlag,
  onAirDensityAdjustmentChange,
  onPressureSourceChange,
  onElevationChange,
  onRunEstimate,
}: EnergyEstimatePanelProps) {
  const monthlyChart = useMemo(() => {
    if (!data || data.monthly.length === 0) {
      return null;
    }
    const innerWidth = chartWidth - margin.left - margin.right;
    const innerHeight = chartHeight - margin.top - margin.bottom;
    const xScale = d3.scaleBand().domain(data.monthly.map((row) => row.label)).range([0, innerWidth]).padding(0.18);
    const yScale = d3.scaleLinear().domain([0, d3.max(data.monthly, (row) => row.energy_mwh) ?? 1]).nice().range([innerHeight, 0]);
    return { innerWidth, innerHeight, xScale, yScale, yTicks: yScale.ticks(5) };
  }, [data]);

  const speedBinChart = useMemo(() => {
    if (!data || data.speed_bins.length === 0) {
      return null;
    }
    const innerWidth = chartWidth - margin.left - margin.right;
    const innerHeight = chartHeight - margin.top - margin.bottom;
    const xScale = d3.scaleBand().domain(data.speed_bins.map((row) => `${row.lower}-${row.upper}`)).range([0, innerWidth]).padding(0.1);
    const yScale = d3.scaleLinear().domain([0, d3.max(data.speed_bins, (row) => row.energy_mwh) ?? 1]).nice().range([innerHeight, 0]);
    return { innerWidth, innerHeight, xScale, yScale, yTicks: yScale.ticks(5) };
  }, [data]);

  return (
    <section className="panel-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-ink-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Energy estimate</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">Gross energy from measured wind speeds</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-600">
            Select the hub-height speed channel, optionally apply air-density correction, and estimate annual gross energy, capacity factor, and monthly contributions.
          </p>
        </div>

        <button type="button" onClick={onRunEstimate} disabled={!canRun || isLoading} className="rounded-2xl bg-ink-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-ink-700 disabled:opacity-60">
          {isLoading ? "Running..." : "Run Estimate"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-medium text-ink-800">
          Speed channel
          <select value={selectedSpeedColumnId} onChange={(event) => onSpeedColumnChange(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
            <option value="">Select speed channel</option>
            {speedColumns.map((column) => (
              <option key={column.id} value={column.id}>{column.name}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-ink-800">
          Air density adjustment
          <button type="button" onClick={() => onAirDensityAdjustmentChange(!airDensityAdjustment)} className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${airDensityAdjustment ? "border-teal-300 bg-teal-50 text-teal-800" : "border-ink-200 bg-white text-ink-700"}`}>
            {airDensityAdjustment ? "Enabled" : "Disabled"}
          </button>
        </label>

        <label className="grid gap-2 text-sm font-medium text-ink-800">
          Pressure source
          <select value={pressureSource} onChange={(event) => onPressureSourceChange(event.target.value as "auto" | "measured" | "estimated")} disabled={!airDensityAdjustment} className="rounded-2xl border-ink-200 bg-white disabled:bg-ink-50">
            <option value="auto">Auto</option>
            <option value="measured">Measured</option>
            <option value="estimated">Estimated from elevation</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-ink-800">
          Elevation (m)
          <input type="number" value={elevation} onChange={(event) => onElevationChange(event.target.value)} disabled={!airDensityAdjustment || pressureSource === "measured"} className="rounded-2xl border-ink-200 bg-white disabled:bg-ink-50" />
        </label>
      </div>

      {airDensityAdjustment ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Temperature channel
            <select value={selectedTemperatureColumnId} onChange={(event) => onTemperatureColumnChange(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
              <option value="">Select temperature channel</option>
              {temperatureColumns.map((column) => (
                <option key={column.id} value={column.id}>{column.name}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Pressure channel
            <select value={selectedPressureColumnId} onChange={(event) => onPressureColumnChange(event.target.value)} disabled={pressureSource === "estimated"} className="rounded-2xl border-ink-200 bg-white disabled:bg-ink-50">
              <option value="">Select pressure channel</option>
              {pressureColumns.map((column) => (
                <option key={column.id} value={column.id}>{column.name}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {flags.length > 0 ? (
        <div className="mt-5 rounded-[28px] border border-ink-100 bg-[rgba(248,250,252,0.88)] px-4 py-4">
          <div className="text-sm font-semibold text-ink-900">Exclude flagged data</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {flags.map((flag) => {
              const active = excludedFlagIds.includes(flag.id);
              return (
                <button key={flag.id} type="button" onClick={() => onToggleFlag(flag.id)} className={`rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] transition ${active ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-700"}`}>
                  {flag.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="py-16">
          <LoadingSpinner label="Calculating gross energy estimate" />
        </div>
      ) : null}

      {!isLoading && error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div> : null}

      {!isLoading && !error && data ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Annual energy</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatNumber(data.summary.annual_energy_mwh, 1, " MWh")}</div>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Capacity factor</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatNumber(data.summary.capacity_factor_pct, 1, "%")}</div>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Full-load hours</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatNumber(data.summary.equivalent_full_load_hours, 0, " h")}</div>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Rated power</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatNumber(data.summary.rated_power_kw, 0, " kW")}</div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,248,0.88))] px-4 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-ink-900">Monthly energy</h3>
                <div className="text-xs uppercase tracking-[0.14em] text-ink-500">Actual data period</div>
              </div>
              {monthlyChart ? (
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="mt-4 w-full">
                  <g transform={`translate(${margin.left}, ${margin.top})`}>
                    {monthlyChart.yTicks.map((tick) => (
                      <g key={`month-y-${tick}`} transform={`translate(0, ${monthlyChart.yScale(tick)})`}>
                        <line x1={0} x2={monthlyChart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.08)" strokeDasharray="4 6" />
                        <text x={-10} y={4} textAnchor="end" className="fill-ink-500 text-[10px] font-medium">{tick.toFixed(1)}</text>
                      </g>
                    ))}
                    {data.monthly.map((row) => {
                      const x = monthlyChart.xScale(row.label) ?? 0;
                      const barHeight = monthlyChart.innerHeight - monthlyChart.yScale(row.energy_mwh);
                      return (
                        <g key={row.label} transform={`translate(${x}, 0)`}>
                          <rect y={monthlyChart.yScale(row.energy_mwh)} width={monthlyChart.xScale.bandwidth()} height={barHeight} rx={12} fill="#1f8f84" opacity={0.9} />
                          <text x={monthlyChart.xScale.bandwidth() / 2} y={monthlyChart.innerHeight + 20} textAnchor="middle" className="fill-ink-500 text-[10px] font-medium">{row.label}</text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.92))] px-4 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-ink-900">Energy by speed bin</h3>
                <div className="text-xs uppercase tracking-[0.14em] text-ink-500">Contribution breakdown</div>
              </div>
              {speedBinChart ? (
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="mt-4 w-full">
                  <g transform={`translate(${margin.left}, ${margin.top})`}>
                    {speedBinChart.yTicks.map((tick) => (
                      <g key={`bin-y-${tick}`} transform={`translate(0, ${speedBinChart.yScale(tick)})`}>
                        <line x1={0} x2={speedBinChart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.08)" strokeDasharray="4 6" />
                        <text x={-10} y={4} textAnchor="end" className="fill-ink-500 text-[10px] font-medium">{tick.toFixed(1)}</text>
                      </g>
                    ))}
                    {data.speed_bins.map((row) => {
                      const label = `${row.lower}-${row.upper}`;
                      const x = speedBinChart.xScale(label) ?? 0;
                      const barHeight = speedBinChart.innerHeight - speedBinChart.yScale(row.energy_mwh);
                      return (
                        <g key={label} transform={`translate(${x}, 0)`}>
                          <rect y={speedBinChart.yScale(row.energy_mwh)} width={speedBinChart.xScale.bandwidth()} height={barHeight} rx={10} fill="#f06f32" opacity={0.92} />
                          <text x={speedBinChart.xScale.bandwidth() / 2} y={speedBinChart.innerHeight + 20} textAnchor="middle" className="fill-ink-500 text-[9px] font-medium">{label}</text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Mean power</div>
              <div className="mt-3 text-xl font-semibold text-ink-900">{formatNumber(data.summary.mean_power_kw, 0, " kW")}</div>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Time step</div>
              <div className="mt-3 text-xl font-semibold text-ink-900">{formatNumber(data.summary.time_step_hours, 2, " h")}</div>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Density correction</div>
              <div className="mt-3 text-xl font-semibold text-ink-900">{data.summary.air_density_adjusted ? "Applied" : "Not applied"}</div>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Estimated pressure</div>
              <div className="mt-3 text-xl font-semibold text-ink-900">{formatNumber(data.summary.estimated_pressure_hpa, 1, " hPa")}</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}