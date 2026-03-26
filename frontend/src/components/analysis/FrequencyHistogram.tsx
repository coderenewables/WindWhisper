import * as d3 from "d3";
import { useMemo } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import { WeibullOverlay, WeibullOverlayCurve } from "./WeibullOverlay";
import type { HistogramResponse, WeibullMethod, WeibullResponse } from "../../types/analysis";

interface FrequencyHistogramProps {
  data: HistogramResponse | null;
  isLoading: boolean;
  error: string | null;
  columnLabel: string;
  isWeibullAvailable: boolean;
  showWeibullFit: boolean;
  onToggleWeibullFit: (enabled: boolean) => void;
  weibullMethod: WeibullMethod;
  onChangeWeibullMethod: (method: WeibullMethod) => void;
  weibullData: WeibullResponse | null;
  isLoadingWeibull: boolean;
  weibullError: string | null;
}

const width = 760;
const height = 340;
const margin = { top: 24, right: 24, bottom: 74, left: 56 };

function formatBinLabel(lower: number, upper: number) {
  return `${lower.toFixed(1)}-${upper.toFixed(1)}`;
}

function formatMetric(value: number | null, suffix = "") {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(2)}${suffix}`;
}

function formatAxisValue(value: number) {
  return d3.format(".2~f")(value);
}

export function FrequencyHistogram({
  data,
  isLoading,
  error,
  columnLabel,
  isWeibullAvailable,
  showWeibullFit,
  onToggleWeibullFit,
  weibullMethod,
  onChangeWeibullMethod,
  weibullData,
  isLoadingWeibull,
  weibullError,
}: FrequencyHistogramProps) {
  const chart = useMemo(() => {
    if (!data || data.bins.length === 0) {
      return null;
    }

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xMin = data.bins[0]?.lower ?? 0;
    const xMax = data.bins[data.bins.length - 1]?.upper ?? xMin + 1;
    const weibullPeak = showWeibullFit && weibullData ? d3.max(weibullData.curve_points, (point) => point.frequency_pct) ?? 0 : 0;
    const maxFrequency = Math.max(d3.max(data.bins, (bin) => bin.frequency_pct) ?? 0, weibullPeak);
    const xScale = d3.scaleLinear().domain([xMin, xMax > xMin ? xMax : xMin + 1]).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([0, maxFrequency || 1]).nice().range([innerHeight, 0]);

    return {
      innerWidth,
      innerHeight,
      xScale,
      yScale,
      yTicks: yScale.ticks(5),
      xTicks: xScale.ticks(Math.min(6, Math.max(3, data.bins.length / 4))),
    };
  }, [data, showWeibullFit, weibullData]);

  return (
    <section className="panel-surface p-5 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-ink-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Frequency histogram</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">Distribution of {columnLabel}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-600">
            Review the binned distribution of the selected channel with summary statistics derived from the same QC-filtered dataset used by the analysis workspace.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16">
          <LoadingSpinner label="Building histogram" />
        </div>
      ) : null}

      {!isLoading && error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div> : null}

      {!isLoading && !error && data && data.bins.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">
          No valid samples are available for the current histogram selection.
        </div>
      ) : null}

      {!isLoading && !error && data && chart ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="overflow-hidden rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,248,0.88))] px-3 py-4 sm:px-5">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {chart.yTicks.map((tick) => (
                  <g key={tick} transform={`translate(0, ${chart.yScale(tick)})`}>
                    <line x1={0} x2={chart.innerWidth} y1={0} y2={0} stroke="rgba(24,36,47,0.1)" strokeDasharray="4 6" />
                    <text x={-12} y={4} textAnchor="end" className="fill-ink-500 text-[11px] font-medium">
                      {tick.toFixed(1)}%
                    </text>
                  </g>
                ))}

                {data.bins.map((bin, index) => {
                  const left = chart.xScale(bin.lower);
                  const right = chart.xScale(bin.upper);
                  const x = left + 1;
                  const y = chart.yScale(bin.frequency_pct);
                  const barHeight = chart.innerHeight - y;
                  const barWidth = Math.max(right - left - 2, 2);
                  return (
                    <g key={`${bin.lower}-${bin.upper}`} transform={`translate(${x}, 0)`}>
                      <rect
                        x={0}
                        y={y}
                        width={barWidth}
                        height={Math.max(barHeight, 0)}
                        rx={10}
                        fill="#1f8f84"
                        opacity={0.9}
                      />
                      {data.bins.length <= 16 ? (
                        <>
                          <text x={barWidth / 2} y={chart.innerHeight + 18} textAnchor="middle" className="fill-ink-600 text-[10px] font-medium">
                            {formatBinLabel(bin.lower, bin.upper)}
                          </text>
                          <text x={barWidth / 2} y={chart.innerHeight + 34} textAnchor="middle" className="fill-ink-400 text-[10px]">
                            {bin.count} pts
                          </text>
                        </>
                      ) : null}
                    </g>
                  );
                })}

                {showWeibullFit && weibullData && !isLoadingWeibull && !weibullError ? (
                  <WeibullOverlayCurve data={weibullData} xScale={chart.xScale} yScale={chart.yScale} />
                ) : null}

                <line x1={0} x2={chart.innerWidth} y1={chart.innerHeight} y2={chart.innerHeight} stroke="rgba(24,36,47,0.22)" />
                <line x1={0} x2={0} y1={0} y2={chart.innerHeight} stroke="rgba(24,36,47,0.22)" />

                {chart.xTicks.map((tick) => (
                  <g key={tick} transform={`translate(${chart.xScale(tick)}, ${chart.innerHeight})`}>
                    <line y1={0} y2={6} stroke="rgba(24,36,47,0.22)" />
                    <text y={22} textAnchor="middle" className="fill-ink-600 text-[10px] font-medium">
                      {formatAxisValue(tick)}
                    </text>
                  </g>
                ))}

                <text x={chart.innerWidth / 2} y={chart.innerHeight + 58} textAnchor="middle" className="fill-ink-700 text-xs font-semibold">
                  {columnLabel} bins
                </text>
                <text
                  transform={`translate(${-42}, ${chart.innerHeight / 2}) rotate(-90)`}
                  textAnchor="middle"
                  className="fill-ink-700 text-xs font-semibold"
                >
                  Frequency (%)
                </text>
              </g>
            </svg>
          </div>

          <div className="space-y-4">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Valid samples</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{data.stats.count.toLocaleString()}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Rows included in the plotted histogram after QC exclusions.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Data recovery</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{data.stats.data_recovery_pct.toFixed(1)}%</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Share of raw non-null samples preserved after cleaning and filters.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="grid grid-cols-2 gap-3 text-sm text-ink-700">
                <div>
                  <div className="text-ink-500">Mean</div>
                  <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.stats.mean)}</div>
                </div>
                <div>
                  <div className="text-ink-500">Std dev</div>
                  <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.stats.std)}</div>
                </div>
                <div>
                  <div className="text-ink-500">Median</div>
                  <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.stats.median)}</div>
                </div>
                <div>
                  <div className="text-ink-500">Min / Max</div>
                  <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.stats.min)} / {formatMetric(data.stats.max)}</div>
                </div>
              </div>
            </div>

            <WeibullOverlay
              available={isWeibullAvailable}
              enabled={showWeibullFit}
              data={weibullData}
              isLoading={isLoadingWeibull}
              error={weibullError}
              method={weibullMethod}
              onMethodChange={onChangeWeibullMethod}
              onToggle={onToggleWeibullFit}
            />
          </div>
        </div>
      ) : null}

      {!isLoading && !error && (!data || data.bins.length === 0) ? (
        <div className="mt-6">
          <WeibullOverlay
            available={isWeibullAvailable}
            enabled={showWeibullFit}
            data={weibullData}
            isLoading={isLoadingWeibull}
            error={weibullError}
            method={weibullMethod}
            onMethodChange={onChangeWeibullMethod}
            onToggle={onToggleWeibullFit}
          />
        </div>
      ) : null}
    </section>
  );
}