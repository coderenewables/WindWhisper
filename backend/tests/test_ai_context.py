"""Tests for project context assembly."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Flag, Project, AnalysisResult, ChangeLog


# ── Fixtures ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def project(db_session: AsyncSession) -> Project:
    p = Project(name="Test Wind Farm", latitude=55.0, longitude=-3.0, elevation=200)
    db_session.add(p)
    await db_session.flush()
    return p


@pytest_asyncio.fixture
async def dataset_with_columns(db_session: AsyncSession, project: Project) -> Dataset:
    ds = Dataset(
        project_id=project.id,
        name="Met Mast Alpha",
        source_type="met_tower",
        start_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
        end_time=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    db_session.add(ds)
    await db_session.flush()

    cols = [
        DataColumn(dataset_id=ds.id, name="Speed_80m", measurement_type="speed", height_m=80, unit="m/s"),
        DataColumn(dataset_id=ds.id, name="Dir_80m", measurement_type="direction", height_m=80, unit="deg"),
        DataColumn(dataset_id=ds.id, name="Temp_2m", measurement_type="temperature", height_m=2, unit="°C"),
    ]
    db_session.add_all(cols)
    await db_session.flush()
    return ds


# ── Tests ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_context_empty_project(db_session: AsyncSession, project: Project):
    from app.ai.context import assemble_project_context
    ctx = await assemble_project_context(db_session, project.id)
    assert "Test Wind Farm" in ctx
    assert "Datasets: 0" in ctx


@pytest.mark.asyncio
async def test_context_nonexistent_project(db_session: AsyncSession):
    import uuid
    from app.ai.context import assemble_project_context
    ctx = await assemble_project_context(db_session, uuid.uuid4())
    assert "not found" in ctx.lower()


@pytest.mark.asyncio
async def test_context_includes_dataset(db_session: AsyncSession, project: Project, dataset_with_columns: Dataset):
    from app.ai.context import assemble_project_context
    ctx = await assemble_project_context(db_session, project.id)
    assert "Met Mast Alpha" in ctx
    assert "Datasets: 1" in ctx
    assert "Speed_80m" in ctx
    assert "speed" in ctx.lower()


@pytest.mark.asyncio
async def test_context_includes_location(db_session: AsyncSession, project: Project):
    from app.ai.context import assemble_project_context
    ctx = await assemble_project_context(db_session, project.id)
    assert "55.0000" in ctx
    assert "-3.0000" in ctx
    assert "200" in ctx


@pytest.mark.asyncio
async def test_context_includes_qc_flags(db_session: AsyncSession, project: Project, dataset_with_columns: Dataset):
    from app.ai.context import assemble_project_context
    flag = Flag(dataset_id=dataset_with_columns.id, name="Icing", color="#0000FF")
    db_session.add(flag)
    await db_session.flush()

    ctx = await assemble_project_context(db_session, project.id)
    assert "QC Flags" in ctx


@pytest.mark.asyncio
async def test_context_includes_analyses(db_session: AsyncSession, project: Project, dataset_with_columns: Dataset):
    from app.ai.context import assemble_project_context
    ar = AnalysisResult(
        dataset_id=dataset_with_columns.id,
        analysis_type="weibull",
        parameters={"column": "Speed_80m"},
        results={"k": 2.1, "A": 7.5},
    )
    db_session.add(ar)
    await db_session.flush()

    ctx = await assemble_project_context(db_session, project.id)
    assert "weibull" in ctx.lower()


@pytest.mark.asyncio
async def test_context_includes_recent_changes(db_session: AsyncSession, project: Project, dataset_with_columns: Dataset):
    from app.ai.context import assemble_project_context
    cl = ChangeLog(
        dataset_id=dataset_with_columns.id,
        action_type="import",
        description="Imported met tower data",
    )
    db_session.add(cl)
    await db_session.flush()

    ctx = await assemble_project_context(db_session, project.id)
    assert "Recent changes" in ctx
    assert "Imported" in ctx


@pytest.mark.asyncio
async def test_context_returns_string(db_session: AsyncSession, project: Project, dataset_with_columns: Dataset):
    from app.ai.context import assemble_project_context
    ctx = await assemble_project_context(db_session, project.id)
    assert isinstance(ctx, str)
    assert len(ctx) > 50
