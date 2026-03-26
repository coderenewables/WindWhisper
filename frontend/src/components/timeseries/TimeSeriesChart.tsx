import Plot from "react-plotly.js";
import type { Layout, PlotData, Shape } from "plotly.js";
import { useEffect, useMemo, useState } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { DatasetColumn, TimeSeriesResponse } from "../../types/dataset";
import type { FlaggedRange } from "../../types/qc";

function usesSecondaryAxis(column: DatasetColumn | undefined) {
  return column?.measurement_type === "direction" || column?.measurement_type === "direction_sd";
}

interface TimeSeriesChartProps {
  datasetColumns: DatasetColumn[];
  selectedColumnIds: string[];
  colorByColumnId: Record<string, string>;
  data: TimeSeriesResponse | null;
  isLoading: boolean;
  error: string | null;
  onRangeChange: (next: { start: string | null; end: string | null }) => void;
  onFitAll: () => void;
  flaggedRanges?: FlaggedRange[];
  flagMetaById?: Record<string, { name: string; color: string | null }>;
  excludedFlagIds?: string[];
  manualSelectionEnabled?: boolean;
  onManualRangeSelected?: (next: { start: string; end: string }) => void;
}

function hexToRgba(hex: string | null | undefined, alpha: number) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return `rgba(31, 143, 132, ${alpha})`;
  }
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function TimeSeriesChart({
  datasetColumns,
  selectedColumnIds,
  colorByColumnId,
  data,
  isLoading,
  error,
  onRangeChange,
  onFitAll,
  flaggedRanges = [],
  flagMetaById = {},
  excludedFlagIds = [],
  manualSelectionEnabled = false,
  onManualRangeSelected,
}: TimeSeriesChartProps) {
  const [shiftPressed, setShiftPressed] = useState(false);
  const columnsById = Object.fromEntries(datasetColumns.map((column) => [column.id, column]));

  useEffect(() => {
    if (!manualSelectionEnabled) {
      setShiftPressed(false);
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Shift") {
        setShiftPressed(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Shift") {
        setShiftPressed(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [manualSelectionEnabled]);

  if (isLoading && !data) {
    return (
      <section className="panel-surface flex min-h-[520px] items-center justify-center p-6">
        <LoadingSpinner label="Loading time-series data" />
      </section>
    );
  }

  if (error) {
    return <section className="panel-surface min-h-[520px] p-6 text-sm text-red-700">{error}</section>;
  }

  if (!data || selectedColumnIds.length === 0) {
    return (
      <section className="panel-surface flex min-h-[520px] items-center justify-center p-6 text-sm text-ink-600">
        Select one or more channels to render the time-series chart.
      </section>
    );
  }

  const traces = selectedColumnIds
    .map((columnId) => {
      const column = columnsById[columnId];
      const series = data.columns[columnId];
      if (!column || !series) {
        return null;
      }

      return {
        x: data.timestamps,
        y: series.values,
        type: "scatter",
        mode: "lines",
        name: column.name,
        line: {
          color: colorByColumnId[columnId] ?? "#1f8f84",
          width: 2,
        },
        yaxis: usesSecondaryAxis(column) ? "y2" : "y",
        hovertemplate: `%{x}<br>${column.name}: %{y}${column.unit ? ` ${column.unit}` : ""}<extra></extra>`,
      } as unknown as PlotData;
    })
    .filter((trace): trace is PlotData => trace !== null);

  const hasSecondaryAxis = selectedColumnIds.some((columnId) => usesSecondaryAxis(columnsById[columnId]));
  const excludedFlags = excludedFlagIds
    .map((flagId) => ({ id: flagId, ...flagMetaById[flagId] }))
    .filter((flag): flag is { id: string; name: string; color: string | null } => Boolean(flag?.name));
  const overlayShapes = useMemo<Partial<Shape>[]>(
    () =>
      flaggedRanges.map((flaggedRange) => {
        const meta = flagMetaById[flaggedRange.flag_id];
        return {
          type: "rect" as const,
          xref: "x" as const,
          yref: "paper" as const,
          x0: flaggedRange.start_time,
          x1: flaggedRange.end_time,
          y0: 0,
          y1: 1,
          fillcolor: hexToRgba(meta?.color, 0.14),
          line: {
            color: hexToRgba(meta?.color, 0.55),
            width: 1,
          },
          layer: "below" as const,
        };
      }),
    [flagMetaById, flaggedRanges],
  );

  const layout: Partial<Layout> = {
    autosize: true,
    height: 520,
    margin: { l: 56, r: hasSecondaryAxis ? 56 : 24, t: 32, b: 56 },
    hovermode: "x unified",
    dragmode: manualSelectionEnabled && shiftPressed ? "select" : "pan",
    paper_bgcolor: "rgba(255,255,255,0)",
    plot_bgcolor: "rgba(255,255,255,0)",
    legend: { orientation: "h", y: -0.2 },
    shapes: overlayShapes,
    xaxis: {
      title: { text: "Timestamp" },
      gridcolor: "rgba(24,36,47,0.08)",
      zeroline: false,
    },
    yaxis: {
      title: { text: "Primary axis" },
      gridcolor: "rgba(24,36,47,0.08)",
      zeroline: false,
    },
    yaxis2: hasSecondaryAxis
      ? {
          title: { text: "Direction" },
          overlaying: "y",
          side: "right",
          showgrid: false,
          zeroline: false,
        }
      : undefined,
  };

  return (
    <section className="panel-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Chart</p>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">Interactive time-series</h2>
          {manualSelectionEnabled ? (
            <p className="mt-2 text-sm text-ink-600">Hold Shift and drag across the chart to create a manual flagged range.</p>
          ) : null}
        </div>
        {isLoading ? <LoadingSpinner label="Refreshing" /> : null}
      </div>

      {excludedFlags.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Flagged data is currently excluded from this chart.</p>
          <p className="mt-1 text-amber-800">Gaps in the plotted lines indicate timestamps removed by the selected QC filters.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {excludedFlags.map((flag) => (
              <span key={flag.id} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-amber-900">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: flag.color ?? "#1f8f84" }} />
                {flag.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <Plot
        data={traces}
        layout={layout}
        config={{
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
          modeBarButtonsToRemove: ["select2d", "lasso2d"],
        }}
        onRelayout={(event: Record<string, unknown>) => {
          const relayout = event;
          const start = relayout["xaxis.range[0]"];
          const end = relayout["xaxis.range[1]"];
          if (typeof start === "string" && typeof end === "string") {
            onRangeChange({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
            return;
          }

          if (relayout["xaxis.autorange"] === true) {
            onFitAll();
          }
        }}
        onSelected={(event) => {
          if (!manualSelectionEnabled || !onManualRangeSelected || !event?.points?.length) {
            return;
          }
          const timestamps = event.points
            .map((point) => point.x)
            .filter((value): value is string | number | Date => value != null)
            .map((value) => new Date(value).toISOString())
            .sort();

          if (timestamps.length === 0) {
            return;
          }

          onManualRangeSelected({ start: timestamps[0], end: timestamps[timestamps.length - 1] });
        }}
        style={{ width: "100%" }}
      />
    </section>
  );
}

