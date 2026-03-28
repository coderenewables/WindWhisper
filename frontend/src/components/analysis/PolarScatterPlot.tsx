import Plot from "react-plotly.js";
import type { Layout, PlotData } from "plotly.js";
import { useMemo } from "react";

import type { ScatterPoint } from "../../types/analysis";
import type { DatasetColumn } from "../../types/dataset";

interface PolarScatterPlotProps {
  points: ScatterPoint[];
  angleColumn: DatasetColumn;
  radialColumn: DatasetColumn;
  colorColumn: DatasetColumn | null;
}

function formatAxisLabel(column: DatasetColumn) {
  return column.unit ? `${column.name} (${column.unit})` : column.name;
}

export function PolarScatterPlot({ points, angleColumn, radialColumn, colorColumn }: PolarScatterPlotProps) {
  const plotData = useMemo<PlotData[]>(() => {
    const angularValues = points.map((point) => point.x);
    const radialValues = points.map((point) => point.y);
    const colorValues = points.map((point) => point.color);

    return [
      {
        type: "scatterpolar",
        mode: "markers",
        theta: angularValues,
        r: radialValues,
        marker: {
          size: 7,
          opacity: 0.82,
          color: colorColumn ? colorValues : "#1f8f84",
          colorscale: "Turbo",
          line: { color: "rgba(15,23,42,0.24)", width: 0.6 },
          colorbar: colorColumn ? { title: formatAxisLabel(colorColumn), thickness: 12 } : undefined,
        },
        hovertemplate: [
          `${angleColumn.name}: %{theta:.2f}${angleColumn.unit ? ` ${angleColumn.unit}` : ""}`,
          `${radialColumn.name}: %{r:.2f}${radialColumn.unit ? ` ${radialColumn.unit}` : ""}`,
          colorColumn ? `${colorColumn.name}: %{marker.color:.2f}${colorColumn.unit ? ` ${colorColumn.unit}` : ""}` : "",
          "<extra></extra>",
        ].filter(Boolean).join("<br>"),
      } as PlotData,
    ];
  }, [angleColumn, colorColumn, points, radialColumn]);

  const layout = useMemo<Partial<Layout>>(
    () => ({
      margin: { l: 24, r: 24, t: 24, b: 24 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      showlegend: false,
      font: { color: "#1f2937" },
      polar: {
        bgcolor: "rgba(255,255,255,0)",
        angularaxis: {
          direction: "clockwise",
          rotation: 90,
          tickmode: "array",
          tickvals: [0, 45, 90, 135, 180, 225, 270, 315],
          ticktext: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
          gridcolor: "rgba(71,85,105,0.18)",
          linecolor: "rgba(71,85,105,0.25)",
        },
        radialaxis: {
          title: { text: formatAxisLabel(radialColumn) },
          angle: 90,
          gridcolor: "rgba(71,85,105,0.14)",
          linecolor: "rgba(71,85,105,0.25)",
        },
      },
    }),
    [radialColumn],
  );

  return <Plot data={plotData} layout={layout} config={{ displayModeBar: false, responsive: true }} className="h-[420px] w-full" useResizeHandler />;
}