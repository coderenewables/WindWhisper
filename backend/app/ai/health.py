"""Project health assessment – compute a composite health score."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import ProjectHealthSnapshot
from app.models.analysis_result import AnalysisResult
from app.models.dataset import DataColumn, Dataset
from app.models.flag import Flag
from app.models.timeseries import TimeseriesData


async def compute_health(db: AsyncSession, project_id: UUID) -> dict:
    """Compute project health score (0-100) and return issues."""
    issues: list[dict] = []
    score = 100.0

    # Check datasets exist
    datasets = (await db.execute(select(Dataset).where(Dataset.project_id == project_id))).scalars().all()
    if not datasets:
        return {"health_score": 0, "summary": "No datasets imported yet.", "issues": [{"severity": "critical", "category": "data", "message": "No datasets", "suggested_action": "Import meteorological data"}], "metrics": {}}

    # Data recovery check
    for ds in datasets:
        row_count = await db.scalar(
            select(func.count(TimeseriesData.id)).where(TimeseriesData.dataset_id == ds.id)
        ) or 0
        if ds.start_time and ds.end_time and row_count:
            expected = (ds.end_time - ds.start_time).total_seconds() / 600
            recovery = row_count / expected * 100 if expected > 0 else 0
            if recovery < 80:
                score -= 15
                issues.append({"severity": "warning", "category": "data_recovery", "message": f"{ds.name}: {recovery:.0f}% data recovery", "suggested_action": "Consider data reconstruction or gap-filling"})
            elif recovery < 90:
                score -= 5
                issues.append({"severity": "info", "category": "data_recovery", "message": f"{ds.name}: {recovery:.0f}% data recovery", "suggested_action": "Review data gaps"})

    # QC flags check
    flag_count = (await db.execute(select(func.count()).select_from(Flag).join(Dataset).where(Dataset.project_id == project_id))).scalar() or 0
    if flag_count == 0:
        score -= 10
        issues.append({"severity": "warning", "category": "qc", "message": "No QC flags defined", "suggested_action": "Run QC checks on your datasets"})

    # Analysis completeness
    analysis_types = (await db.execute(
        select(AnalysisResult.analysis_type).join(Dataset).where(Dataset.project_id == project_id).distinct()
    )).scalars().all()
    expected_analyses = {"weibull", "shear", "turbulence", "extreme_wind"}
    missing = expected_analyses - set(analysis_types)
    if missing:
        score -= 5 * len(missing)
        issues.append({"severity": "info", "category": "analysis", "message": f"Missing analyses: {', '.join(missing)}", "suggested_action": "Run the missing analysis types"})

    score = max(0, min(100, score))

    # Persist snapshot
    snapshot = ProjectHealthSnapshot(
        project_id=project_id,
        health_score=score,
        summary=f"Health score: {score:.0f}/100 with {len(issues)} issue(s)",
        issues=issues,
        metrics={"dataset_count": len(datasets), "flag_count": flag_count, "analysis_types": list(analysis_types)},
    )
    db.add(snapshot)
    await db.flush()

    return {"health_score": score, "summary": snapshot.summary, "issues": issues, "metrics": snapshot.metrics, "id": str(snapshot.id), "created_at": str(snapshot.created_at)}
