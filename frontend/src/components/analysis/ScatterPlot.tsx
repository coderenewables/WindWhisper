import Plot from "react-plotly.js";
import type { Layout, PlotData } from "plotly.js";
import { Activity, Dot, Filter } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { ScatterResponse } from "../../types/analysis";
import type { DatasetColumn } from "../../types/dataset";

const PolarScatterPlot = lazy(async () => {
  const module = await import("./PolarScatterPlot");
  return { default: module.PolarScatterPlot };
});

interface ScatterPlotProps {
  data: ScatterResponse | null;
  isLoading: boolean;
  error: string | null;
  xColumn: DatasetColumn | null;
  yColumn: DatasetColumn | null;
  colorColumn: DatasetColumn | null;
}

type ScatterMode = "points" | "density";

function formatAxisLabel(column: DatasetColumn | null) {
  if (!column) {
    return "";
  }
  return column.unit ? `${column.name} (${column.unit})` : column.name;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(digits);
}

function buildRegression(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return null;
  }

  const count = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / count;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / count;
  const ssX = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  if (ssX === 0) {
    return null;
  }

  const covariance = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
  const slope = covariance / ssX;
  const intercept = meanY - slope * meanX;
  const ssTotal = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const ssResidual = points.reduce((sum, point) => {
    const estimate = slope * point.x + intercept;
    return sum + (point.y - estimate) ** 2;
  }, 0);
  const rSquared = ssTotal === 0 ? 1 : 1 - ssResidual / ssTotal;
  const xValues = points.map((point) => point.x);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);

  return {
    slope,
    intercept,
    rSquared,
    line: [
      { x: minX, y: slope * minX + intercept },
      { x: maxX, y: slope * maxX + intercept },
    ],
  };
}

export function ScatterPlot({ data, isLoading, error, xColumn, yColumn, colorColumn }: ScatterPlotProps) {
  const [mode, setMode] = useState<ScatterMode>("points");

  useEffect(() => {
    if (data) {
      setMode(data.sample_count > 3000 ? "density" : "points");
    }
  }, [data]);

  const regression = useMemo(() => {
    if (!data) {
      return null;
    }
    return buildRegression(data.points.map((point) => ({ x: point.x, y: point.y })));
  }, [data]);

  const hasDirectionalAxis = xColumn?.measurement_type === "direction" || yColumn?.measurement_type === "direction";
  const angleColumn = xColumn?.measurement_type === "direction" ? xColumn : yColumn?.measurement_type === "direction" ? yColumn : null;
  const radialColumn = angleColumn?.id === xColumn?.id ? yColumn : xColumn;

  const cartesianData = useMemo<PlotData[]>(() => {
    if (!data) {
      return [];
    }

    const xValues = data.points.map((point) => point.x);
    const yValues = data.points.map((point) => point.y);
    const colorValues = data.points.map((point) => point.color);

    if (mode === "density" && data.points.length > 0) {
      const traces: PlotData[] = [
        {
          type: "histogram2d",
          x: xValues,
          y: yValues,
          colorscale: [
            [0, "rgba(255,255,255,0)"],
            [0.2, "rgba(31,143,132,0.18)"],
            [0.55, "rgba(31,143,132,0.54)"],
            [1, "rgba(240,111,50,0.92)"],
          ],
          nbinsx: 36,
          nbinsy: 36,
          hovertemplate: "x: %{x}<br>y: %{y}<br>count: %{z}<extra></extra>",
          colorbar: { title: "Density", thickness: 12 },
        } as unknown as PlotData,
      ];

      if (regression) {
        traces.push({
          type: "scatter",
          mode: "lines",
          x: regression.line.map((point) => point.x),
          y: regression.line.map((point) => point.y),
          name: "Regression",
          line: { color: "#0f172a", width: 2.5, dash: "dash" },
          hovertemplate: "Regression line<extra></extra>",
        } as PlotData);
      }

      return traces;
    }

    const traces: PlotData[] = [
      {
        type: data.points.length > 3000 ? "scattergl" : "scatter",
        mode: "markers",
        x: xValues,
        y: yValues,
        name: "Samples",
        marker: {
          size: data.points.length > 3000 ? 5 : 7,
          opacity: 0.72,
          color: colorColumn ? colorValues : "#1f8f84",
          colorscale: "Turbo",
          line: { color: "rgba(15,23,42,0.22)", width: 0.6 },
          colorbar: colorColumn ? { title: formatAxisLabel(colorColumn), thickness: 12 } : undefined,
        },
        hovertemplate: [
          `${xColumn?.name ?? "X"}: %{x:.2f}${xColumn?.unit ? ` ${xColumn.unit}` : ""}`,
          `${yColumn?.name ?? "Y"}: %{y:.2f}${yColumn?.unit ? ` ${yColumn.unit}` : ""}`,
          colorColumn ? `${colorColumn.name}: %{marker.color:.2f}${colorColumn.unit ? ` ${colorColumn.unit}` : ""}` : "",
          "<extra></extra>",
        ].filter(Boolean).join("<br>"),
      } as PlotData,
    ];

    if (regression) {
      traces.push({
        type: "scatter",
        mode: "lines",
        x: regression.line.map((point) => point.x),
        y: regression.line.map((point) => point.y),
        name: "Regression",
        line: { color: "#f06f32", width: 2.5 },
        hovertemplate: "Regression line<extra></extra>",
      } as PlotData);
    }

    return traces;
  }, [colorColumn, data, mode, regression, xColumn, yColumn]);

  const cartesianLayout = useMemo<Partial<Layout>>(
    () => ({
      margin: { l: 64, r: 24, t: 24, b: 58 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0)",
      font: { color: "#1f2937" },
      xaxis: {
        title: { text: formatAxisLabel(xColumn) },
        zeroline: false,
        gridcolor: "rgba(100,116,139,0.14)",
      },
      yaxis: {
        title: { text: formatAxisLabel(yColumn) },
        zeroline: false,
        gridcolor: "rgba(100,116,139,0.14)",
      },
      legend: { orientation: "h", x: 0, y: 1.12 },
    }),
    [xColumn, yColumn],
  );

  return (
    <section className="panel-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-ink-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Scatter diagnostics</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">Relationship plots, regression fit, and polar diagnostics</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-600">
            Compare any two columns, color points by a third channel, and switch to a density view when the point cloud gets too large to read directly.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("points")}
            className={["rounded-2xl px-4 py-3 text-sm font-medium transition", mode === "points" ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"].join(" ")}
          >
            Point cloud
          </button>
          <button
            type="button"
            onClick={() => setMode("density")}
            className={["rounded-2xl px-4 py-3 text-sm font-medium transition", mode === "density" ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"].join(" ")}
          >
            Density heatmap
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16">
          <LoadingSpinner label="Building scatter plot" />
        </div>
      ) : null}

      {!isLoading && error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div> : null}

      {!isLoading && !error && data ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700"><Activity className="h-4 w-4 text-teal-500" />Rendered points</div>
              <div className="mt-3 text-xl font-semibold text-ink-900">{data.sample_count.toLocaleString()}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">{data.is_downsampled ? `Randomly sampled from ${data.total_count.toLocaleString()} clean pairs for responsiveness.` : "All clean paired samples are shown."}</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700"><Filter className="h-4 w-4 text-teal-500" />Regression</div>
              <div className="mt-3 text-xl font-semibold text-ink-900">{regression ? `R² ${formatNumber(regression.rSquared, 3)}` : "--"}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">{regression ? `y = ${formatNumber(regression.slope, 3)}x + ${formatNumber(regression.intercept, 3)}` : "Need at least two distinct x values to fit a regression line."}</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-700"><Dot className="h-4 w-4 text-teal-500" />Color channel</div>
              <div className="mt-3 text-xl font-semibold text-ink-900">{colorColumn?.name ?? "None"}</div>
              <p className="mt-2 text-sm leading-7 text-ink-600">Use an auxiliary numeric channel to reveal directional, thermal, or turbulence-driven structure in the cloud.</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,248,0.88))] px-4 py-5">
            <Plot data={cartesianData} layout={cartesianLayout} config={{ responsive: true, displaylogo: false }} className="h-[460px] w-full" useResizeHandler />
          </div>

          {hasDirectionalAxis && angleColumn && radialColumn ? (
            <div className="rounded-[28px] border border-ink-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,242,235,0.92))] px-4 py-5">
              <div className="mb-3">
                <h3 className="text-lg font-semibold text-ink-900">Polar scatter</h3>
                <p className="mt-1 text-sm leading-7 text-ink-600">Direction is mapped to angle and {radialColumn.name} is mapped to radius so directional clusters are visible immediately.</p>
              </div>
              <Suspense fallback={<div className="py-10"><LoadingSpinner label="Loading polar scatter" /></div>}>
                <PolarScatterPlot
                  points={angleColumn.id === xColumn?.id ? data.points : data.points.map((point) => ({ x: point.y, y: point.x, color: point.color }))}
                  angleColumn={angleColumn}
                  radialColumn={radialColumn}
                  colorColumn={colorColumn}
                />
              </Suspense>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-ink-200 bg-white/75 px-4 py-4 text-sm text-ink-600">
              Choose a wind-direction column on either axis to enable the polar scatter view.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}