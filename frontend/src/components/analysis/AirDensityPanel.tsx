import * as d3 from "d3";
import { useMemo } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { AirDensityResponse } from "../../types/analysis";

interface AirDensityPanelProps {
  data: AirDensityResponse | null;
  isLoading: boolean;
  error: string | null;
}

const chartWidth = 760;
const chartHeight = 260;
const margin = { top: 20, right: 20, bottom: 48, left: 54 };

function formatDensity(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(3)} kg/m³`;
}

function formatWpd(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(0)} W/m²`;
}

function buildDensityChart(data: AirDensityResponse | null) {
  if (!data || data.density_points.length === 0) {
    return null;
  }

  const points = data.density_points.filter((point) => point.density != null);
  if (points.length === 0) {
    return null;
  }

  const innerWidth = chartWidth - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;
  const xScale = d3
    .scaleTime()
    .domain(d3.extent(points, (point) => new Date(point.timestamp)) as [Date, Date])
    .range([0, innerWidth]);
  const yScale = d3
    .scaleLinear()
    .domain(d3.extent(points, (point) => point.density ?? 0) as [number, number])
    .nice()
    .range([innerHeight, 0]);

  return {
    innerWidth,
    innerHeight,
    xScale,
    yScale,
    xTicks: xScale.ticks(5),
    yTicks: yScale.ticks(5),
    line: d3
      .line<(typeof points)[number]>()
      .x((point) => xScale(new Date(point.timestamp)))
      .y((point) => yScale(point.density ?? 0))(points),
  };
}

export function AirDensityPanel({ data, isLoading, error }: AirDensityPanelProps) {
  const densityChart = useMemo(() => buildDensityChart(data), [data]);
  const monthlyMaxDensity = useMemo(() => Math.max(...(data?.monthly.map((row) => row.mean_density ?? 0) ?? [1])), [data]);
  const monthlyMaxWpd = useMemo(() => Math.max(...(data?.monthly.map((row) => row.mean_wind_power_density ?? 0) ?? [1])), [data]);

  return (
    <section className="panel-surface p-5 sm:p-6">
      <div className="border-b border-ink-100 pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Air density</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink-900">Density and wind power density</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-600">
          Review density variation from measured or elevation-estimated pressure and translate it into mean wind power density for the selected speed channel.
        </p>
      </div>

      {isLoading ? (
        <div className="py-16">
          <LoadingSpinner label="Calculating air density" />
        </div>
      ) : null}

      {!isLoading && error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div> : null}

      {!isLoading && !error && data ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Mean density</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatDensity(data.summary.mean_density)}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Average density across all valid timestamps after QC filtering.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Mean wind power density</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatWpd(data.summary.mean_wind_power_density)}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Mean $\frac{1}{2}\rho v^3$ for the selected wind-speed series.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Pressure source</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900 capitalize">{data.summary.pressure_source}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Estimated pressure {data.summary.estimated_pressure_hpa != null ? `${data.summary.estimated_pressure_hpa.toFixed(1)} hPa` : "not used"}.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Valid samples</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{data.summary.sample_count.toLocaleString()}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Density points contributing to the monthly and summary statistics.</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,248,0.88))] px-3 py-4 sm:px-5">
            <h3 className="text-lg font-semibold text-ink-900">Air density over time</h3>
            {densityChart ? (
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="mt-4 w-full">
                <g transform={`translate(${margin.left}, ${margin.top})`}>
                  {densityChart.yTicks.map((tick) => (
                    <g key={`y-${tick}`} transform={`translate(0, ${densityChart.yScale(tick)})`}>
                      <line x1={0} x2={densityChart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.1)" strokeDasharray="4 6" />
                      <text x={-10} y={4} textAnchor="end" className="fill-ink-500 text-[11px] font-medium">{tick.toFixed(3)}</text>
                    </g>
                  ))}
                  {densityChart.xTicks.map((tick) => (
                    <g key={tick.toISOString()} transform={`translate(${densityChart.xScale(tick)}, 0)`}>
                      <line y1={0} y2={densityChart.innerHeight} stroke="rgba(24,36,47,0.06)" strokeDasharray="4 6" />
                      <text y={densityChart.innerHeight + 22} textAnchor="middle" className="fill-ink-500 text-[11px] font-medium">{d3.timeFormat("%b %d")(tick)}</text>
                    </g>
                  ))}
                  <path d={densityChart.line ?? ""} fill="none" stroke="#1f8f84" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  <line x1={0} x2={densityChart.innerWidth} y1={densityChart.innerHeight} y2={densityChart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                  <line x1={0} x2={0} y1={0} y2={densityChart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                  <text x={densityChart.innerWidth / 2} y={densityChart.innerHeight + 40} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Timestamp</text>
                  <text transform={`translate(${-42}, ${densityChart.innerHeight / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Density (kg/m³)</text>
                </g>
              </svg>
            ) : (
              <div className="mt-4 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">No valid density points are available for the current selection.</div>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">Monthly average density</h3>
              <div className="mt-4 space-y-3">
                {data.monthly.map((row) => {
                  const widthPct = monthlyMaxDensity > 0 && row.mean_density != null ? (row.mean_density / monthlyMaxDensity) * 100 : 0;
                  return (
                    <div key={row.month}>
                      <div className="flex items-center justify-between gap-3 text-sm text-ink-700">
                        <span className="font-medium text-ink-900">{row.label}</span>
                        <span>{formatDensity(row.mean_density)}</span>
                      </div>
                      <div className="mt-2 h-3 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(0, Math.min(100, widthPct))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">Monthly wind power density</h3>
              <div className="mt-4 space-y-3">
                {data.monthly.map((row) => {
                  const widthPct = monthlyMaxWpd > 0 && row.mean_wind_power_density != null ? (row.mean_wind_power_density / monthlyMaxWpd) * 100 : 0;
                  return (
                    <div key={`wpd-${row.month}`}>
                      <div className="flex items-center justify-between gap-3 text-sm text-ink-700">
                        <span className="font-medium text-ink-900">{row.label}</span>
                        <span>{formatWpd(row.mean_wind_power_density)}</span>
                      </div>
                      <div className="mt-2 h-3 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-full rounded-full bg-ember-500" style={{ width: `${Math.max(0, Math.min(100, widthPct))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}