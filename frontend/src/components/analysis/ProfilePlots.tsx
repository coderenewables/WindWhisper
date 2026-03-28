import * as d3 from "d3";
import { useMemo, useState } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { DiurnalProfilePoint, MonthlyProfilePoint, ProfilesResponse } from "../../types/analysis";

interface ProfilePlotsProps {
  data: ProfilesResponse | null;
  isLoading: boolean;
  error: string | null;
  columnLabel: string;
}

type ProfileView = "diurnal" | "monthly" | "heatmap";

const lineWidth = 760;
const lineHeight = 320;
const lineMargin = { top: 24, right: 24, bottom: 52, left: 58 };
const heatmapWidth = 760;
const heatmapHeight = 380;
const heatmapMargin = { top: 24, right: 24, bottom: 52, left: 64 };
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatValue(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(digits);
}

function buildDiurnalChart(data: ProfilesResponse | null, showYearOverlays: boolean) {
  if (!data || data.diurnal.length === 0) {
    return null;
  }

  const points = data.diurnal.filter((point) => point.mean_value != null);
  if (points.length === 0) {
    return null;
  }

  const overlayPoints = showYearOverlays
    ? data.diurnal_by_year.flatMap((series) => series.points.filter((point) => point.mean_value != null))
    : [];
  const extentValues = [
    ...points.flatMap((point) => [
      point.min_value ?? point.mean_value ?? 0,
      point.max_value ?? point.mean_value ?? 0,
      (point.mean_value ?? 0) - (point.std_value ?? 0),
      (point.mean_value ?? 0) + (point.std_value ?? 0),
    ]),
    ...overlayPoints.map((point) => point.mean_value ?? 0),
  ];
  const yMin = d3.min(extentValues) ?? 0;
  const yMax = d3.max(extentValues) ?? 1;

  const innerWidth = lineWidth - lineMargin.left - lineMargin.right;
  const innerHeight = lineHeight - lineMargin.top - lineMargin.bottom;
  const xScale = d3.scaleLinear().domain([0, 23]).range([0, innerWidth]);
  const yScale = d3.scaleLinear().domain([yMin, yMax > yMin ? yMax : yMin + 1]).nice().range([innerHeight, 0]);
  const area = d3
    .area<DiurnalProfilePoint>()
    .defined((point) => point.mean_value != null)
    .x((point) => xScale(point.hour))
    .y0((point) => yScale((point.mean_value ?? 0) - (point.std_value ?? 0)))
    .y1((point) => yScale((point.mean_value ?? 0) + (point.std_value ?? 0)));
  const line = d3
    .line<DiurnalProfilePoint>()
    .defined((point) => point.mean_value != null)
    .x((point) => xScale(point.hour))
    .y((point) => yScale(point.mean_value ?? 0));

  return {
    innerWidth,
    innerHeight,
    xScale,
    yScale,
    xTicks: [0, 4, 8, 12, 16, 20, 23],
    yTicks: yScale.ticks(5),
    area: area(data.diurnal),
    line: line(data.diurnal),
    overlayLine: line,
  };
}

function buildMonthlyChart(data: ProfilesResponse | null) {
  if (!data || data.monthly.length === 0) {
    return null;
  }

  const points = data.monthly.filter((point) => point.mean_value != null);
  if (points.length === 0) {
    return null;
  }

  const maxValue = d3.max(data.monthly.map((point) => (point.mean_value ?? 0) + (point.std_value ?? 0))) ?? 1;
  const innerWidth = lineWidth - lineMargin.left - lineMargin.right;
  const innerHeight = lineHeight - lineMargin.top - lineMargin.bottom;
  const xScale = d3.scaleBand<number>().domain(data.monthly.map((point) => point.month)).range([0, innerWidth]).padding(0.18);
  const yScale = d3.scaleLinear().domain([0, maxValue]).nice().range([innerHeight, 0]);
  const overlayLine = d3
    .line<MonthlyProfilePoint>()
    .defined((point) => point.mean_value != null)
    .x((point) => (xScale(point.month) ?? 0) + xScale.bandwidth() / 2)
    .y((point) => yScale(point.mean_value ?? 0));

  return {
    innerWidth,
    innerHeight,
    xScale,
    yScale,
    yTicks: yScale.ticks(5),
    overlayLine,
  };
}

function buildHeatmapChart(data: ProfilesResponse | null) {
  if (!data || data.heatmap.length === 0) {
    return null;
  }

  const values = data.heatmap.map((cell) => cell.mean_value).filter((value): value is number => value != null && Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }

  const innerWidth = heatmapWidth - heatmapMargin.left - heatmapMargin.right;
  const innerHeight = heatmapHeight - heatmapMargin.top - heatmapMargin.bottom;
  const xScale = d3.scaleBand<number>().domain(d3.range(24)).range([0, innerWidth]).paddingInner(0.04);
  const yScale = d3.scaleBand<number>().domain(d3.range(1, 13)).range([0, innerHeight]).paddingInner(0.06);
  const colorScale = d3.scaleSequential(d3.interpolateYlGnBu).domain([d3.min(values) ?? 0, d3.max(values) ?? 1]);

  return {
    innerWidth,
    innerHeight,
    xScale,
    yScale,
    colorScale,
  };
}

export function ProfilePlots({ data, isLoading, error, columnLabel }: ProfilePlotsProps) {
  const [activeView, setActiveView] = useState<ProfileView>("diurnal");
  const [showYearOverlays, setShowYearOverlays] = useState(false);
  const hasYearOverlays = (data?.years_available.length ?? 0) > 1;
  const diurnalChart = useMemo(() => buildDiurnalChart(data, showYearOverlays), [data, showYearOverlays]);
  const monthlyChart = useMemo(() => buildMonthlyChart(data), [data]);
  const heatmapChart = useMemo(() => buildHeatmapChart(data), [data]);
  const totalSamples = useMemo(() => (data ? data.diurnal.reduce((sum, point) => sum + point.sample_count, 0) : 0), [data]);
  const overlayPalette = useMemo(() => d3.scaleOrdinal<string>().domain((data?.years_available ?? []).map(String)).range(["#0f766e", "#f97316", "#2563eb", "#7c3aed", "#be123c", "#65a30d"]), [data]);

  return (
    <section className="panel-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-ink-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Profiles</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">Daily and monthly profiles for {columnLabel}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-600">
            Compare the diurnal and monthly signature of the selected channel, then inspect the monthly-diurnal heatmap to see how seasonal and hourly patterns interact.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["diurnal", "monthly", "heatmap"] as ProfileView[]).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              className={[
                "rounded-2xl px-4 py-2.5 text-sm font-medium transition",
                activeView === view ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200",
              ].join(" ")}
            >
              {view === "diurnal" ? "Diurnal" : view === "monthly" ? "Monthly" : "Heatmap"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-16">
          <LoadingSpinner label="Building profile plots" />
        </div>
      ) : null}

      {!isLoading && error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div> : null}

      {!isLoading && !error && data ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Samples used</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{totalSamples.toLocaleString()}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">QC-filtered observations contributing to the profile statistics.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Hours covered</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{data.diurnal.filter((point) => point.sample_count > 0).length}/24</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Hours of day with at least one valid observation.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Months covered</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{data.monthly.filter((point) => point.sample_count > 0).length}/12</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Months represented in the selected dataset window.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Years available</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{data.years_available.length}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Enable yearly overlays when more than one annual cycle is present.</p>
            </div>
          </div>

          {hasYearOverlays ? (
            <label className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white/80 px-4 py-3 text-sm text-ink-700">
              <input type="checkbox" checked={showYearOverlays} onChange={(event) => setShowYearOverlays(event.target.checked)} className="rounded border-ink-300 text-teal-500 focus:ring-teal-500" />
              <span>
                Overlay yearly profiles
                <span className="ml-2 text-xs text-ink-500">({data.years_available.join(", ")})</span>
              </span>
            </label>
          ) : null}

          {activeView === "diurnal" ? (
            <div className="overflow-hidden rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,248,0.88))] px-3 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold text-ink-900">Diurnal profile</h3>
                <div className="text-xs uppercase tracking-[0.16em] text-ink-500">Mean line with std shading</div>
              </div>
              {diurnalChart ? (
                <svg viewBox={`0 0 ${lineWidth} ${lineHeight}`} className="mt-4 w-full">
                  <g transform={`translate(${lineMargin.left}, ${lineMargin.top})`}>
                    {diurnalChart.yTicks.map((tick) => (
                      <g key={`y-${tick}`} transform={`translate(0, ${diurnalChart.yScale(tick)})`}>
                        <line x1={0} x2={diurnalChart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.1)" strokeDasharray="4 6" />
                        <text x={-10} y={4} textAnchor="end" className="fill-ink-500 text-[11px] font-medium">{tick.toFixed(1)}</text>
                      </g>
                    ))}
                    {diurnalChart.xTicks.map((tick) => (
                      <g key={`x-${tick}`} transform={`translate(${diurnalChart.xScale(tick)}, 0)`}>
                        <line y1={0} y2={diurnalChart.innerHeight} stroke="rgba(24,36,47,0.08)" strokeDasharray="4 6" />
                        <text y={diurnalChart.innerHeight + 22} textAnchor="middle" className="fill-ink-500 text-[11px] font-medium">{String(tick).padStart(2, "0")}:00</text>
                      </g>
                    ))}
                    {diurnalChart.area ? <path d={diurnalChart.area} fill="rgba(31,143,132,0.18)" /> : null}
                    {showYearOverlays
                      ? data.diurnal_by_year.map((series) => (
                          <path key={`diurnal-year-${series.year}`} d={diurnalChart.overlayLine(series.points) ?? ""} fill="none" stroke={overlayPalette(String(series.year))} strokeWidth={1.6} strokeOpacity={0.55} strokeDasharray="6 6" />
                        ))
                      : null}
                    {diurnalChart.line ? <path d={diurnalChart.line} fill="none" stroke="#0f766e" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
                    <line x1={0} x2={diurnalChart.innerWidth} y1={diurnalChart.innerHeight} y2={diurnalChart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                    <line x1={0} x2={0} y1={0} y2={diurnalChart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                    <text x={diurnalChart.innerWidth / 2} y={diurnalChart.innerHeight + 42} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Hour of day</text>
                    <text transform={`translate(${-42}, ${diurnalChart.innerHeight / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Mean value</text>
                  </g>
                </svg>
              ) : (
                <div className="mt-4 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">No valid diurnal profile is available for the current selection.</div>
              )}
            </div>
          ) : null}

          {activeView === "monthly" ? (
            <div className="overflow-hidden rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,245,239,0.92))] px-3 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold text-ink-900">Monthly profile</h3>
                <div className="text-xs uppercase tracking-[0.16em] text-ink-500">Monthly mean with std error bars</div>
              </div>
              {monthlyChart ? (
                <svg viewBox={`0 0 ${lineWidth} ${lineHeight}`} className="mt-4 w-full">
                  <g transform={`translate(${lineMargin.left}, ${lineMargin.top})`}>
                    {monthlyChart.yTicks.map((tick) => (
                      <g key={`y-${tick}`} transform={`translate(0, ${monthlyChart.yScale(tick)})`}>
                        <line x1={0} x2={monthlyChart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.1)" strokeDasharray="4 6" />
                        <text x={-10} y={4} textAnchor="end" className="fill-ink-500 text-[11px] font-medium">{tick.toFixed(1)}</text>
                      </g>
                    ))}
                    {data.monthly.map((point) => {
                      const x = monthlyChart.xScale(point.month) ?? 0;
                      const barWidth = monthlyChart.xScale.bandwidth();
                      const value = point.mean_value ?? 0;
                      const y = monthlyChart.yScale(value);
                      const stdTop = monthlyChart.yScale(value + (point.std_value ?? 0));
                      const stdBottom = monthlyChart.yScale(Math.max(0, value - (point.std_value ?? 0)));
                      return (
                        <g key={`month-${point.month}`} transform={`translate(${x}, 0)`}>
                          <rect x={0} y={y} width={barWidth} height={monthlyChart.innerHeight - y} rx={12} fill="#f97316" fillOpacity={point.mean_value == null ? 0.18 : 0.85} />
                          {point.mean_value != null ? (
                            <>
                              <line x1={barWidth / 2} x2={barWidth / 2} y1={stdTop} y2={stdBottom} stroke="#9a3412" strokeWidth={1.5} />
                              <line x1={barWidth / 2 - 6} x2={barWidth / 2 + 6} y1={stdTop} y2={stdTop} stroke="#9a3412" strokeWidth={1.5} />
                              <line x1={barWidth / 2 - 6} x2={barWidth / 2 + 6} y1={stdBottom} y2={stdBottom} stroke="#9a3412" strokeWidth={1.5} />
                            </>
                          ) : null}
                          <text x={barWidth / 2} y={monthlyChart.innerHeight + 22} textAnchor="middle" className="fill-ink-500 text-[11px] font-medium">{point.label}</text>
                        </g>
                      );
                    })}
                    {showYearOverlays
                      ? data.monthly_by_year.map((series) => (
                          <path key={`monthly-year-${series.year}`} d={monthlyChart.overlayLine(series.points) ?? ""} fill="none" stroke={overlayPalette(String(series.year))} strokeWidth={1.6} strokeOpacity={0.55} strokeDasharray="6 6" />
                        ))
                      : null}
                    <line x1={0} x2={monthlyChart.innerWidth} y1={monthlyChart.innerHeight} y2={monthlyChart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                    <line x1={0} x2={0} y1={0} y2={monthlyChart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                    <text x={monthlyChart.innerWidth / 2} y={monthlyChart.innerHeight + 42} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Month</text>
                    <text transform={`translate(${-42}, ${monthlyChart.innerHeight / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Mean value</text>
                  </g>
                </svg>
              ) : (
                <div className="mt-4 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">No valid monthly profile is available for the current selection.</div>
              )}
            </div>
          ) : null}

          {activeView === "heatmap" ? (
            <div className="overflow-hidden rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(238,244,255,0.92))] px-3 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold text-ink-900">Monthly-diurnal heatmap</h3>
                <div className="text-xs uppercase tracking-[0.16em] text-ink-500">Months by hours</div>
              </div>
              {heatmapChart ? (
                <svg viewBox={`0 0 ${heatmapWidth} ${heatmapHeight}`} className="mt-4 w-full">
                  <g transform={`translate(${heatmapMargin.left}, ${heatmapMargin.top})`}>
                    {d3.range(24).map((hour) => (
                      <text key={`hour-${hour}`} x={(heatmapChart.xScale(hour) ?? 0) + heatmapChart.xScale.bandwidth() / 2} y={heatmapChart.innerHeight + 20} textAnchor="middle" className="fill-ink-500 text-[10px] font-medium">{hour}</text>
                    ))}
                    {d3.range(1, 13).map((month) => (
                      <text key={`month-${month}`} x={-10} y={(heatmapChart.yScale(month) ?? 0) + heatmapChart.yScale.bandwidth() / 2 + 4} textAnchor="end" className="fill-ink-500 text-[11px] font-medium">{monthLabels[month - 1]}</text>
                    ))}
                    {data.heatmap.map((cell) => (
                      <g key={`cell-${cell.month}-${cell.hour}`} transform={`translate(${heatmapChart.xScale(cell.hour) ?? 0}, ${heatmapChart.yScale(cell.month) ?? 0})`}>
                        <rect x={0} y={0} width={heatmapChart.xScale.bandwidth()} height={heatmapChart.yScale.bandwidth()} rx={6} fill={cell.mean_value == null ? "rgba(24,36,47,0.08)" : heatmapChart.colorScale(cell.mean_value)} opacity={cell.mean_value == null ? 1 : 0.95} />
                      </g>
                    ))}
                    <text x={heatmapChart.innerWidth / 2} y={heatmapChart.innerHeight + 42} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Hour of day</text>
                    <text transform={`translate(${-46}, ${heatmapChart.innerHeight / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Month</text>
                  </g>
                </svg>
              ) : (
                <div className="mt-4 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">No valid monthly-diurnal heatmap is available for the current selection.</div>
              )}
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">Hourly summary</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-ink-700 sm:grid-cols-4">
                {data.diurnal.filter((point) => point.sample_count > 0).slice(0, 8).map((point) => (
                  <div key={`diurnal-summary-${point.hour}`} className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3 text-center">
                    <div className="text-xs uppercase tracking-[0.14em] text-ink-500">{point.label}</div>
                    <div className="mt-2 font-semibold text-ink-900">{formatValue(point.mean_value)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">Monthly summary</h3>
              <div className="mt-4 space-y-3">
                {data.monthly.filter((point) => point.sample_count > 0).map((point) => (
                  <div key={`monthly-summary-${point.month}`} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white/80 px-3 py-3 text-sm text-ink-700">
                    <span className="font-medium text-ink-900">{point.label}</span>
                    <span>{formatValue(point.mean_value)} mean</span>
                    <span className="text-ink-500">{point.sample_count} samples</span>
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