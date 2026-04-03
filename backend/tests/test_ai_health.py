"""Tests for project health assessment."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AnalysisResult, DataColumn, Dataset, Flag, Project, TimeseriesData


# ── Fixtures ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def project(db_session: AsyncSession) -> Project:
    p = Project(name="Health Test")
    db_session.add(p)
    await db_session.flush()
    return p


@pytest_asyncio.fixture
async def good_dataset(db_session: AsyncSession, project: Project) -> Dataset:
    """A dataset with time range but no timeseries records (recovery cannot be computed)."""
    ds = Dataset(
        project_id=project.id, name="Good DS", source_type="met_tower",
        start_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
        end_time=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    db_session.add(ds)
    await db_session.flush()
    return ds


@pytest_asyncio.fixture
async def low_recovery_dataset(db_session: AsyncSession, project: Project) -> Dataset:
    """A dataset with time range but no timeseries records."""
    ds = Dataset(
        project_id=project.id, name="Low Recovery DS", source_type="met_tower",
        start_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
        end_time=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    db_session.add(ds)
    await db_session.flush()
    return ds


# ── Tests ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_no_datasets(db_session, project):
    from app.ai.health import compute_health
    result = await compute_health(db_session, project.id)
    assert result["health_score"] == 0
    assert any(i["severity"] == "critical" for i in result["issues"])


@pytest.mark.asyncio
async def test_health_good_dataset_no_flags_no_analyses(db_session, project, good_dataset):
    from app.ai.health import compute_health
    result = await compute_health(db_session, project.id)
    # No timeseries records so no recovery penalty, no QC flags → -10, missing 4 analyses → -20 = 70
    assert result["health_score"] == 70.0
    assert any("QC flags" in i["message"] for i in result["issues"])
    assert any("Missing analyses" in i["message"] for i in result["issues"])


@pytest.mark.asyncio
async def test_health_low_recovery_penalty(db_session, project, low_recovery_dataset):
    from app.ai.health import compute_health
    result = await compute_health(db_session, project.id)
    # No timeseries records → no recovery penalty, no flags → -10, missing 4 analyses → -20 = 70
    assert result["health_score"] == 70.0


@pytest.mark.asyncio
async def test_health_with_flags(db_session, project, good_dataset):
    from app.ai.health import compute_health
    flag = Flag(dataset_id=good_dataset.id, name="Icing", color="#0000FF")
    db_session.add(flag)
    await db_session.flush()

    result = await compute_health(db_session, project.id)
    # Flags present → no -10 penalty, but still missing 4 analyses → -20 = 80
    assert result["health_score"] == 80.0
    # Should NOT warn about missing QC flags
    assert not any("No QC flags" in i["message"] for i in result["issues"])


@pytest.mark.asyncio
async def test_health_with_all_analyses(db_session, project, good_dataset):
    from app.ai.health import compute_health
    for atype in ["weibull", "shear", "turbulence", "extreme_wind"]:
        ar = AnalysisResult(dataset_id=good_dataset.id, analysis_type=atype, parameters={}, results={})
        db_session.add(ar)
    flag = Flag(dataset_id=good_dataset.id, name="Icing", color="#0000FF")
    db_session.add(flag)
    await db_session.flush()

    result = await compute_health(db_session, project.id)
    assert result["health_score"] == 100.0
    assert len(result["issues"]) == 0


@pytest.mark.asyncio
async def test_health_returns_metrics(db_session, project, good_dataset):
    from app.ai.health import compute_health
    result = await compute_health(db_session, project.id)
    assert "metrics" in result
    assert result["metrics"]["dataset_count"] == 1


@pytest.mark.asyncio
async def test_health_persists_snapshot(db_session, project, good_dataset):
    from app.ai.health import compute_health
    from app.models.ai import ProjectHealthSnapshot
    from sqlalchemy import select

    await compute_health(db_session, project.id)
    snap = (await db_session.execute(
        select(ProjectHealthSnapshot).where(ProjectHealthSnapshot.project_id == project.id)
    )).scalars().first()
    assert snap is not None
    assert snap.health_score is not None


@pytest.mark.asyncio
async def test_health_score_clamped(db_session, project, low_recovery_dataset):
    from app.ai.health import compute_health
    result = await compute_health(db_session, project.id)
    assert 0 <= result["health_score"] <= 100


@pytest.mark.asyncio
async def test_health_summary_is_string(db_session, project, good_dataset):
    from app.ai.health import compute_health
    result = await compute_health(db_session, project.id)
    assert isinstance(result["summary"], str)
    assert len(result["summary"]) > 0
