import * as d3 from "d3";
import { useMemo } from "react";

import type { WeibullCurvePoint, WeibullMethod, WeibullResponse } from "../../types/analysis";

interface WeibullOverlayCurveProps {
  data: WeibullResponse;
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
}

interface WeibullOverlayProps {
  available: boolean;
  enabled: boolean;
  data: WeibullResponse | null;
  isLoading: boolean;
  error: string | null;
  method: WeibullMethod;
  onMethodChange: (method: WeibullMethod) => void;
  onToggle: (enabled: boolean) => void;
}

function formatMetric(value: number | null | undefined, digits = 2, suffix = "") {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function methodLabel(method: WeibullMethod) {
  return method === "moments" ? "WAsP moments" : "Maximum likelihood";
}

export function WeibullOverlayCurve({ data, xScale, yScale }: WeibullOverlayCurveProps) {
  const path = useMemo(() => {
    const line = d3
      .line<WeibullCurvePoint>()
      .defined((point) => Number.isFinite(point.x) && Number.isFinite(point.frequency_pct))
      .x((point) => xScale(point.x))
      .y((point) => yScale(point.frequency_pct));

    return line(data.curve_points) ?? "";
  }, [data.curve_points, xScale, yScale]);

  if (!path) {
    return null;
  }

  return (
    <g aria-hidden="true">
      <path d={path} fill="none" stroke="#d97706" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export function WeibullOverlay({ available, enabled, data, isLoading, error, method, onMethodChange, onToggle }: WeibullOverlayProps) {
  return (
    <section className="panel-muted px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink-700">Weibull fit</div>
          <p className="mt-2 text-sm leading-7 text-ink-600">Overlay a fitted Weibull frequency curve for wind speed channels and compare MLE against a moments-based fit.</p>
        </div>
        <label className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800">
          <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} disabled={!available} className="rounded border-ink-300 text-ember-500 focus:ring-ember-500" />
          <span>Show Weibull fit</span>
        </label>
      </div>

      <fieldset className="mt-4 grid gap-2 sm:grid-cols-2" disabled={!available || !enabled}>
        <label className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white px-3 py-3 text-sm text-ink-800">
          <input type="radio" name="weibull-method" value="mle" checked={method === "mle"} onChange={() => onMethodChange("mle")} className="border-ink-300 text-ember-500 focus:ring-ember-500" />
          <span>MLE</span>
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white px-3 py-3 text-sm text-ink-800">
          <input type="radio" name="weibull-method" value="moments" checked={method === "moments"} onChange={() => onMethodChange("moments")} className="border-ink-300 text-ember-500 focus:ring-ember-500" />
          <span>Moments</span>
        </label>
      </fieldset>

      {!available ? <p className="mt-4 text-sm leading-7 text-ink-600">Weibull fitting is available when the histogram is built from a wind speed column.</p> : null}
      {available && !enabled ? <p className="mt-4 text-sm leading-7 text-ink-600">Enable the overlay to fetch and display Weibull parameters for the selected speed channel.</p> : null}
      {available && enabled && isLoading ? <p className="mt-4 text-sm leading-7 text-ink-600">Fitting {methodLabel(method).toLowerCase()} curve...</p> : null}
      {available && enabled && !isLoading && error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {available && enabled && !isLoading && !error && data ? (
        <>
          <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            Active method: <span className="font-semibold">{methodLabel(data.fit.method)}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-ink-700">
            <div>
              <div className="text-ink-500">k parameter</div>
              <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.fit.k, 3)}</div>
            </div>
            <div>
              <div className="text-ink-500">A parameter</div>
              <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.fit.A, 3)}</div>
            </div>
            <div>
              <div className="text-ink-500">Mean speed</div>
              <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.fit.mean_speed, 2, " m/s")}</div>
            </div>
            <div>
              <div className="text-ink-500">Power density</div>
              <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.fit.mean_power_density, 1, " W/m²")}</div>
            </div>
            <div>
              <div className="text-ink-500">R²</div>
              <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.fit.r_squared, 3)}</div>
            </div>
            <div>
              <div className="text-ink-500">RMSE</div>
              <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.fit.rmse, 3)}</div>
            </div>
            <div className="col-span-2">
              <div className="text-ink-500">Kolmogorov-Smirnov</div>
              <div className="mt-1 font-semibold text-ink-900">{formatMetric(data.fit.ks_stat, 3)}</div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}