import * as d3 from "d3";
import { useMemo } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { TurbulenceDirectionBin, TurbulenceIecCurve, TurbulenceResponse, TurbulenceSpeedBin } from "../../types/analysis";

interface TurbulencePanelProps {
  data: TurbulenceResponse | null;
  isLoading: boolean;
  error: string | null;
}

const scatterWidth = 760;
const scatterHeight = 320;
const scatterMargin = { top: 20, right: 20, bottom: 48, left: 54 };
const barWidth = 760;
const barHeight = 260;
const barMargin = { top: 18, right: 20, bottom: 56, left: 54 };
const polarSize = 300;
const polarRadius = 112;

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function metricClass(iecClass: string | null) {
  if (!iecClass) {
    return "text-ink-900";
  }
  if (iecClass === "IEC Class C") {
    return "text-teal-700";
  }
  if (iecClass === "IEC Class B") {
    return "text-amber-700";
  }
  if (iecClass === "IEC Class A") {
    return "text-orange-700";
  }
  return "text-red-700";
}

function buildScatterChart(data: TurbulenceResponse | null) {
  if (!data || data.scatter_points.length === 0) {
    return null;
  }

  const innerWidth = scatterWidth - scatterMargin.left - scatterMargin.right;
  const innerHeight = scatterHeight - scatterMargin.top - scatterMargin.bottom;
  const maxSpeed = Math.max(
    d3.max(data.scatter_points, (point) => point.speed) ?? 1,
    ...data.iec_curves.flatMap((curve) => curve.points.map((point) => point.speed)),
  );
  const maxTi = Math.max(
    d3.max(data.scatter_points, (point) => point.ti) ?? 0.1,
    d3.max(data.speed_bins, (bin) => bin.representative_ti ?? 0) ?? 0.1,
    ...data.iec_curves.flatMap((curve) => curve.points.map((point) => point.ti)),
  );
  const xScale = d3.scaleLinear().domain([0, maxSpeed]).nice().range([0, innerWidth]);
  const yScale = d3.scaleLinear().domain([0, maxTi]).nice().range([innerHeight, 0]);

  return {
    innerWidth,
    innerHeight,
    xScale,
    yScale,
    xTicks: xScale.ticks(6),
    yTicks: yScale.ticks(5),
    curveLine: d3
      .line<{ speed: number; ti: number }>()
      .x((point) => xScale(point.speed))
      .y((point) => yScale(point.ti)),
  };
}

function buildRepresentativeChart(data: TurbulenceResponse | null) {
  if (!data || data.speed_bins.length === 0) {
    return null;
  }

  const innerWidth = barWidth - barMargin.left - barMargin.right;
  const innerHeight = barHeight - barMargin.top - barMargin.bottom;
  const maxTi = Math.max(
    d3.max(data.speed_bins, (bin) => bin.representative_ti ?? 0) ?? 0.1,
    d3.max(data.speed_bins, (bin) => bin.iec_class_a) ?? 0.1,
  );
  const xScale = d3
    .scaleBand<string>()
    .domain(data.speed_bins.map((bin) => `${bin.lower}-${bin.upper}`))
    .range([0, innerWidth])
    .padding(0.16);
  const yScale = d3.scaleLinear().domain([0, maxTi]).nice().range([innerHeight, 0]);

  const curveFromBins = (curve: TurbulenceIecCurve) =>
    d3
      .line<TurbulenceSpeedBin>()
      .x((bin) => (xScale(`${bin.lower}-${bin.upper}`) ?? 0) + xScale.bandwidth() / 2)
      .y((bin) => {
        const closestPoint = curve.points.reduce((closest, point) => {
          const currentDistance = Math.abs(point.speed - bin.center);
          const closestDistance = Math.abs(closest.speed - bin.center);
          return currentDistance < closestDistance ? point : closest;
        }, curve.points[0]);
        return yScale(closestPoint.ti);
      });

  return {
    innerWidth,
    innerHeight,
    xScale,
    yScale,
    yTicks: yScale.ticks(5),
    curveFromBins,
  };
}

function polarArc(bin: TurbulenceDirectionBin, maxValue: number) {
  const outerRadius = maxValue > 0 && bin.representative_ti != null ? 28 + (bin.representative_ti / maxValue) * (polarRadius - 28) : 28;
  const generator = d3
    .arc()
    .innerRadius(24)
    .outerRadius(outerRadius)
    .startAngle((bin.start_angle * Math.PI) / 180)
    .endAngle((bin.end_angle * Math.PI) / 180)
    .padAngle(0.02);

  return generator({} as never);
}

export function TurbulencePanel({ data, isLoading, error }: TurbulencePanelProps) {
  const scatterChart = useMemo(() => buildScatterChart(data), [data]);
  const representativeChart = useMemo(() => buildRepresentativeChart(data), [data]);
  const polarMax = useMemo(
    () => Math.max(d3.max(data?.direction_bins ?? [], (bin) => bin.representative_ti ?? 0) ?? 0.1, 0.1),
    [data],
  );

  return (
    <section className="panel-surface p-5 sm:p-6">
      <div className="border-b border-ink-100 pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Turbulence intensity</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink-900">IEC turbulence intensity diagnostics</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-600">
          Compare observed turbulence intensity against IEC class envelopes, review representative TI by wind speed, and inspect directional loading patterns.
        </p>
      </div>

      {isLoading ? (
        <div className="py-16">
          <LoadingSpinner label="Calculating turbulence intensity" />
        </div>
      ) : null}

      {!isLoading && error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div> : null}

      {!isLoading && !error && data ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Mean TI</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatPercent(data.summary.mean_ti)}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Average turbulence intensity across all valid timestamps.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Characteristic TI at 15 m/s</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{formatPercent(data.summary.characteristic_ti_15)}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Representative turbulence intensity interpolated to the IEC reference wind speed.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">IEC recommendation</div>
              <div className={`mt-3 text-2xl font-semibold ${metricClass(data.summary.iec_class)}`}>{data.summary.iec_class ?? "--"}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Classification against IEC 61400-1 Class A, B, and C envelopes.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Valid samples</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{data.summary.sample_count.toLocaleString()}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Paired speed and turbulence samples used in the analysis response.</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,248,0.88))] px-3 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-ink-900">TI vs wind speed</h3>
              <div className="text-xs uppercase tracking-[0.16em] text-ink-500">Scatter with IEC curves</div>
            </div>
            {scatterChart ? (
              <svg viewBox={`0 0 ${scatterWidth} ${scatterHeight}`} className="mt-4 w-full">
                <g transform={`translate(${scatterMargin.left}, ${scatterMargin.top})`}>
                  {scatterChart.yTicks.map((tick) => (
                    <g key={`y-${tick}`} transform={`translate(0, ${scatterChart.yScale(tick)})`}>
                      <line x1={0} x2={scatterChart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.1)" strokeDasharray="4 6" />
                      <text x={-10} y={4} textAnchor="end" className="fill-ink-500 text-[11px] font-medium">{(tick * 100).toFixed(0)}%</text>
                    </g>
                  ))}

                  {scatterChart.xTicks.map((tick) => (
                    <g key={`x-${tick}`} transform={`translate(${scatterChart.xScale(tick)}, 0)`}>
                      <line y1={0} y2={scatterChart.innerHeight} stroke="rgba(24,36,47,0.06)" strokeDasharray="4 6" />
                      <text y={scatterChart.innerHeight + 22} textAnchor="middle" className="fill-ink-500 text-[11px] font-medium">{tick.toFixed(0)}</text>
                    </g>
                  ))}

                  {data.scatter_points.map((point, index) => (
                    <circle key={`${point.speed}-${point.ti}-${index}`} cx={scatterChart.xScale(point.speed)} cy={scatterChart.yScale(point.ti)} r={2.6} fill="#1f8f84" fillOpacity={0.35} />
                  ))}

                  {data.iec_curves.map((curve, index) => {
                    const stroke = ["#c2410c", "#d97706", "#1f8f84"][index] ?? "#475569";
                    return (
                      <g key={curve.label}>
                        <path d={scatterChart.curveLine(curve.points) ?? ""} fill="none" stroke={stroke} strokeWidth={2.5} strokeDasharray={index === 0 ? "" : "6 5"} />
                        <text x={scatterChart.xScale(curve.points[curve.points.length - 1]?.speed ?? 0) - 8} y={scatterChart.yScale(curve.points[curve.points.length - 1]?.ti ?? 0) - 8} textAnchor="end" className="fill-ink-700 text-[10px] font-semibold">{curve.label}</text>
                      </g>
                    );
                  })}

                  <line x1={0} x2={scatterChart.innerWidth} y1={scatterChart.innerHeight} y2={scatterChart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                  <line x1={0} x2={0} y1={0} y2={scatterChart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                  <text x={scatterChart.innerWidth / 2} y={scatterChart.innerHeight + 42} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Wind speed (m/s)</text>
                  <text transform={`translate(${-42}, ${scatterChart.innerHeight / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Turbulence intensity (%)</text>
                </g>
              </svg>
            ) : (
              <div className="mt-4 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">No valid TI points are available for the current selection.</div>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_320px]">
            <div className="overflow-hidden rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,248,0.88))] px-3 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold text-ink-900">Representative TI by speed bin</h3>
                <div className="text-xs uppercase tracking-[0.16em] text-ink-500">Mean + 1.28σ</div>
              </div>
              {representativeChart ? (
                <svg viewBox={`0 0 ${barWidth} ${barHeight}`} className="mt-4 w-full">
                  <g transform={`translate(${barMargin.left}, ${barMargin.top})`}>
                    {representativeChart.yTicks.map((tick) => (
                      <g key={`rep-y-${tick}`} transform={`translate(0, ${representativeChart.yScale(tick)})`}>
                        <line x1={0} x2={representativeChart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.1)" strokeDasharray="4 6" />
                        <text x={-10} y={4} textAnchor="end" className="fill-ink-500 text-[11px] font-medium">{(tick * 100).toFixed(0)}%</text>
                      </g>
                    ))}

                    {data.speed_bins.map((bin) => {
                      const bandKey = `${bin.lower}-${bin.upper}`;
                      const x = representativeChart.xScale(bandKey) ?? 0;
                      const barTop = representativeChart.yScale(bin.representative_ti ?? 0);
                      return (
                        <g key={bandKey} transform={`translate(${x}, 0)`}>
                          <rect x={0} y={barTop} width={representativeChart.xScale.bandwidth()} height={representativeChart.innerHeight - barTop} rx={12} fill="#1f8f84" opacity={0.88} />
                          <text x={representativeChart.xScale.bandwidth() / 2} y={representativeChart.innerHeight + 18} textAnchor="middle" className="fill-ink-600 text-[10px] font-medium">{bin.center.toFixed(0)}</text>
                        </g>
                      );
                    })}

                    {data.iec_curves.map((curve, index) => {
                      const stroke = ["#c2410c", "#d97706", "#1f8f84"][index] ?? "#475569";
                      return <path key={`curve-${curve.label}`} d={representativeChart.curveFromBins(curve)(data.speed_bins) ?? ""} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray={index === 0 ? "" : "6 5"} />;
                    })}

                    <line x1={0} x2={representativeChart.innerWidth} y1={representativeChart.innerHeight} y2={representativeChart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                    <line x1={0} x2={0} y1={0} y2={representativeChart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                    <text x={representativeChart.innerWidth / 2} y={representativeChart.innerHeight + 42} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Speed bin center (m/s)</text>
                    <text transform={`translate(${-42}, ${representativeChart.innerHeight / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">Representative TI (%)</text>
                  </g>
                </svg>
              ) : (
                <div className="mt-4 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">No speed bins are available for representative TI.</div>
              )}
            </div>

            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">Speed-bin summary</h3>
              <div className="mt-4 space-y-3 text-sm text-ink-700">
                {data.speed_bins.slice(0, 8).map((bin) => (
                  <div key={`${bin.lower}-${bin.upper}`} className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3">
                    <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.14em] text-ink-500">
                      <span>{bin.lower.toFixed(0)}-{bin.upper.toFixed(0)} m/s</span>
                      <span>{bin.sample_count} pts</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>Mean: {formatPercent(bin.mean_ti)}</div>
                      <div>Rep: {formatPercent(bin.representative_ti)}</div>
                      <div>P90: {formatPercent(bin.p90_ti)}</div>
                      <div>IEC A: {formatPercent(bin.iec_class_a)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">Directional TI</h3>
              {data.direction_bins.length > 0 ? (
                <svg viewBox={`0 0 ${polarSize} ${polarSize}`} className="mt-4 w-full max-w-[300px]">
                  <g transform={`translate(${polarSize / 2}, ${polarSize / 2})`}>
                    {[0.25, 0.5, 0.75, 1].map((ratio) => (
                      <circle key={ratio} r={24 + ratio * (polarRadius - 24)} fill="none" stroke="rgba(24,36,47,0.08)" strokeDasharray="4 6" />
                    ))}
                    {[0, 90, 180, 270].map((angle) => (
                      <g key={angle} transform={`rotate(${angle})`}>
                        <line x1={0} x2={0} y1={0} y2={-polarRadius} stroke="rgba(24,36,47,0.12)" />
                      </g>
                    ))}
                    {data.direction_bins.map((bin) => (
                      <path key={bin.sector_index} d={polarArc(bin, polarMax) ?? ""} fill="#1f8f84" fillOpacity={0.86} stroke="#ffffff" strokeWidth={1.5} />
                    ))}
                    <text y={-polarRadius - 10} textAnchor="middle" className="fill-ink-600 text-[11px] font-semibold">N</text>
                    <text x={polarRadius + 12} y={4} textAnchor="middle" className="fill-ink-600 text-[11px] font-semibold">E</text>
                    <text y={polarRadius + 18} textAnchor="middle" className="fill-ink-600 text-[11px] font-semibold">S</text>
                    <text x={-polarRadius - 12} y={4} textAnchor="middle" className="fill-ink-600 text-[11px] font-semibold">W</text>
                  </g>
                </svg>
              ) : (
                <div className="mt-4 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">Add a direction column to see directional TI sectors.</div>
              )}
            </div>

            <div className="panel-muted px-4 py-4">
              <h3 className="text-lg font-semibold text-ink-900">Directional representative TI</h3>
              {data.direction_bins.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {data.direction_bins.map((bin) => (
                    <div key={bin.sector_index} className="rounded-2xl border border-ink-100 bg-white/80 px-3 py-3 text-sm text-ink-700">
                      <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.14em] text-ink-500">
                        <span>{Math.round(bin.direction)}°</span>
                        <span>{bin.sample_count} pts</span>
                      </div>
                      <div className="mt-3 text-lg font-semibold text-ink-900">{formatPercent(bin.representative_ti)}</div>
                      <div className="mt-1 text-xs text-ink-500">Mean {formatPercent(bin.mean_ti)} · P90 {formatPercent(bin.p90_ti)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">Directional TI bins are unavailable without a selected direction channel.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}