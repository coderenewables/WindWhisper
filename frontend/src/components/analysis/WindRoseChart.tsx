import * as d3 from "d3";
import { useMemo, useState } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { WindRoseResponse, WindRoseSector, WindRoseSpeedBin } from "../../types/analysis";

type RoseMode = "frequency" | "mean_value" | "energy";

interface WindRoseChartProps {
  data: WindRoseResponse | null;
  isLoading: boolean;
  error: string | null;
}

interface ArcSegment {
  key: string;
  sector: WindRoseSector;
  bin: WindRoseSpeedBin | null;
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  fill: string;
  value: number;
}

const size = 560;
const center = size / 2;
const outerRadius = 206;
const frequencyPalette = ["#d7ebe7", "#93cfc4", "#49af9c", "#1f8f84", "#17686d", "#f06f32"];
const compassLabels = [
  { label: "N", angle: 0 },
  { label: "NE", angle: 45 },
  { label: "E", angle: 90 },
  { label: "SE", angle: 135 },
  { label: "S", angle: 180 },
  { label: "SW", angle: 225 },
  { label: "W", angle: 270 },
  { label: "NW", angle: 315 },
];

function toArcAngle(angle: number) {
  return (angle * Math.PI) / 180;
}

function toCartesian(angle: number, radius: number) {
  const radians = toArcAngle(angle);
  return {
    x: center + Math.sin(radians) * radius,
    y: center - Math.cos(radians) * radius,
  };
}

function sectorLabel(sector: WindRoseSector) {
  return `${Math.round(sector.start_angle)}° to ${Math.round(sector.end_angle)}°`;
}

function valueLabel(mode: RoseMode, sector: WindRoseSector) {
  if (mode === "mean_value") {
    return sector.mean_value == null ? "No data" : `${sector.mean_value.toFixed(2)} m/s mean`;
  }
  if (mode === "energy") {
    return `${sector.energy.toFixed(1)} v^3 sum`;
  }
  return `${sector.frequency.toFixed(2)}% frequency`;
}

export function WindRoseChart({ data, isLoading, error }: WindRoseChartProps) {
  const [mode, setMode] = useState<RoseMode>("frequency");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; segment: ArcSegment } | null>(null);

  const chartData = useMemo(() => {
    if (!data) {
      return null;
    }

    const maxFrequency = d3.max(data.sectors, (sector) => d3.sum(sector.speed_bins, (bin) => bin.frequency_pct)) ?? 0;
    const maxMean = d3.max(data.sectors, (sector) => sector.mean_value ?? 0) ?? 0;
    const maxEnergy = d3.max(data.sectors, (sector) => sector.energy) ?? 0;
    const domainMax = mode === "frequency" ? maxFrequency : mode === "mean_value" ? maxMean : maxEnergy;
    const radiusScale = d3.scaleLinear().domain([0, domainMax || 1]).range([0, outerRadius]).nice();
    const singleBarScale = d3
      .scaleLinear<string>()
      .domain([0, domainMax || 1])
      .range(mode === "energy" ? ["#fde6d9", "#f06f32"] : ["#d8ecf5", "#2563eb"])
      .interpolate(d3.interpolateRgb);

    const arcGenerator = d3.arc<Pick<ArcSegment, "innerRadius" | "outerRadius" | "startAngle" | "endAngle">>();
    const segments: ArcSegment[] = [];

    for (const sector of data.sectors) {
      const rawEnd = sector.end_angle <= sector.start_angle ? sector.end_angle + 360 : sector.end_angle;
      const startAngle = toArcAngle(sector.start_angle);
      const endAngle = toArcAngle(rawEnd);

      if (mode === "frequency") {
        let cumulative = 0;
        sector.speed_bins.forEach((bin, index) => {
          if (bin.frequency_pct <= 0) {
            return;
          }

          const nextCumulative = cumulative + bin.frequency_pct;
          segments.push({
            key: `${sector.sector_index}-${bin.label}`,
            sector,
            bin,
            startAngle,
            endAngle,
            innerRadius: radiusScale(cumulative),
            outerRadius: radiusScale(nextCumulative),
            fill: frequencyPalette[index % frequencyPalette.length],
            value: bin.frequency_pct,
          });
          cumulative = nextCumulative;
        });
        continue;
      }

      const value = mode === "mean_value" ? sector.mean_value ?? 0 : sector.energy;
      if (value <= 0) {
        continue;
      }

      segments.push({
        key: `${sector.sector_index}-${mode}`,
        sector,
        bin: null,
        startAngle,
        endAngle,
        innerRadius: 0,
        outerRadius: radiusScale(value),
        fill: singleBarScale(value),
        value,
      });
    }

    return {
      radiusScale,
      ringValues: radiusScale.ticks(5).filter((value) => value > 0),
      segments,
      arcGenerator,
      legendBins: data.sectors[0]?.speed_bins ?? [],
      domainMax,
    };
  }, [data, mode]);

  return (
    <section className="panel-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-ink-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Wind rose</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">Directional frequency, mean speed, and energy distribution</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-600">
            Switch between stacked frequency bins, sector mean speed, and directional energy to inspect how the dataset behaves by compass sector.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.18em]">
          {[
            { id: "frequency", label: "Frequency" },
            { id: "mean_value", label: "Mean speed" },
            { id: "energy", label: "Energy" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id as RoseMode)}
              className={[
                "rounded-full border px-4 py-2 transition",
                mode === item.id ? "border-teal-500 bg-teal-500 text-white" : "border-ink-200 text-ink-600 hover:border-ink-400 hover:text-ink-900",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-16">
          <LoadingSpinner label="Building wind rose" />
        </div>
      ) : null}

      {!isLoading && error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div> : null}

      {!isLoading && !error && data && data.total_count === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-600">
          No valid direction and value pairs are available for the current filter selection.
        </div>
      ) : null}

      {!isLoading && !error && data && data.total_count > 0 && chartData ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative overflow-hidden rounded-[28px] border border-ink-100 bg-[radial-gradient(circle_at_center,rgba(31,143,132,0.09),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,243,247,0.88))] px-3 py-4 sm:px-6">
            <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[560px]">
              {chartData.ringValues.map((ringValue) => (
                <g key={`ring-${ringValue}`}>
                  <circle cx={center} cy={center} r={chartData.radiusScale(ringValue)} fill="none" stroke="rgba(24,36,47,0.1)" strokeDasharray="4 6" />
                  <text x={center} y={center - chartData.radiusScale(ringValue) - 6} textAnchor="middle" className="fill-ink-500 text-[10px] font-medium">
                    {mode === "energy" ? ringValue.toFixed(0) : ringValue.toFixed(1)}
                  </text>
                </g>
              ))}

              {data.sectors.map((sector) => {
                const boundary = toCartesian(sector.direction, outerRadius + 8);
                return <line key={`spoke-${sector.sector_index}`} x1={center} y1={center} x2={boundary.x} y2={boundary.y} stroke="rgba(24,36,47,0.08)" />;
              })}

              {chartData.segments.map((segment) => {
                const path = chartData.arcGenerator(segment);
                return path ? (
                  <path
                    key={segment.key}
                    d={path}
                    transform={`translate(${center}, ${center})`}
                    fill={segment.fill}
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth={1.25}
                    onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, segment })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ) : null;
              })}

              {compassLabels.map((label) => {
                const coordinates = toCartesian(label.angle, outerRadius + 28);
                return (
                  <text key={label.label} x={coordinates.x} y={coordinates.y} textAnchor="middle" dominantBaseline="middle" className="fill-ink-700 text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {label.label}
                  </text>
                );
              })}

              <circle cx={center} cy={center} r={9} fill="#18242f" />
            </svg>

            {tooltip ? (
              <div
                className="pointer-events-none fixed z-50 w-60 rounded-2xl border border-ink-100 bg-white/95 px-4 py-3 text-sm shadow-panel backdrop-blur"
                style={{ left: tooltip.x + 16, top: tooltip.y + 16 }}
              >
                <div className="font-semibold text-ink-900">{sectorLabel(tooltip.segment.sector)}</div>
                <div className="mt-1 text-ink-600">{valueLabel(mode, tooltip.segment.sector)}</div>
                <div className="mt-1 text-ink-600">{tooltip.segment.sector.sample_count} samples</div>
                {tooltip.segment.bin ? <div className="mt-2 text-ink-600">{tooltip.segment.bin.label} m/s: {tooltip.segment.bin.count} samples</div> : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Samples used</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{data.total_count.toLocaleString()}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Rows remaining after any selected QC exclusions.</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Sector density</div>
              <div className="mt-3 text-2xl font-semibold text-ink-900">{data.num_sectors}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Compass sectors included in the current aggregation.</p>
            </div>
            {mode === "frequency" ? (
              <div className="panel-muted px-4 py-4">
                <div className="text-sm font-medium text-ink-700">Speed bins</div>
                <div className="mt-4 space-y-3">
                  {chartData.legendBins.map((bin, index) => (
                    <div key={bin.label} className="flex items-center gap-3 text-sm text-ink-700">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: frequencyPalette[index % frequencyPalette.length] }} />
                      <span>{bin.label} m/s</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="panel-muted px-4 py-4">
                <div className="text-sm font-medium text-ink-700">Scale max</div>
                <div className="mt-3 text-2xl font-semibold text-ink-900">{chartData.domainMax.toFixed(mode === "energy" ? 0 : 2)}</div>
                <p className="mt-2 text-sm leading-7 text-ink-600">Highest sector value in the active display mode.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}