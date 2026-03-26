import * as d3 from "d3";
import { useMemo } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { ExtremeWindResponse } from "../../types/analysis";

interface ExtremeWindPanelProps {
  data: ExtremeWindResponse | null;
  isLoading: boolean;
  error: string | null;
}

const chartWidth = 760;
const chartHeight = 320;
const chartMargin = { top: 20, right: 24, bottom: 54, left: 58 };

function formatSpeed(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(1)} m/s`;
}

function formatYears(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(2)} years`;
}

function buildReturnChart(data: ExtremeWindResponse | null) {
  if (!data || data.return_period_curve.length === 0) {
    return null;
  }

  const curveMinT = d3.min(data.return_period_curve, (point) => point.return_period_years) ?? 1.01;
  const curveMaxT = d3.max(data.return_period_curve, (point) => point.return_period_years) ?? 100;
  const maxSpeed = Math.max(
    d3.max(data.return_period_curve, (point) => point.speed ?? 0) ?? 1,
    d3.max(data.observed_points, (point) => point.speed ?? 0) ?? 1,
  );

  const innerWidth = chartWidth - chartMargin.left - chartMargin.right;
  const innerHeight = chartHeight - chartMargin.top - chartMargin.bottom;
  const xScale = d3.scaleLog().domain([Math.max(1.01, curveMinT), Math.max(curveMaxT, 2)]).range([0, innerWidth]);
  const yScale = d3.scaleLinear().domain([0, maxSpeed]).nice().range([innerHeight, 0]);

  return {
    innerWidth,
    innerHeight,
    xScale,
    yScale,
    xTicks: [1.5, 2, 5, 10, 20, 50, 100].filter((tick) => tick >= xScale.domain()[0] && tick <= xScale.domain()[1]),
    yTicks: yScale.ticks(6),
    line: d3.line<{ return_period_years: number; speed: number | null }>()
      .defined((point) => point.speed != null)
      .x((point) => xScale(point.return_period_years))
      .y((point) => yScale(point.speed ?? 0)),
  };
}

export function ExtremeWindPanel({ data, isLoading, error }: ExtremeWindPanelProps) {
  const chart = useMemo(() => buildReturnChart(data), [data]);

  return (
    <section className="panel-surface p-5 sm:p-6">
      <div className="border-b border-ink-100 pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Extreme wind</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink-900">Extreme wind return periods</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-600">
          Review annual maxima, fit a Gumbel return-period curve, and estimate long-return extreme wind speeds such as Ve50 and Ve100.
        </p>
      </div>

      {isLoading ? (
        <div className="py-16">
          <LoadingSpinner label="Calculating extreme wind return periods" />
        </div>
      ) : null}

      {!isLoading && error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div> : null}

      {!isLoading && !error && data ? (
        <div className="mt-6 space-y-6">
          {data.summary.short_record_warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">{data.summary.warning_message ?? "Record shorter than one year. Extreme-wind estimates are indicative only."}</div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">50-year return level</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatSpeed(data.summary.ve50)}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Ve50 from the fitted Gumbel distribution using the selected extreme-wind source.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">100-year return level</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatSpeed(data.summary.ve100)}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Longer-return reference level for structural context.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Gust factor</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{data.summary.gust_factor != null ? data.summary.gust_factor.toFixed(2) : "--"}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Mean annual gust-to-mean-speed ratio when both gust and mean speed maxima are available.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Record length</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatYears(data.summary.record_years)}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">{data.summary.annual_max_count} annual maxima from {data.summary.data_source === "gust" ? "gust" : "speed"} data.</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,248,0.88))] px-3 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-ink-900">Return period curve</h3>
              <div className="text-xs uppercase tracking-[0.16em] text-ink-500">Log-scale return period</div>
            </div>
            {chart ? (
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="mt-4 w-full">
                <g transform={`translate(${chartMargin.left}, ${chartMargin.top})`}>
                  {chart.yTicks.map((tick) => (
                    <g key={`y-${tick}`} transform={`translate(0, ${chart.yScale(tick)})`}>
                      <line x1={0} x2={chart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.1)" strokeDasharray="4 6" />
                      <text x={-10} y={4} textAnchor="end" className="fill-ink-500 text-[11px] font-medium">{tick.toFixed(0)}</text>
                    </g>
                  ))}

                  {chart.xTicks.map((tick) => (
                    <g key={`x-${tick}`} transform={`translate(${chart.xScale(tick)}, 0)`}>
                      <line y1={0} y2={chart.innerHeight} stroke="rgba(24,36,47,0.08)" strokeDasharray="4 6" />
                      <text y={chart.innerHeight + 22} textAnchor="middle" className="fill-ink-500 text-[11px] font-medium">{tick}</text>
                    </g>
                  ))}

                  <path d={chart.line(data.return_period_curve) ?? ""} fill="none" stroke="#1f8f84" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

                  {data.observed_points.map((point) => (
                    <circle key={`${point.year}-${point.rank}`} cx={chart.xScale(point.return_period_years)} cy={chart.yScale(point.speed)} r={4.5} fill="#c2410c" fillOpacity={0.9} />
                  ))}

                  <line x1={0} x2={chart.innerWidth} y1={chart.innerHeight} y2={chart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                  <line x1={0} x2={0} y1={0} y2={chart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                  <text x={chart.innerWidth / 2} y={chart.innerHeight + 42} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Return period (years)</text>
                  <text transform={`translate(${-42}, ${chart.innerHeight / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Extreme wind speed (m/s)</text>
                </g>
              </svg>
            ) : (
              <div className="mt-4 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">At least two annual maxima are required to fit the Gumbel return-period curve.</div>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">Annual maxima</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm text-ink-700">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs uppercase tracking-[0.14em] text-ink-500">
                      <th className="pb-3 pr-4 font-medium">Year</th>
                      <th className="pb-3 pr-4 font-medium">Speed max</th>
                      <th className="pb-3 pr-4 font-medium">Gust max</th>
                      <th className="pb-3 font-medium">Selected extreme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.annual_maxima.map((row) => (
                      <tr key={row.year} className="border-b border-ink-100 last:border-b-0">
                        <td className="py-3 pr-4 font-medium text-ink-900">{row.year}</td>
                        <td className="py-3 pr-4">{formatSpeed(row.speed_max)}</td>
                        <td className="py-3 pr-4">{formatSpeed(row.gust_max)}</td>
                        <td className="py-3">{formatSpeed(row.analysis_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">Key return periods</h3>
              <div className="mt-4 space-y-3">
                {data.return_periods.map((row) => (
                  <div key={row.return_period_years} className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3 text-sm text-ink-700">
                    <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.14em] text-ink-500">
                      <span>{row.return_period_years.toFixed(0)}-year</span>
                      <span>{formatSpeed(row.speed)}</span>
                    </div>
                    <div className="mt-2 text-xs text-ink-600">95% CI: {formatSpeed(row.lower_ci)} to {formatSpeed(row.upper_ci)}</div>
                  </div>
                ))}

                <div className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3 text-sm text-ink-700">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">Gumbel fit</div>
                  <div className="mt-2">Location: {formatSpeed(data.gumbel_fit.location)}</div>
                  <div className="mt-1">Scale: {formatSpeed(data.gumbel_fit.scale)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}