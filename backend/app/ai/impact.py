"""Downstream Impact Estimator — F10.

Before a user approves an AI action (e.g., applying a QC flag), this module
estimates how the action will affect downstream analysis results such as mean
wind speed, Weibull parameters, turbulence intensity, and AEP.

The estimator uses the *actual* service functions rather than approximations
so the projected numbers are trustworthy.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.analysis_result import AnalysisResult
from app.models.dataset import DataColumn, Dataset
from app.models.flag import Flag
from app.models.ai import AiAction

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def estimate_impact(
    db: AsyncSession,
    project_id: UUID,
    action: AiAction,
) -> dict[str, Any]:
    """Estimate downstream impact of *action* before it is approved.

    Dispatches to a scenario-specific estimator based on ``action.action_type``
    and the payload contents.

    Returns a structured impact summary suitable for storing in
    ``AiAction.impact_summary``.
    """
    action_type = action.action_type
    payload = action.payload or {}

    try:
        if action_type in ("create_qc_flag", "apply_flag_rules"):
            return await _estimate_qc_impact(db, project_id, payload, action_type)
        if action_type == "run_mcp_comparison":
            return await _estimate_mcp_impact(db, project_id, payload)
        if action_type in ("run_shear_analysis", "create_extrapolated_channel"):
            return await _estimate_shear_impact(db, project_id, payload)
        # Generic fallback — run a lightweight baseline snapshot
        return await _estimate_generic_impact(db, project_id, payload)
    except Exception:
        logger.exception("Impact estimation failed for action %s", action.id)
        return {
            "affected_metrics": [],
            "data_affected_pct": 0.0,
            "confidence": "low",
            "error": "Impact estimation could not complete.",
        }


# ---------------------------------------------------------------------------
# QC flag impact
# ---------------------------------------------------------------------------

async def _estimate_qc_impact(
    db: AsyncSession,
    project_id: UUID,
    payload: dict[str, Any],
    action_type: str,
) -> dict[str, Any]:
    """Estimate how a QC flag change affects mean speed, Weibull, and TI."""
    from app.services.qc_engine import get_clean_dataframe
    from app.services.weibull import fit_weibull
    from app.services.turbulence import ti_summary as _ti_summary

    dataset_id = UUID(payload["dataset_id"])

    # Determine which flag IDs are currently excluded and what will change
    existing_flag_ids = await _get_active_flag_ids(db, dataset_id)

    # Baseline: current data with existing flags excluded
    baseline_df = await get_clean_dataframe(
        db, dataset_id, exclude_flag_ids=existing_flag_ids,
    )
    if baseline_df is None or baseline_df.empty:
        return _empty_impact("No data available for baseline.")

    # Scenario: data with the *additional* flag applied
    if action_type == "apply_flag_rules" and payload.get("flag_id"):
        new_flag_id = UUID(payload["flag_id"])
        scenario_flag_ids = list(existing_flag_ids) + [new_flag_id]
    else:
        # For create_qc_flag we simulate the rules on the baseline frame
        scenario_flag_ids = list(existing_flag_ids)
        rules = payload.get("rules", [])
        if rules:
            baseline_df = _apply_simulated_rules(baseline_df, rules)
            # Re-derive scenario from the already-masked frame
            return await _compare_frames(
                db, dataset_id, baseline_df,
                baseline_df, existing_flag_ids, tag="qc_flag",
            )

    scenario_df = await get_clean_dataframe(
        db, dataset_id, exclude_flag_ids=scenario_flag_ids,
    )
    if scenario_df is None or scenario_df.empty:
        return _empty_impact("No data available after flag application.")

    return await _compare_frames(
        db, dataset_id, baseline_df, scenario_df, existing_flag_ids, tag="qc_flag",
    )


def _apply_simulated_rules(
    df: "pd.DataFrame",
    rules: list[dict[str, Any]],
) -> "pd.DataFrame":
    """Mask rows matching rule conditions to simulate flag application in-memory."""
    import pandas as pd

    mask = pd.Series(False, index=df.index)
    for rule in rules:
        col_name = rule.get("column_name") or rule.get("column")
        operator = rule.get("operator", "==")
        value = rule.get("value")
        if col_name and col_name in df.columns:
            series = df[col_name]
            if operator == "<":
                mask |= series < value
            elif operator == "<=":
                mask |= series <= value
            elif operator == ">":
                mask |= series > value
            elif operator == ">=":
                mask |= series >= value
            elif operator == "==":
                mask |= series == value
            elif operator == "!=":
                mask |= series != value
            elif operator == "between" and isinstance(value, (list, tuple)):
                mask |= series.between(value[0], value[1])
            elif operator == "is_null":
                mask |= series.isna()
    # NaN-out flagged rows (same behaviour as QC engine filter)
    result = df.copy()
    result.loc[mask] = np.nan
    return result


# ---------------------------------------------------------------------------
# MCP impact
# ---------------------------------------------------------------------------

async def _estimate_mcp_impact(
    db: AsyncSession,
    project_id: UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Estimate how switching MCP method affects long-term predicted speed."""
    from app.services.qc_engine import get_clean_dataframe
    from app.services.mcp_engine import run_mcp

    site_ds_id = UUID(payload["site_dataset_id"])
    ref_ds_id = UUID(payload["ref_dataset_id"])

    site_df = await get_clean_dataframe(db, site_ds_id)
    ref_df = await get_clean_dataframe(db, ref_ds_id)
    if site_df is None or ref_df is None:
        return _empty_impact("Site or reference data not available.")

    site_col = await db.get(DataColumn, UUID(payload["site_column_id"]))
    ref_col = await db.get(DataColumn, UUID(payload["ref_column_id"]))
    if not site_col or not ref_col:
        return _empty_impact("Site or reference column not found.")

    methods = payload.get("methods", ["linear", "variance_ratio", "weibull_scale"])
    results = run_mcp(site_df[site_col.name], ref_df[ref_col.name], methods=methods)

    if not results or not isinstance(results, list):
        return _empty_impact("MCP comparison produced no results.")

    # Build per-method metrics
    method_metrics: list[dict[str, Any]] = []
    baseline_speed: float | None = None
    for entry in results:
        method_name = entry.get("method", "unknown")
        predicted_mean = entry.get("predicted_mean") or entry.get("summary", {}).get("predicted_mean")
        if predicted_mean is not None:
            predicted_mean = float(predicted_mean)
        if baseline_speed is None and predicted_mean is not None:
            baseline_speed = predicted_mean  # first method as baseline
        method_metrics.append({
            "method": method_name,
            "predicted_mean_speed": predicted_mean,
            "uncertainty_rmse": entry.get("uncertainty"),
        })

    affected: list[dict[str, Any]] = []
    if len(method_metrics) >= 2 and baseline_speed:
        for mm in method_metrics[1:]:
            proj = mm.get("predicted_mean_speed")
            if proj is not None:
                change = proj - baseline_speed
                change_pct = change / baseline_speed * 100 if baseline_speed else 0
                affected.append({
                    "metric": f"predicted_mean_speed ({mm['method']})",
                    "current": round(baseline_speed, 3),
                    "projected": round(proj, 3),
                    "change_pct": round(change_pct, 2),
                    "direction": "increase" if change > 0 else "decrease" if change < 0 else "unchanged",
                })

    return {
        "affected_metrics": affected,
        "method_details": method_metrics,
        "data_affected_pct": 100.0,
        "confidence": "medium",
    }


# ---------------------------------------------------------------------------
# Shear impact
# ---------------------------------------------------------------------------

async def _estimate_shear_impact(
    db: AsyncSession,
    project_id: UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Estimate how shear recalculation at a different height/method affects speed."""
    from app.services.qc_engine import get_clean_dataframe
    from app.services.wind_shear import shear_profile

    dataset_id = UUID(payload["dataset_id"])
    df = await get_clean_dataframe(db, dataset_id, exclude_flag_ids=payload.get("exclude_flags"))
    if df is None or df.empty:
        return _empty_impact("No data available for shear estimation.")

    cols = (
        await db.execute(
            select(DataColumn).where(DataColumn.dataset_id == dataset_id)
        )
    ).scalars().all()

    speed_cols = [c for c in cols if c.measurement_type == "speed" and c.height_m is not None]
    if len(speed_cols) < 2:
        return _empty_impact("Need at least 2 speed columns at different heights.")

    speeds_by_height: dict[float, np.ndarray] = {}
    column_ids_by_height: dict[float, UUID] = {}
    for c in speed_cols:
        clean = df[c.name].dropna().values if c.name in df.columns else np.array([])
        if len(clean) > 0:
            speeds_by_height[c.height_m] = clean
            column_ids_by_height[c.height_m] = c.id

    if len(speeds_by_height) < 2:
        return _empty_impact("Insufficient valid speed data at multiple heights.")

    target_height = payload.get("target_height")

    affected: list[dict[str, Any]] = []

    # Run with power law (baseline)
    power_result = shear_profile(
        speeds_by_height,
        column_ids_by_height=column_ids_by_height,
        method="power",
        target_height=target_height,
    )

    # Run with log law (scenario)
    log_result = shear_profile(
        speeds_by_height,
        column_ids_by_height=column_ids_by_height,
        method="log",
        target_height=target_height,
    )

    # Compare representative pair shear exponent / roughness
    power_rep = power_result.get("representative_pair") or {}
    log_rep = log_result.get("representative_pair") or {}
    power_alpha = power_rep.get("median")
    log_z0 = log_rep.get("median")

    if power_alpha is not None:
        affected.append({
            "metric": "power_law_alpha",
            "current": round(float(power_alpha), 4),
            "projected": round(float(log_z0), 4) if log_z0 is not None else None,
            "change_pct": 0.0,
            "direction": "unchanged",
        })

    # Compare target height speed
    power_target = power_result.get("target_mean_speed")
    log_target = log_result.get("target_mean_speed")
    if power_target is not None and log_target is not None:
        change = float(log_target) - float(power_target)
        change_pct = change / float(power_target) * 100 if power_target else 0
        affected.append({
            "metric": f"extrapolated_speed_{target_height or '?'}m",
            "current": round(float(power_target), 3),
            "projected": round(float(log_target), 3),
            "change_pct": round(change_pct, 2),
            "direction": "increase" if change > 0 else "decrease" if change < 0 else "unchanged",
        })

    return {
        "affected_metrics": affected,
        "data_affected_pct": 100.0,
        "confidence": "high" if len(speeds_by_height) >= 3 else "medium",
    }


# ---------------------------------------------------------------------------
# Generic / fallback
# ---------------------------------------------------------------------------

async def _estimate_generic_impact(
    db: AsyncSession,
    project_id: UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Lightweight fallback: snapshot dataset-level summary metrics."""
    dataset_id_str = payload.get("dataset_id")
    if not dataset_id_str:
        return _empty_impact("No dataset_id in action payload.")

    from app.services.qc_engine import get_clean_dataframe

    dataset_id = UUID(dataset_id_str)
    df = await get_clean_dataframe(db, dataset_id)
    if df is None or df.empty:
        return _empty_impact("No data available.")

    cols = (
        await db.execute(
            select(DataColumn).where(DataColumn.dataset_id == dataset_id)
        )
    ).scalars().all()

    metrics: list[dict[str, Any]] = []
    for c in cols:
        if c.measurement_type == "speed" and c.name in df.columns:
            vals = df[c.name].dropna().values
            if len(vals) > 0:
                metrics.append({
                    "metric": f"mean_speed_{c.name}",
                    "current": round(float(np.mean(vals)), 3),
                    "projected": None,
                    "change_pct": 0.0,
                    "direction": "unchanged",
                })

    return {
        "affected_metrics": metrics,
        "data_affected_pct": 0.0,
        "confidence": "low",
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _compare_frames(
    db: AsyncSession,
    dataset_id: UUID,
    baseline_df: "pd.DataFrame",
    scenario_df: "pd.DataFrame",
    existing_flag_ids: list[UUID],
    *,
    tag: str = "qc_flag",
) -> dict[str, Any]:
    """Compare two DataFrames and produce a structured impact summary.

    Both frames are indexed on timestamp and have identical columns.
    *scenario_df* has additional NaN values where the new flag masks data.
    """
    from app.services.weibull import fit_weibull
    from app.services.turbulence import ti_summary as _ti_summary

    cols = (
        await db.execute(
            select(DataColumn).where(DataColumn.dataset_id == dataset_id)
        )
    ).scalars().all()

    speed_cols = [c for c in cols if c.measurement_type == "speed" and c.name in baseline_df.columns]
    sd_cols = {c.name: c for c in cols if c.measurement_type == "speed_sd" and c.name in baseline_df.columns}

    affected: list[dict[str, Any]] = []
    total_records = len(baseline_df)
    records_changed = 0

    for sc in speed_cols:
        baseline_vals = baseline_df[sc.name].dropna().values
        scenario_vals = scenario_df[sc.name].dropna().values if sc.name in scenario_df.columns else np.array([])

        if len(baseline_vals) < 10 or len(scenario_vals) < 10:
            continue

        diff_count = len(baseline_vals) - len(scenario_vals)
        records_changed = max(records_changed, diff_count)

        # Mean speed
        baseline_mean = float(np.mean(baseline_vals))
        scenario_mean = float(np.mean(scenario_vals))
        mean_change = scenario_mean - baseline_mean
        mean_pct = mean_change / baseline_mean * 100 if baseline_mean else 0
        affected.append({
            "metric": f"mean_speed_{sc.name}",
            "current": round(baseline_mean, 3),
            "projected": round(scenario_mean, 3),
            "change_pct": round(mean_pct, 2),
            "direction": _dir(mean_change),
        })

        # Weibull fit
        try:
            baseline_wb = fit_weibull(baseline_vals)
            scenario_wb = fit_weibull(scenario_vals)
            k_change = scenario_wb["k"] - baseline_wb["k"]
            k_pct = k_change / baseline_wb["k"] * 100 if baseline_wb["k"] else 0
            affected.append({
                "metric": f"weibull_k_{sc.name}",
                "current": round(baseline_wb["k"], 3),
                "projected": round(scenario_wb["k"], 3),
                "change_pct": round(k_pct, 2),
                "direction": _dir(k_change),
            })
            a_change = scenario_wb["A"] - baseline_wb["A"]
            a_pct = a_change / baseline_wb["A"] * 100 if baseline_wb["A"] else 0
            affected.append({
                "metric": f"weibull_A_{sc.name}",
                "current": round(baseline_wb["A"], 3),
                "projected": round(scenario_wb["A"], 3),
                "change_pct": round(a_pct, 2),
                "direction": _dir(a_change),
            })
        except Exception:
            logger.debug("Weibull fit skipped for %s", sc.name)

        # Turbulence intensity (if SD column available)
        sd_col_name = sc.name.replace("Speed", "Speed_SD").replace("speed", "speed_sd")
        sd_col = sd_cols.get(sd_col_name)
        if sd_col and sd_col.name in baseline_df.columns:
            try:
                bl_ti = _ti_summary(baseline_vals, baseline_df[sd_col.name].dropna().values[:len(baseline_vals)])
                sc_ti_vals = scenario_df[sd_col.name].dropna().values[:len(scenario_vals)] if sd_col.name in scenario_df.columns else None
                if sc_ti_vals is not None and len(sc_ti_vals) > 0:
                    sc_ti = _ti_summary(scenario_vals, sc_ti_vals)
                    ti_change = sc_ti.get("mean_ti", 0) - bl_ti.get("mean_ti", 0)
                    ti_pct = ti_change / bl_ti["mean_ti"] * 100 if bl_ti.get("mean_ti") else 0
                    affected.append({
                        "metric": f"mean_ti_{sc.name}",
                        "current": round(bl_ti.get("mean_ti", 0), 4),
                        "projected": round(sc_ti.get("mean_ti", 0), 4),
                        "change_pct": round(ti_pct, 2),
                        "direction": _dir(ti_change),
                    })
            except Exception:
                logger.debug("TI comparison skipped for %s", sc.name)

    data_affected_pct = round(records_changed / total_records * 100, 1) if total_records > 0 else 0.0
    confidence = "high" if total_records > 4000 else "medium" if total_records > 500 else "low"

    return {
        "affected_metrics": affected,
        "data_affected_pct": data_affected_pct,
        "confidence": confidence,
    }


async def _get_active_flag_ids(db: AsyncSession, dataset_id: UUID) -> list[UUID]:
    """Return IDs of all flags currently defined for a dataset."""
    result = await db.execute(
        select(Flag.id).where(Flag.dataset_id == dataset_id)
    )
    return [row[0] for row in result.all()]


def _dir(change: float) -> str:
    if change > 1e-9:
        return "increase"
    if change < -1e-9:
        return "decrease"
    return "unchanged"


def _empty_impact(reason: str) -> dict[str, Any]:
    return {
        "affected_metrics": [],
        "data_affected_pct": 0.0,
        "confidence": "low",
        "error": reason,
    }
