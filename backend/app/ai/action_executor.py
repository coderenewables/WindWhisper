"""Execute AI tool calls against the existing GoKaatru service layer."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.analysis_result import AnalysisResult
from app.models.dataset import DataColumn, Dataset
from app.models.flag import Flag
from app.models.power_curve import PowerCurve
from app.models.project import Project
from app.models.timeseries import TimeseriesData

logger = logging.getLogger(__name__)


def _uuid_from_args(args: dict[str, Any], key: str) -> UUID:
    value = args.get(key)
    if value is None:
        raise ValueError(f"Missing required argument: {key}")
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError(f"Invalid {key}: expected UUID string") from exc


async def execute_tool(db: AsyncSession, name: str, args: dict[str, Any]) -> Any:
    """Dispatch tool name to the appropriate service function."""
    dispatch = {
        "list_project_datasets": _list_project_datasets,
        "get_dataset_summary": _get_dataset_summary,
        "get_data_statistics": _get_data_statistics,
        "get_flagged_ranges": _get_flagged_ranges,
        "get_analysis_history": _get_analysis_history,
        "get_project_metadata": _get_project_metadata,
        "list_power_curves": _list_power_curves,
        "run_weibull_fit": _run_weibull,
        "run_shear_analysis": _run_shear,
        "run_turbulence_analysis": _run_turbulence,
        "run_extreme_wind": _run_extreme_wind,
        "run_mcp_comparison": _run_mcp,
        "run_energy_estimate": _run_energy,
        "record_insight": _record_insight,
        "recall_project_memory": _recall_memory,
        "delegate_to_agent": _delegate_to_agent,
        "estimate_downstream_impact": _estimate_downstream_impact,
        # Action tools (handled when approved)
        "create_qc_flag": _create_qc_flag,
        "apply_flag_rules": _apply_flag_rules,
        "generate_report": _generate_report,
    }
    handler = dispatch.get(name)
    if handler is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        return await handler(db, args)
    except (ValueError, KeyError) as exc:
        return {"error": str(exc)}


# ── Inspection tools ────────────────────────────────────────────────

async def _list_project_datasets(db: AsyncSession, args: dict) -> Any:
    pid = _uuid_from_args(args, "project_id")
    q = select(Dataset).where(Dataset.project_id == pid).options(selectinload(Dataset.columns))
    rows = (await db.execute(q)).scalars().all()
    result = []
    for ds in rows:
        cols = [{"name": c.name, "type": c.measurement_type, "height_m": c.height_m, "unit": c.unit} for c in (ds.columns or [])]
        rc = await db.scalar(select(func.count(TimeseriesData.id)).where(TimeseriesData.dataset_id == ds.id)) or 0
        result.append({
            "id": str(ds.id), "name": ds.name, "source_type": ds.source_type,
            "row_count": rc, "start_time": str(ds.start_time) if ds.start_time else None,
            "end_time": str(ds.end_time) if ds.end_time else None, "columns": cols,
        })
    return {"datasets": result, "count": len(result)}


async def _get_dataset_summary(db: AsyncSession, args: dict) -> Any:
    ds = await db.get(Dataset, _uuid_from_args(args, "dataset_id"), options=[selectinload(Dataset.columns)])
    if not ds:
        return {"error": "Dataset not found"}
    cols = [{"id": str(c.id), "name": c.name, "type": c.measurement_type, "height_m": c.height_m, "unit": c.unit} for c in (ds.columns or [])]
    rc = await db.scalar(select(func.count(TimeseriesData.id)).where(TimeseriesData.dataset_id == ds.id)) or 0
    recovery = None
    if ds.start_time and ds.end_time and rc:
        expected = (ds.end_time - ds.start_time).total_seconds() / 600
        recovery = round(rc / expected * 100, 1) if expected > 0 else None
    return {"id": str(ds.id), "name": ds.name, "source_type": ds.source_type, "row_count": rc,
            "start_time": str(ds.start_time) if ds.start_time else None, "end_time": str(ds.end_time) if ds.end_time else None,
            "columns": cols, "data_recovery_pct": recovery}


async def _get_data_statistics(db: AsyncSession, args: dict) -> Any:
    from app.services.qc_engine import load_dataset_frame
    dataset_id = _uuid_from_args(args, "dataset_id")
    loaded = await load_dataset_frame(db, dataset_id)
    df = loaded.frame
    if df is None or df.empty:
        return {"error": "No timeseries data available"}
    stats = {}
    for col in df.columns:
        s = df[col]
        if s.dtype.kind in ("f", "i"):
            stats[col] = {"mean": round(float(s.mean()), 3), "std": round(float(s.std()), 3),
                          "min": round(float(s.min()), 3), "max": round(float(s.max()), 3),
                          "null_count": int(s.isna().sum()), "recovery_pct": round(float(s.notna().mean() * 100), 1)}
    return stats


async def _get_flagged_ranges(db: AsyncSession, args: dict) -> Any:
    from app.models.flag import FlaggedRange
    dataset_id = _uuid_from_args(args, "dataset_id")
    q = select(FlaggedRange).join(Flag).where(Flag.dataset_id == dataset_id)
    rows = (await db.execute(q)).scalars().all()
    return {"ranges": [{"flag_id": str(r.flag_id), "start": str(r.start_time), "end": str(r.end_time)} for r in rows], "count": len(rows)}


async def _get_analysis_history(db: AsyncSession, args: dict) -> Any:
    dataset_id = _uuid_from_args(args, "dataset_id")
    q = select(AnalysisResult).where(AnalysisResult.dataset_id == dataset_id).order_by(AnalysisResult.created_at.desc()).limit(20)
    rows = (await db.execute(q)).scalars().all()
    return {"analyses": [{"id": str(r.id), "type": r.analysis_type, "params": r.parameters, "created_at": str(r.created_at)} for r in rows]}


async def _get_project_metadata(db: AsyncSession, args: dict) -> Any:
    p = await db.get(Project, _uuid_from_args(args, "project_id"))
    if not p:
        return {"error": "Project not found"}
    ds_count = (await db.execute(select(Dataset).where(Dataset.project_id == p.id))).scalars().all()
    return {"id": str(p.id), "name": p.name, "latitude": p.latitude, "longitude": p.longitude,
            "elevation": p.elevation, "dataset_count": len(ds_count)}


async def _list_power_curves(db: AsyncSession, _args: dict) -> Any:
    rows = (await db.execute(select(PowerCurve))).scalars().all()
    return {"power_curves": [{"id": str(r.id), "name": r.name, "manufacturer": getattr(r, "manufacturer", None)} for r in rows]}


# ── Analysis tools ──────────────────────────────────────────────────

async def _run_weibull(db: AsyncSession, args: dict) -> Any:
    from app.services.qc_engine import get_clean_dataframe
    from app.services.weibull import fit_weibull
    import numpy as np
    dataset_id = _uuid_from_args(args, "dataset_id")
    col_id = _uuid_from_args(args, "column_id")
    df = await get_clean_dataframe(db, dataset_id, exclude_flag_ids=args.get("exclude_flags"))
    col = await db.get(DataColumn, col_id)
    if col is None or df is None:
        return {"error": "Column or data not found"}
    if col.name not in df.columns:
        return {"error": f"Column '{col.name}' not present in dataset frame"}
    values = df[col.name].dropna().values
    if len(values) < 10:
        return {"error": "Insufficient data points"}
    fit = fit_weibull(values)
    return {
        "k": round(float(fit["k"]), 3),
        "A": round(float(fit["A"]), 3),
        "mean_speed": round(float(fit.get("mean_speed", np.mean(values))), 3),
        "count": len(values),
        "method": fit.get("method", "mle"),
        "r_squared": round(float(fit["r_squared"]), 4),
        "rmse": round(float(fit["rmse"]), 4),
    }


async def _run_shear(db: AsyncSession, args: dict) -> Any:
    from app.services.qc_engine import get_clean_dataframe
    from app.services.wind_shear import shear_profile
    import numpy as np

    dataset_id = _uuid_from_args(args, "dataset_id")
    df = await get_clean_dataframe(db, dataset_id, exclude_flag_ids=args.get("exclude_flags"))
    if df is None or df.empty:
        return {"error": "No data available"}

    cols = (await db.execute(select(DataColumn).where(DataColumn.dataset_id == dataset_id))).scalars().all()
    speed_cols = [c for c in cols if c.measurement_type == "speed" and c.height_m is not None]
    if len(speed_cols) < 2:
        return {"error": "Need at least 2 speed columns at different heights"}

    speeds_by_height: dict[float, np.ndarray] = {}
    column_ids_by_height: dict[float, UUID] = {}
    for c in speed_cols:
        if c.name not in df.columns:
            continue
        values = df[c.name].dropna().values
        if len(values) > 0:
            speeds_by_height[float(c.height_m)] = values
            column_ids_by_height[float(c.height_m)] = c.id

    if len(speeds_by_height) < 2:
        return {"error": "Insufficient valid speed data at multiple heights"}

    method = str(args.get("method", "power"))
    if method not in ("power", "log"):
        method = "power"

    target_height = args.get("target_height")
    if target_height is not None:
        try:
            target_height = float(target_height)
        except (TypeError, ValueError):
            return {"error": "Invalid target_height: expected numeric value"}

    return shear_profile(
        speeds_by_height,
        column_ids_by_height=column_ids_by_height,
        method=method,
        target_height=target_height,
    )


async def _run_turbulence(db: AsyncSession, args: dict) -> Any:
    from app.services.qc_engine import get_clean_dataframe
    from app.services.turbulence import calculate_ti, ti_summary
    dataset_id = _uuid_from_args(args, "dataset_id")
    df = await get_clean_dataframe(db, dataset_id, exclude_flag_ids=args.get("exclude_flags"))
    if df is None or df.empty:
        return {"error": "No data available"}
    speed_col = (await db.get(DataColumn, _uuid_from_args(args, "speed_column_id")))
    sd_col = (await db.get(DataColumn, _uuid_from_args(args, "sd_column_id")))
    if not speed_col or not sd_col:
        return {"error": "Columns not found"}
    if speed_col.name not in df.columns or sd_col.name not in df.columns:
        return {"error": "One or more requested columns are missing in dataset frame"}
    ti_values = calculate_ti(df[speed_col.name].values, df[sd_col.name].values)
    summary = ti_summary(df[speed_col.name].values, ti_values)
    return {k: round(float(v), 4) if isinstance(v, float) else v for k, v in summary.items()}


async def _run_extreme_wind(db: AsyncSession, args: dict) -> Any:
    from app.services.extreme_wind import extreme_wind_summary
    from app.services.qc_engine import get_clean_dataframe
    dataset_id = _uuid_from_args(args, "dataset_id")
    df = await get_clean_dataframe(db, dataset_id, exclude_flag_ids=args.get("exclude_flags"))
    if df is None or df.empty:
        return {"error": "No data available"}
    speed_col = await db.get(DataColumn, _uuid_from_args(args, "speed_column_id"))
    gust_col = await db.get(DataColumn, _uuid_from_args(args, "gust_column_id")) if args.get("gust_column_id") else None
    if not speed_col:
        return {"error": "Speed column not found"}
    if speed_col.name not in df.columns:
        return {"error": f"Column '{speed_col.name}' not present in dataset frame"}
    speeds = df[speed_col.name].dropna().values
    gusts = df[gust_col.name].dropna().values if gust_col else None
    result = extreme_wind_summary(speeds, gusts=gusts)
    return result


async def _run_mcp(db: AsyncSession, args: dict) -> Any:
    from app.services.mcp_engine import run_mcp
    from app.services.qc_engine import get_clean_dataframe
    site_ds_id = _uuid_from_args(args, "site_dataset_id")
    ref_ds_id = _uuid_from_args(args, "ref_dataset_id")
    site_df = await get_clean_dataframe(db, site_ds_id)
    ref_df = await get_clean_dataframe(db, ref_ds_id)
    if site_df is None or ref_df is None:
        return {"error": "One or more datasets not available"}
    site_col = await db.get(DataColumn, _uuid_from_args(args, "site_column_id"))
    ref_col = await db.get(DataColumn, _uuid_from_args(args, "ref_column_id"))
    if not site_col or not ref_col:
        return {"error": "Columns not found"}
    if site_col.name not in site_df.columns or ref_col.name not in ref_df.columns:
        return {"error": "One or more selected columns are missing in dataset frame"}
    methods = args.get("methods", ["linear", "variance_ratio", "weibull_scale"])
    results = run_mcp(site_df[site_col.name], ref_df[ref_col.name], methods=methods)
    return results


async def _run_energy(db: AsyncSession, args: dict) -> Any:
    from app.services.energy_estimate import gross_energy_estimate, load_power_curve
    from app.services.qc_engine import get_clean_dataframe
    dataset_id = _uuid_from_args(args, "dataset_id")
    df = await get_clean_dataframe(db, dataset_id, exclude_flag_ids=args.get("exclude_flags"))
    if df is None or df.empty:
        return {"error": "No data available"}
    speed_col = await db.get(DataColumn, _uuid_from_args(args, "speed_column_id"))
    pc = await load_power_curve(db, _uuid_from_args(args, "power_curve_id"))
    if not speed_col or not pc:
        return {"error": "Speed column or power curve not found"}
    if speed_col.name not in df.columns:
        return {"error": f"Column '{speed_col.name}' not present in dataset frame"}
    speeds = df[speed_col.name].dropna().values
    result = gross_energy_estimate(speeds, pc)
    return {k: round(float(v), 2) if isinstance(v, float) else v for k, v in result.items()}


# ── Reasoning tools ─────────────────────────────────────────────────

async def _record_insight(db: AsyncSession, args: dict) -> Any:
    from app.models.ai import AiProjectMemory
    mem = AiProjectMemory(
        project_id=_uuid_from_args(args, "project_id"),
        memory_type=args.get("category", "insight"),
        content=args["content"],
    )
    db.add(mem)
    await db.flush()
    return {"status": "ok", "memory_id": str(mem.id)}


async def _recall_memory(db: AsyncSession, args: dict) -> Any:
    from app.models.ai import AiProjectMemory
    pid = _uuid_from_args(args, "project_id")
    q = select(AiProjectMemory).where(AiProjectMemory.project_id == pid)
    types = args.get("memory_types")
    if types:
        q = q.where(AiProjectMemory.memory_type.in_(types))
    q = q.order_by(AiProjectMemory.created_at.desc()).limit(20)
    rows = (await db.execute(q)).scalars().all()
    return {"memories": [{"id": str(m.id), "type": m.memory_type, "content": m.content, "created_at": str(m.created_at)} for m in rows]}


# ── Action tools (executed after approval) ──────────────────────────

async def _create_qc_flag(db: AsyncSession, args: dict) -> Any:
    from app.services.qc_engine import create_flag_with_rules
    result = await create_flag_with_rules(
        db, _uuid_from_args(args, "dataset_id"),
        name=args["flag_name"],
        color=args.get("flag_color", "#FF0000"),
        rules=args.get("rules", []),
    )
    return {"status": "ok", "flag_id": str(result.id)}


async def _apply_flag_rules(db: AsyncSession, args: dict) -> Any:
    from app.services.qc_engine import apply_flag_rules
    count = await apply_flag_rules(db, _uuid_from_args(args, "dataset_id"), _uuid_from_args(args, "flag_id"))
    return {"status": "ok", "flagged_ranges_count": count}


async def _generate_report(db: AsyncSession, args: dict) -> Any:
    return {"status": "ok", "message": "Report generation queued. This feature is under development."}


async def _estimate_downstream_impact(db: AsyncSession, args: dict) -> Any:
    """Estimate downstream impact of a pending AI action."""
    from app.ai.impact import estimate_impact
    from app.models.ai import AiAction as AiActionModel
    action = await db.get(AiActionModel, _uuid_from_args(args, "action_id"))
    if action is None:
        return {"error": "Action not found"}
    return await estimate_impact(db, action.project_id, action)


async def _delegate_to_agent(db: AsyncSession, args: dict) -> Any:
    """Delegate to a domain-specific agent. Requires an active LLM client."""
    from app.ai.orchestrator import run_agent
    from app.ai.llm_client import LLMClient
    from app.config import settings

    llm = LLMClient(
        provider=settings.llm_provider,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        base_url=settings.llm_base_url,
    )
    return await run_agent(
        db,
        llm,
        _uuid_from_args(args, "project_id"),
        args["agent_name"],
        args["task_description"],
    )
