"""Assemble project context for the LLM context window."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.analysis_result import AnalysisResult
from app.models.change_log import ChangeLog
from app.models.dataset import DataColumn, Dataset
from app.models.flag import Flag
from app.models.project import Project

logger = logging.getLogger(__name__)


async def assemble_project_context(db: AsyncSession, project_id: UUID) -> str:
    """Build a concise text summary of the project state for the LLM system prompt."""

    project = await db.get(Project, project_id)
    if not project:
        return "Project not found."

    lines: list[str] = []
    lines.append(f"Project: {project.name}")
    if project.latitude is not None and project.longitude is not None:
        lines.append(f"Location: {project.latitude:.4f}°N, {project.longitude:.4f}°E, elevation {project.elevation or 0:.0f} m")

    # Datasets
    ds_q = select(Dataset).where(Dataset.project_id == project_id).options(selectinload(Dataset.columns))
    datasets = (await db.execute(ds_q)).scalars().all()
    lines.append(f"Datasets: {len(datasets)}")

    for ds in datasets:
        cols = ds.columns or []
        col_str = ", ".join(f"{c.name} ({c.measurement_type or '?'}, {c.height_m or '?'}m)" for c in cols[:8])
        if len(cols) > 8:
            col_str += f" … +{len(cols) - 8} more"
        period = ""
        if ds.start_time and ds.end_time:
            days = (ds.end_time - ds.start_time).days
            period = f"  Period: {ds.start_time:%Y-%m-%d} → {ds.end_time:%Y-%m-%d} ({days} days)"
        lines.append(f"\n  [{ds.source_type or 'unknown'}] {ds.name}{period}")
        if col_str:
            lines.append(f"  Columns: {col_str}")

    # QC flags summary
    flag_q = select(Flag).join(Dataset).where(Dataset.project_id == project_id)
    flags = (await db.execute(flag_q)).scalars().all()
    if flags:
        lines.append(f"\nQC Flags: {len(flags)} total")

    # Analysis results
    ar_q = (
        select(AnalysisResult.analysis_type, func.count())
        .join(Dataset)
        .where(Dataset.project_id == project_id)
        .group_by(AnalysisResult.analysis_type)
    )
    ar_rows = (await db.execute(ar_q)).all()
    if ar_rows:
        lines.append("\nCompleted analyses: " + ", ".join(f"{t}({n})" for t, n in ar_rows))

    # Recent changes
    cl_q = (
        select(ChangeLog)
        .join(Dataset)
        .where(Dataset.project_id == project_id)
        .order_by(ChangeLog.created_at.desc())
        .limit(5)
    )
    changes = (await db.execute(cl_q)).scalars().all()
    if changes:
        lines.append("\nRecent changes:")
        for ch in changes:
            lines.append(f"  - {ch.action_type}: {ch.description}")

    return "\n".join(lines)
