import Plot from "react-plotly.js";
import type { PlotData } from "plotly.js";
import { Search, ShieldPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { runTowerShadowDetection } from "../../api/qc";
import type { DatasetColumn } from "../../types/dataset";
import type { TowerShadowMethod, TowerShadowResponse } from "../../types/qc";

interface TowerShadowDetectorProps {
  datasetId: string;
  columns: DatasetColumn[];
  onApplied: (flagId: string | null) => Promise<void> | void;
}

function sectorWidth(start: number, end: number) {
  return end >= start ? end - start : 360 - start + end;
}

function sectorCenter(start: number, end: number) {
  const width = sectorWidth(start, end);
  return (start + width / 2) % 360;
}

export function TowerShadowDetector({ datasetId, columns, onApplied }: TowerShadowDetectorProps) {
  const [method, setMethod] = useState<TowerShadowMethod>("manual");
  const [boomOrientations, setBoomOrientations] = useState("0");
  const [shadowWidth, setShadowWidth] = useState("20");
  const [directionColumnId, setDirectionColumnId] = useState(
    columns.find((column) => column.measurement_type === "direction")?.id ?? "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TowerShadowResponse | null>(null);

  const directionColumns = columns.filter((column) => column.measurement_type === "direction");
  const speedColumns = columns.filter((column) => column.measurement_type === "speed");

  const polarData = useMemo<PlotData[]>(() => {
    if (!result || result.sectors.length === 0) {
      return [];
    }
    return [
      {
        type: "barpolar",
        r: result.sectors.map((sector) => Math.max(sector.point_count, 1)),
        theta: result.sectors.map((sector) => sectorCenter(sector.direction_start, sector.direction_end)),
        width: result.sectors.map((sector) => sectorWidth(sector.direction_start, sector.direction_end)),
        text: result.sectors.map(
          (sector) => `${sector.direction_start.toFixed(0)}° to ${sector.direction_end.toFixed(0)}°<br>${sector.point_count} points<br>${sector.affected_column_names.join(", ")}`,
        ),
        hovertemplate: "%{text}<extra></extra>",
        marker: {
          color: method === "manual" ? "rgba(240, 111, 50, 0.72)" : "rgba(31, 143, 132, 0.72)",
          line: { color: "rgba(24,36,47,0.2)", width: 1 },
        },
      } as unknown as PlotData,
    ];
  }, [method, result]);

  async function executeDetection(apply: boolean) {
    try {
      setIsSubmitting(true);
      setError(null);
      const orientations = boomOrientations
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number(value));
      const response = await runTowerShadowDetection(datasetId, {
        method,
        direction_column_id: directionColumnId || undefined,
        boom_orientations: method === "manual" ? orientations : undefined,
        shadow_width: Number(shadowWidth) || 20,
        apply,
      });
      setResult(response);
      if (apply) {
        await onApplied(response.flag_id);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to detect tower shadow");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel-surface p-5">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Tower shadow</p>
        <h2 className="mt-2 text-xl font-semibold text-ink-900">Detect mast interference</h2>
        <p className="mt-2 text-sm leading-7 text-ink-600">Preview tower shadow sectors from known boom orientations or infer them automatically from paired anemometer ratios.</p>
      </div>

      {directionColumns.length === 0 || speedColumns.length === 0 ? (
        <div className="panel-muted mt-5 px-4 py-4 text-sm text-ink-600">Tower shadow detection requires at least one direction channel and one speed channel.</div>
      ) : (
        <>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Detection method
              <select value={method} onChange={(event) => setMethod(event.target.value as TowerShadowMethod)} className="rounded-2xl border-ink-200 bg-white">
                <option value="manual">Known boom orientation</option>
                <option value="auto">Auto-detect from paired sensors</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Direction column
              <select value={directionColumnId} onChange={(event) => setDirectionColumnId(event.target.value)} className="rounded-2xl border-ink-200 bg-white">
                {directionColumns.map((column) => (
                  <option key={column.id} value={column.id}>{column.name}</option>
                ))}
              </select>
            </label>

            {method === "manual" ? (
              <label className="grid gap-2 text-sm font-medium text-ink-800">
                Boom orientations (degrees)
                <input value={boomOrientations} onChange={(event) => setBoomOrientations(event.target.value)} placeholder="0, 180" className="rounded-2xl border-ink-200 bg-white" />
              </label>
            ) : null}

            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Shadow width (+/- degrees)
              <input type="number" min="1" max="90" step="1" value={shadowWidth} onChange={(event) => setShadowWidth(event.target.value)} className="rounded-2xl border-ink-200 bg-white" />
            </label>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => void executeDetection(false)} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900 disabled:opacity-60">
                <Search className="h-4 w-4" />
                Preview sectors
              </button>
              <button type="button" onClick={() => void executeDetection(true)} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-700 disabled:opacity-60">
                <ShieldPlus className="h-4 w-4" />
                Apply flag
              </button>
            </div>
          </div>

          {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{error}</div> : null}

          {result ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="panel-muted px-4 py-4">
                  <div className="text-sm font-medium text-ink-700">Preview points</div>
                  <p className="mt-2 text-2xl font-semibold text-ink-900">{result.preview_point_count.toLocaleString()}</p>
                  <p className="mt-1 text-sm text-ink-600">Data points that fall inside the detected shadow sectors.</p>
                </div>
                <div className="panel-muted px-4 py-4">
                  <div className="text-sm font-medium text-ink-700">Detected sectors</div>
                  <p className="mt-2 text-2xl font-semibold text-ink-900">{result.sectors.length}</p>
                  <p className="mt-1 text-sm text-ink-600">Method: {result.method === "manual" ? "Known orientation" : "Auto-detected"}</p>
                </div>
              </div>

              {result.sectors.length > 0 ? (
                <div className="panel-muted p-4">
                  <Plot
                    data={polarData}
                    layout={{
                      autosize: true,
                      height: 320,
                      margin: { l: 20, r: 20, t: 20, b: 20 },
                      paper_bgcolor: "rgba(255,255,255,0)",
                      plot_bgcolor: "rgba(255,255,255,0)",
                      polar: {
                        angularaxis: { direction: "clockwise", rotation: 90 },
                        radialaxis: { ticksuffix: " pts" },
                      },
                      showlegend: false,
                    }}
                    config={{ responsive: true, displaylogo: false }}
                    style={{ width: "100%" }}
                  />
                </div>
              ) : (
                <div className="panel-muted px-4 py-4 text-sm text-ink-600">No tower shadow sectors were detected with the current inputs.</div>
              )}

              <div className="space-y-2">
                {result.sectors.map((sector, index) => (
                  <div key={`${sector.direction_start}-${sector.direction_end}-${index}`} className="rounded-2xl border border-ink-100 bg-white/70 px-4 py-4 text-sm text-ink-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-ink-900/5 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-600">
                        {sector.direction_start.toFixed(0)}° to {sector.direction_end.toFixed(0)}°
                      </span>
                      <span className="rounded-full bg-ink-900/5 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-600">{sector.point_count} points</span>
                      <span className="rounded-full bg-ink-900/5 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-600">{sector.range_count} ranges</span>
                    </div>
                    <p className="mt-2 text-sm text-ink-600">Affected columns: {sector.affected_column_names.join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}