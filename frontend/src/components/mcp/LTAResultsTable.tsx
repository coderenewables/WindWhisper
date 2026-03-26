import { BarChart3, CheckCircle2, Sigma } from "lucide-react";
import { useMemo } from "react";

import type { MCPComparisonResponse, MCPComparisonRow, MCPCorrelationResponse, MCPPredictionResponse } from "../../types/analysis";
import type { DatasetDetail } from "../../types/dataset";

interface LTAResultsTableProps {
  comparison: MCPComparisonResponse | null;
  prediction: MCPPredictionResponse | null;
  correlation: MCPCorrelationResponse | null;
  siteDetail: DatasetDetail | null;
  isLoading: boolean;
  error: string | null;
}

function getMonthLabel(month: number) {
  return new Date(Date.UTC(2025, month - 1, 1)).toLocaleString(undefined, { month: "short" });
}

function buildHistogram(values: number[], bins = 8) {
  if (values.length === 0) {
    return [] as Array<{ lower: number; upper: number; count: number }>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = Math.max((max - min) / bins, 0.5);
  const counts = Array.from({ length: bins }, () => 0);
  values.forEach((value) => {
    const index = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / width)));
    counts[index] += 1;
  });

  return counts.map((count, index) => ({
    lower: min + index * width,
    upper: min + (index + 1) * width,
    count,
  }));
}

function buildHistogramChart(shortTermValues: number[], longTermValues: number[]) {
  const shortTerm = buildHistogram(shortTermValues);
  const longTerm = buildHistogram(longTermValues);
  const barCount = Math.max(shortTerm.length, longTerm.length);
  const maxCount = Math.max(1, ...shortTerm.map((item) => item.count), ...longTerm.map((item) => item.count));

  return { shortTerm, longTerm, barCount, maxCount };
}

function resolveRecommendedRow(comparison: MCPComparisonResponse | null, prediction: MCPPredictionResponse | null) {
  if (comparison) {
    return comparison.results.find((row) => row.method === comparison.recommended_method) ?? comparison.results[0] ?? null;
  }
  if (prediction) {
    return {
      method: prediction.method,
      params: prediction.params,
      stats: prediction.stats,
      summary: prediction.summary,
      cross_validation: null,
      uncertainty: prediction.stats.rmse,
    } as (MCPComparisonRow & { cross_validation: null });
  }
  return null;
}

export function LTAResultsTable({ comparison, prediction, correlation, siteDetail, isLoading, error }: LTAResultsTableProps) {
  const recommended = useMemo(() => resolveRecommendedRow(comparison, prediction), [comparison, prediction]);
  const predictedSeries = prediction?.predicted_points ?? [];
  const shortTermValues = correlation?.scatter_points.map((point) => point.site_value) ?? [];
  const longTermValues = predictedSeries.map((point) => point.value);
  const histogram = useMemo(() => buildHistogramChart(shortTermValues, longTermValues), [longTermValues, shortTermValues]);
  const matrixOutputs = prediction?.matrix_outputs ?? [];
  const columnNameById = useMemo(
    () => Object.fromEntries((siteDetail?.columns ?? []).map((column) => [column.id, column.name])),
    [siteDetail],
  );

  return (
    <section className="panel-surface p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Step 3-4</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">Method comparison and long-term results</h2>
        </div>
        {recommended ? (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Recommended: {recommended.method.replace("_", " ")}
          </div>
        ) : null}
      </div>

      {isLoading ? <p className="mt-4 text-sm text-ink-600">Running long-term adjustment calculations...</p> : null}
      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {!isLoading && !error && !comparison && !prediction ? <p className="mt-4 text-sm text-ink-600">Compare methods to rank uncertainty, then run the selected method to inspect the long-term series.</p> : null}

      {comparison ? (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-ink-500">
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">R²</th>
                <th className="px-4 py-2">RMSE</th>
                <th className="px-4 py-2">Predicted mean</th>
                <th className="px-4 py-2">Weibull k</th>
                <th className="px-4 py-2">Uncertainty</th>
              </tr>
            </thead>
            <tbody>
              {comparison.results.map((row) => {
                const isRecommended = row.method === comparison.recommended_method;
                return (
                  <tr key={row.method} className={isRecommended ? "rounded-3xl bg-emerald-50 text-ink-900" : "rounded-3xl bg-ink-50/70 text-ink-800"}>
                    <td className="rounded-l-3xl px-4 py-4 font-medium capitalize">{row.method.replace("_", " ")}</td>
                    <td className="px-4 py-4">{row.stats.r_squared.toFixed(3)}</td>
                    <td className="px-4 py-4">{row.stats.rmse.toFixed(3)}</td>
                    <td className="px-4 py-4">{row.summary.long_term_mean_speed.toFixed(2)} m/s</td>
                    <td className="px-4 py-4">{row.summary.weibull?.k.toFixed(2) ?? "--"}</td>
                    <td className="rounded-r-3xl px-4 py-4">{row.uncertainty.toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {recommended ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <div className="panel-muted p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
              <BarChart3 className="h-4 w-4 text-teal-500" />
              Monthly long-term means
            </div>
            <div className="mt-5 flex items-end gap-3 overflow-x-auto pb-2">
              {recommended.summary.monthly_means.map((month) => {
                const barHeight = Math.max(24, month.mean_speed * 18);
                const errorBar = (comparison?.results.find((row) => row.method === recommended.method)?.uncertainty ?? recommended.uncertainty) * 8;
                return (
                  <div key={month.month} className="flex min-w-[56px] flex-col items-center gap-2 text-xs text-ink-600">
                    <div className="text-[11px] text-ink-500">{month.mean_speed.toFixed(2)}</div>
                    <div className="relative flex h-56 w-10 items-end justify-center">
                      <div className="w-8 rounded-t-2xl bg-teal-500/85" style={{ height: `${barHeight}px` }} />
                      <div className="absolute bottom-[calc(var(--bar-height,0px)+4px)] flex w-10 items-center justify-center" style={{ ["--bar-height" as string]: `${barHeight}px` }}>
                        <div className="h-px w-8 bg-ink-900" />
                        <div className="absolute h-8 w-px bg-ink-900" style={{ height: `${Math.max(8, errorBar)}px` }} />
                      </div>
                    </div>
                    <div>{getMonthLabel(month.month)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel-muted p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
              <Sigma className="h-4 w-4 text-ember-500" />
              Short-term vs long-term frequency
            </div>
            <div className="mt-5 space-y-3">
              {Array.from({ length: histogram.barCount }, (_, index) => {
                const shortCount = histogram.shortTerm[index]?.count ?? 0;
                const longCount = histogram.longTerm[index]?.count ?? 0;
                return (
                  <div key={`hist-${index}`} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-ink-500">
                      <span>Bin {index + 1}</span>
                      <span>{shortCount}/{longCount}</span>
                    </div>
                    <div className="flex h-3 overflow-hidden rounded-full bg-white">
                      <div className="bg-ink-900/75" style={{ width: `${(shortCount / histogram.maxCount) * 100}%` }} />
                      <div className="bg-teal-500/80" style={{ width: `${(longCount / histogram.maxCount) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-600">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-ink-900/75" />Measured short-term</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-teal-500/80" />Predicted long-term</span>
            </div>
          </div>
        </div>
      ) : null}

      {matrixOutputs.length > 1 ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {matrixOutputs.map((output) => (
            <div key={output.site_column_id} className="panel-muted p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-500">Matrix output</p>
              <h3 className="mt-2 text-lg font-semibold text-ink-900">{columnNameById[output.site_column_id] ?? output.site_column_id}</h3>
              <p className="mt-2 text-sm text-ink-600">Long-term mean: {output.summary.long_term_mean_speed.toFixed(2)} m/s</p>
              <p className="text-sm text-ink-600">R²: {output.stats.r_squared.toFixed(3)} · RMSE: {output.stats.rmse.toFixed(3)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}