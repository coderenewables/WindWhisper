import { ScatterChart } from "lucide-react";
import { useMemo } from "react";

import type { MCPCorrelationResponse } from "../../types/analysis";

interface CorrelationChartProps {
  data: MCPCorrelationResponse | null;
  isLoading: boolean;
  error: string | null;
}

const monthPalette = ["#1f8f84", "#f06f32", "#2563eb", "#7c3aed", "#ca8a04", "#dc2626", "#0891b2", "#059669", "#9333ea", "#ef4444", "#0f766e", "#1d4ed8"];

export function CorrelationChart({ data, isLoading, error }: CorrelationChartProps) {
  const chart = useMemo(() => {
    if (!data || data.scatter_points.length === 0) {
      return null;
    }

    const padding = 28;
    const width = 680;
    const height = 320;
    const xValues = data.scatter_points.map((point) => point.ref_value);
    const yValues = data.scatter_points.map((point) => point.site_value);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);

    const projectX = (value: number) => padding + ((value - minX) / spanX) * (width - padding * 2);
    const projectY = (value: number) => height - padding - ((value - minY) / spanY) * (height - padding * 2);

    const lineStartX = minX;
    const lineEndX = maxX;
    const lineStartY = data.stats.slope * lineStartX + data.stats.intercept;
    const lineEndY = data.stats.slope * lineEndX + data.stats.intercept;

    return {
      width,
      height,
      points: data.scatter_points.map((point) => ({
        x: projectX(point.ref_value),
        y: projectY(point.site_value),
        color: monthPalette[(point.month - 1 + monthPalette.length) % monthPalette.length],
      })),
      line: {
        x1: projectX(lineStartX),
        y1: projectY(lineStartY),
        x2: projectX(lineEndX),
        y2: projectY(lineEndY),
      },
    };
  }, [data]);

  return (
    <section className="panel-surface p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Step 2</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">Concurrent correlation</h2>
        </div>
        <ScatterChart className="h-5 w-5 text-ink-400" />
      </div>

      {isLoading ? <p className="mt-4 text-sm text-ink-600">Running correlation analysis...</p> : null}
      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {!isLoading && !error && !chart ? <p className="mt-4 text-sm text-ink-600">Run the correlation step to preview the concurrent relationship.</p> : null}

      {data && chart ? (
        <>
          <div className="mt-6 overflow-x-auto">
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="min-w-[640px] rounded-3xl border border-ink-100 bg-white p-2">
              <rect x="0" y="0" width={chart.width} height={chart.height} fill="#fcfcfb" rx="24" />
              <line x1="28" y1={chart.height - 28} x2={chart.width - 28} y2={chart.height - 28} stroke="#d7dde4" strokeWidth="1.5" />
              <line x1="28" y1="28" x2="28" y2={chart.height - 28} stroke="#d7dde4" strokeWidth="1.5" />
              <line x1={chart.line.x1} y1={chart.line.y1} x2={chart.line.x2} y2={chart.line.y2} stroke="#111827" strokeWidth="2" strokeDasharray="6 4" />
              {chart.points.map((point, index) => (
                <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="4" fill={point.color} fillOpacity="0.85" />
              ))}
            </svg>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              { label: "R²", value: data.stats.r_squared.toFixed(3) },
              { label: "Slope", value: data.stats.slope.toFixed(3) },
              { label: "Intercept", value: data.stats.intercept.toFixed(3) },
              { label: "RMSE", value: data.stats.rmse.toFixed(3) },
            ].map((item) => (
              <div key={item.label} className="panel-muted px-4 py-3 text-sm">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-500">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-ink-900">{item.value}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}