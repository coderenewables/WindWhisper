import Plot from "react-plotly.js";
import type { PlotData } from "plotly.js";
import { AlertTriangle, RefreshCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getDataset } from "../../api/datasets";
import { runGapReconstruction } from "../../api/qc";
import type { DatasetColumn, DatasetSummary } from "../../types/dataset";
import type { ReconstructionMethod, ReconstructionResponse } from "../../types/qc";

interface GapFillPanelProps {
  datasetId: string;
  datasets: DatasetSummary[];
  columns: DatasetColumn[];
  onSaved?: (response: ReconstructionResponse) => Promise<void> | void;
}

function prefersReconstruction(column: DatasetColumn) {
  return column.measurement_type !== "direction" && column.measurement_type !== "direction_sd";
}

function formatNumber(value: number | null, digits = 2) {
  return value == null || Number.isNaN(value) ? "--" : value.toFixed(digits);
}

function defaultTargetColumn(columns: DatasetColumn[]) {
  return columns.find(prefersReconstruction)?.id ?? columns[0]?.id ?? "";
}

function defaultPredictors(columns: DatasetColumn[], targetColumnId: string) {
  return columns.filter((column) => column.id !== targetColumnId && prefersReconstruction(column)).map((column) => column.id);
}

export function GapFillPanel({ datasetId, datasets, columns, onSaved }: GapFillPanelProps) {
  const [targetColumnId, setTargetColumnId] = useState(defaultTargetColumn(columns));
  const [method, setMethod] = useState<ReconstructionMethod>("interpolation");
  const [predictorColumnIds, setPredictorColumnIds] = useState<string[]>(defaultPredictors(columns, defaultTargetColumn(columns)));
  const [referenceDatasetId, setReferenceDatasetId] = useState(datasetId);
  const [referenceColumnId, setReferenceColumnId] = useState("");
  const [referenceColumns, setReferenceColumns] = useState<DatasetColumn[]>(columns);
  const [maxGapHours, setMaxGapHours] = useState(6);
  const [nNeighbors, setNNeighbors] = useState(5);
  const [newColumnName, setNewColumnName] = useState("");
  const [result, setResult] = useState<ReconstructionResponse | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetColumn = columns.find((column) => column.id === targetColumnId) ?? null;

  useEffect(() => {
    const fallbackTarget = defaultTargetColumn(columns);
    setTargetColumnId((current) => (columns.some((column) => column.id === current) ? current : fallbackTarget));
  }, [columns]);

  useEffect(() => {
    setPredictorColumnIds((current) => {
      const valid = current.filter((columnId) => columnId !== targetColumnId && columns.some((column) => column.id === columnId));
      return valid.length > 0 ? valid : defaultPredictors(columns, targetColumnId);
    });
    setNewColumnName((current) => current || (targetColumn ? `${targetColumn.name}_filled_${method}` : ""));
  }, [columns, method, targetColumn, targetColumnId]);

  useEffect(() => {
    setReferenceDatasetId((current) => current || datasetId);
  }, [datasetId]);

  useEffect(() => {
    if (referenceDatasetId === datasetId) {
      setReferenceColumns(columns);
      setReferenceColumnId((current) => (columns.some((column) => column.id === current) ? current : columns.find((column) => column.id !== targetColumnId)?.id ?? ""));
      return;
    }

    let cancelled = false;
    void getDataset(referenceDatasetId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setReferenceColumns(response.columns);
        setReferenceColumnId((current) => (response.columns.some((column) => column.id === current) ? current : response.columns[0]?.id ?? ""));
      })
      .catch(() => {
        if (!cancelled) {
          setReferenceColumns([]);
          setReferenceColumnId("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [columns, datasetId, referenceDatasetId, targetColumnId]);

  const previewChartData = useMemo<PlotData[]>(() => {
    if (!result) {
      return [];
    }

    return [
      {
        x: result.preview.timestamps,
        y: result.preview.original_values,
        type: "scatter",
        mode: "lines",
        name: "Original",
        line: { color: "#64748b", width: 2 },
      } as PlotData,
      {
        x: result.preview.timestamps,
        y: result.preview.reconstructed_values,
        type: "scatter",
        mode: "lines",
        name: "Reconstructed",
        line: { color: "#1f8f84", width: 2.5 },
      } as PlotData,
    ];
  }, [result]);

  async function runPreview() {
    if (!targetColumnId) {
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const response = await runGapReconstruction(datasetId, {
        column_id: targetColumnId,
        method,
        save_mode: "preview",
        predictor_column_ids: method === "knn" ? predictorColumnIds : undefined,
        reference_dataset_id: method === "correlation" ? referenceDatasetId : undefined,
        reference_column_id: method === "correlation" ? referenceColumnId : undefined,
        max_gap_hours: maxGapHours,
        n_neighbors: nNeighbors,
      });
      setResult(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to preview reconstruction");
    } finally {
      setIsBusy(false);
    }
  }

  async function commit(saveMode: "new_column" | "overwrite") {
    if (!targetColumnId) {
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const response = await runGapReconstruction(datasetId, {
        column_id: targetColumnId,
        method,
        save_mode: saveMode,
        predictor_column_ids: method === "knn" ? predictorColumnIds : undefined,
        reference_dataset_id: method === "correlation" ? referenceDatasetId : undefined,
        reference_column_id: method === "correlation" ? referenceColumnId : undefined,
        max_gap_hours: maxGapHours,
        n_neighbors: nNeighbors,
        new_column_name: saveMode === "new_column" ? newColumnName || undefined : undefined,
      });
      setResult(response);
      await onSaved?.(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save reconstructed data");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="panel-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Gap fill</p>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">Reconstruct missing values</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-600">
            Preview interpolation, KNN, or correlation-based fills before saving them as a new column or applying them back onto the source channel.
          </p>
        </div>
        <button type="button" onClick={() => void runPreview()} disabled={!targetColumnId || isBusy} className="inline-flex items-center gap-2 rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-700 disabled:opacity-60">
          <RefreshCcw className="h-4 w-4" />
          Preview fill
        </button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Target column
            <select value={targetColumnId} onChange={(event) => setTargetColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
              {columns.map((column) => (
                <option key={column.id} value={column.id}>{column.name}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Method
            <select value={method} onChange={(event) => setMethod(event.target.value as ReconstructionMethod)} className="rounded-2xl border-ink-200 bg-white">
              <option value="interpolation">Linear interpolation</option>
              <option value="knn">KNN</option>
              <option value="correlation">Correlation</option>
            </select>
          </label>

          {method === "interpolation" ? (
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Max gap length (hours)
              <input type="number" min={1} max={168} value={maxGapHours} onChange={(event) => setMaxGapHours(Number(event.target.value) || 1)} className="rounded-2xl border-ink-200 bg-white" />
            </label>
          ) : null}

          {method === "knn" ? (
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Neighbors
              <input type="number" min={1} max={50} value={nNeighbors} onChange={(event) => setNNeighbors(Number(event.target.value) || 1)} className="rounded-2xl border-ink-200 bg-white" />
            </label>
          ) : null}

          {method === "correlation" ? (
            <>
              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Reference dataset
                <select value={referenceDatasetId} onChange={(event) => setReferenceDatasetId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Reference column
                <select value={referenceColumnId} onChange={(event) => setReferenceColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                  {referenceColumns.map((column) => (
                    <option key={column.id} value={column.id}>{column.name}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {method === "knn" ? (
            <div className="md:col-span-2">
              <p className="mb-2 text-sm font-medium text-ink-800">Predictor columns</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {columns.filter((column) => column.id !== targetColumnId && prefersReconstruction(column)).map((column) => {
                  const checked = predictorColumnIds.includes(column.id);
                  return (
                    <label key={column.id} className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-3 py-3 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setPredictorColumnIds((current) =>
                            current.includes(column.id) ? current.filter((item) => item !== column.id) : [...current, column.id],
                          )
                        }
                      />
                      <span>{column.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel-muted grid gap-4 p-4">
          <div>
            <p className="text-sm font-medium text-ink-800">Save target</p>
            <p className="mt-1 text-sm leading-7 text-ink-600">Run a preview first, then either create a reconstructed companion column or overwrite the source channel only at missing timestamps.</p>
          </div>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            New column name
            <input value={newColumnName} onChange={(event) => setNewColumnName(event.target.value)} placeholder="Speed_80m_filled_interpolation" className="rounded-2xl border-ink-200 bg-white" />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void commit("new_column")} disabled={!result || result.summary.filled_count === 0 || isBusy} className="inline-flex items-center gap-2 rounded-2xl bg-ember-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-ember-400 disabled:opacity-60">
              <Save className="h-4 w-4" />
              Save as new column
            </button>
            <button type="button" onClick={() => void commit("overwrite")} disabled={!result || result.summary.filled_count === 0 || isBusy} className="rounded-2xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900 disabled:opacity-60">
              Overwrite source gaps
            </button>
          </div>
          {result?.saved_column ? (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/80 px-4 py-3 text-sm text-teal-800">
              Saved {result.summary.filled_count} filled points to {result.saved_column.name}.
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Gaps</div>
              <p className="mt-3 text-2xl font-semibold text-ink-900">{result.summary.gap_count}</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Filled points</div>
              <p className="mt-3 text-2xl font-semibold text-ink-900">{result.summary.filled_count}</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Recovery</div>
              <p className="mt-3 text-2xl font-semibold text-ink-900">{formatNumber(result.summary.recovery_after_pct, 1)}%</p>
              <p className="mt-1 text-xs text-ink-500">from {formatNumber(result.summary.recovery_before_pct, 1)}%</p>
            </div>
            <div className="panel-muted px-4 py-4">
              <div className="text-sm font-medium text-ink-700">Step</div>
              <p className="mt-3 text-2xl font-semibold text-ink-900">{Math.round(result.summary.expected_step_seconds / 60)} min</p>
            </div>
          </div>

          <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="panel-muted p-4">
              <div className="mb-3">
                <h3 className="text-lg font-semibold text-ink-900">Preview</h3>
                <p className="mt-1 text-sm text-ink-600">Original data is shown in slate. Reconstructed data includes the filled intervals.</p>
              </div>
              <Plot
                data={previewChartData}
                layout={{
                  autosize: true,
                  height: 320,
                  margin: { l: 48, r: 24, t: 24, b: 48 },
                  paper_bgcolor: "rgba(255,255,255,0)",
                  plot_bgcolor: "rgba(255,255,255,0)",
                  legend: { orientation: "h", y: -0.2 },
                  xaxis: { title: { text: "Timestamp" }, gridcolor: "rgba(24,36,47,0.08)" },
                  yaxis: { title: { text: targetColumn?.unit ? `${targetColumn.name} (${targetColumn.unit})` : targetColumn?.name ?? "Value" }, gridcolor: "rgba(24,36,47,0.08)" },
                }}
                config={{ responsive: true, displaylogo: false }}
                style={{ width: "100%" }}
              />
            </div>

            <div className="panel-muted p-4">
              <h3 className="text-lg font-semibold text-ink-900">Gap inventory</h3>
              <div className="mt-3 space-y-2">
                {result.gaps.length === 0 ? (
                  <p className="text-sm text-ink-500">No missing ranges were found for this channel.</p>
                ) : (
                  result.gaps.map((gap, index) => (
                    <div key={`${gap.start_time}-${gap.end_time}-${index}`} className="rounded-2xl border border-ink-200 bg-white/80 px-3 py-3 text-sm text-ink-700">
                      <p className="font-medium text-ink-900">{new Date(gap.start_time).toLocaleString()} to {new Date(gap.end_time).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-ink-500">{gap.num_missing} missing steps · {formatNumber(gap.duration_hours, 2)} hours</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}