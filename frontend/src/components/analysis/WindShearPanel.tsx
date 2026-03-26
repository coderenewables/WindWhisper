import * as d3 from "d3";
import { useMemo } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { ShearMethod, ShearResponse } from "../../types/analysis";

interface WindShearPanelProps {
  data: ShearResponse | null;
  isLoading: boolean;
  error: string | null;
  method: ShearMethod;
  targetHeight: string;
  onTargetHeightChange: (value: string) => void;
  onMethodChange: (method: ShearMethod) => void;
  onCreateChannel: () => void;
  isCreatingChannel: boolean;
  createChannelError: string | null;
  createdChannelName: string | null;
}

const profileWidth = 420;
const profileHeight = 280;
const chartMargin = { top: 20, right: 24, bottom: 40, left: 54 };

function formatValue(value: number | null | undefined, digits = 3, suffix = "") {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function methodLabel(method: ShearMethod) {
  return method === "log" ? "Log law" : "Power law";
}

export function WindShearPanel({
  data,
  isLoading,
  error,
  method,
  targetHeight,
  onTargetHeightChange,
  onMethodChange,
  onCreateChannel,
  isCreatingChannel,
  createChannelError,
  createdChannelName,
}: WindShearPanelProps) {
  const profileChart = useMemo(() => {
    if (!data || data.profile_points.length === 0) {
      return null;
    }

    const innerWidth = profileWidth - chartMargin.left - chartMargin.right;
    const innerHeight = profileHeight - chartMargin.top - chartMargin.bottom;
    const speeds = data.profile_points.map((point) => point.mean_speed ?? 0);
    const heights = data.profile_points.map((point) => point.height_m);
    const xScale = d3.scaleLinear().domain([0, d3.max(speeds) ?? 1]).nice().range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([0, d3.max(heights) ?? 1]).nice().range([innerHeight, 0]);

    return {
      innerWidth,
      innerHeight,
      xScale,
      yScale,
      xTicks: xScale.ticks(5),
      yTicks: yScale.ticks(5),
      line: d3
        .line<(typeof data.profile_points)[number]>()
        .defined((point) => point.mean_speed != null)
        .x((point) => xScale(point.mean_speed ?? 0))
        .y((point) => yScale(point.height_m))(data.profile_points),
    };
  }, [data]);

  return (
    <section className="panel-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-ink-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Vertical shear</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">Power-law and log-law wind shear analysis</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-600">
            Compare shear between measured speed heights, inspect directional and diurnal patterns, and extrapolate a derived speed channel at a target hub height.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Method
            <select value={method} onChange={(event) => onMethodChange(event.target.value as ShearMethod)} className="rounded-2xl border-ink-200 bg-white">
              <option value="power">Power law</option>
              <option value="log">Log law</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Target height
            <input type="number" min="1" step="1" value={targetHeight} onChange={(event) => onTargetHeightChange(event.target.value)} className="rounded-2xl border-ink-200 bg-white" />
          </label>
          <div className="grid gap-2 text-sm font-medium text-ink-800">
            <span>Create channel</span>
            <button type="button" onClick={onCreateChannel} disabled={isCreatingChannel || !data} className="rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-700 disabled:opacity-60">
              {isCreatingChannel ? "Saving..." : "Create Extrapolated Channel"}
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16">
          <LoadingSpinner label="Calculating wind shear" />
        </div>
      ) : null}

      {!isLoading && error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div> : null}

      {createChannelError ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{createChannelError}</div> : null}
      {createdChannelName ? <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-teal-800">Created derived channel: {createdChannelName}</div> : null}

      {!isLoading && !error && data ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Representative pair</div>
              <div className="mt-3 text-xl font-semibold text-ink-900">
                {data.representative_pair ? `${data.representative_pair.lower_height_m}m to ${data.representative_pair.upper_height_m}m` : "--"}
              </div>
              <p className="mt-2 text-sm leading-7 text-ink-600">The pair used for the directional, diurnal, and target-height summaries.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Target mean speed</div>
              <div className="mt-3 text-xl font-semibold text-ink-900">{formatValue(data.target_mean_speed, 2, " m/s")}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Mean extrapolated speed at the configured target height using {methodLabel(data.method).toLowerCase()}.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Height pairs</div>
              <div className="mt-3 text-xl font-semibold text-ink-900">{data.pair_stats.length}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Measured height combinations contributing to the shear summary.</p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,248,0.88))] px-4 py-5">
              <h3 className="text-lg font-semibold text-ink-900">Vertical profile</h3>
              {profileChart ? (
                <svg viewBox={`0 0 ${profileWidth} ${profileHeight}`} className="mt-4 w-full">
                  <g transform={`translate(${chartMargin.left}, ${chartMargin.top})`}>
                    {profileChart.xTicks.map((tick) => (
                      <g key={`x-${tick}`} transform={`translate(${profileChart.xScale(tick)}, 0)`}>
                        <line y1={0} y2={profileChart.innerHeight} stroke="rgba(24,36,47,0.08)" strokeDasharray="4 6" />
                        <text y={profileChart.innerHeight + 22} textAnchor="middle" className="fill-ink-500 text-[10px] font-medium">{tick.toFixed(1)}</text>
                      </g>
                    ))}
                    {profileChart.yTicks.map((tick) => (
                      <g key={`y-${tick}`} transform={`translate(0, ${profileChart.yScale(tick)})`}>
                        <line x1={0} x2={profileChart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.08)" strokeDasharray="4 6" />
                        <text x={-10} y={4} textAnchor="end" className="fill-ink-500 text-[10px] font-medium">{tick.toFixed(0)}m</text>
                      </g>
                    ))}
                    {profileChart.line ? <path d={profileChart.line} fill="none" stroke="#1f8f84" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
                    {data.profile_points.map((point) => (
                      <g key={`${point.height_m}-${point.source}`} transform={`translate(${profileChart.xScale(point.mean_speed ?? 0)}, ${profileChart.yScale(point.height_m)})`}>
                        <circle r={point.source === "extrapolated" ? 6 : 5} fill={point.source === "extrapolated" ? "#f06f32" : "#1f8f84"} />
                        <text x={10} y={4} className="fill-ink-700 text-[10px] font-medium">{`${point.height_m}m`}</text>
                      </g>
                    ))}
                    <text x={profileChart.innerWidth / 2} y={profileChart.innerHeight + 34} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Mean speed (m/s)</text>
                  </g>
                </svg>
              ) : null}
            </div>

            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">Pair statistics</h3>
              <div className="mt-4 space-y-3">
                {data.pair_stats.map((pair) => (
                  <div key={`${pair.lower_column_id}-${pair.upper_column_id}`} className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3 text-sm text-ink-700">
                    <div className="font-semibold text-ink-900">{pair.lower_height_m}m to {pair.upper_height_m}m</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>Mean: {formatValue(pair.mean_value)}</div>
                      <div>Median: {formatValue(pair.median_value)}</div>
                      <div>Std: {formatValue(pair.std_value)}</div>
                      <div>Count: {pair.count}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">By direction</h3>
              <div className="mt-4 space-y-3">
                {data.direction_bins.map((sector) => (
                  <div key={sector.sector_index}>
                    <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.14em] text-ink-500">
                      <span>{Math.round(sector.direction)}°</span>
                      <span>{formatValue(sector.mean_value)}</span>
                    </div>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(0, Math.min(100, (sector.count / Math.max(...data.direction_bins.map((item) => item.count), 1)) * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">By time of day</h3>
              <div className="mt-4 grid grid-cols-4 gap-3 text-sm text-ink-700 sm:grid-cols-6">
                {data.time_of_day.map((item) => (
                  <div key={item.hour} className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3 text-center">
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">{String(item.hour).padStart(2, "0")}:00</div>
                    <div className="mt-2 font-semibold text-ink-900">{formatValue(item.mean_value, 2)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}