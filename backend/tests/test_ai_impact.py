"""Tests for downstream impact estimation."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Flag, FlagRule, FlaggedRange, Project
from app.models.ai import AiAction


# ── Fixtures ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def project(db_session: AsyncSession) -> Project:
    p = Project(name="Impact Test")
    db_session.add(p)
    await db_session.flush()
    return p


@pytest_asyncio.fixture
async def dataset(db_session: AsyncSession, project: Project) -> Dataset:
    ds = Dataset(
        project_id=project.id, name="Impact DS", source_type="met_tower",
        start_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
        end_time=datetime(2024, 7, 1, tzinfo=timezone.utc),
    )
    db_session.add(ds)
    await db_session.flush()
    return ds


# ── Tests ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_estimate_impact_unknown_type(db_session, project, dataset):
    from app.ai.impact import estimate_impact
    action = AiAction(
        project_id=project.id, action_type="unknown_type",
        title="Unknown", payload={"dataset_id": str(dataset.id)}, status="pending",
    )
    db_session.add(action)
    await db_session.flush()

    result = await estimate_impact(db_session, project.id, action)
    assert isinstance(result, dict)
    # Should not raise — returns generic or low-confidence result


@pytest.mark.asyncio
async def test_estimate_impact_unknown_type_with_invalid_dataset_id(db_session, project):
    from app.ai.impact import estimate_impact
    action = AiAction(
        project_id=project.id, action_type="unknown_type",
        title="Unknown", payload={"dataset_id": "demo-dataset-1"}, status="pending",
    )
    db_session.add(action)
    await db_session.flush()

    result = await estimate_impact(db_session, project.id, action)
    assert isinstance(result, dict)
    assert result.get("confidence") == "low"
    assert "error" in result


@pytest.mark.asyncio
async def test_estimate_impact_qc_flag_with_rules(db_session, project, dataset):
    from app.ai.impact import estimate_impact
    action = AiAction(
        project_id=project.id, action_type="create_qc_flag",
        title="Create Icing Flag", status="pending",
        payload={
            "dataset_id": str(dataset.id),
            "flag_name": "Icing",
            "rules": [{"column_name": "Temp_2m", "operator": "<", "value": 2}],
        },
    )
    db_session.add(action)
    await db_session.flush()

    result = await estimate_impact(db_session, project.id, action)
    assert isinstance(result, dict)
    # Even without data, should return a structured result
    assert "affected_metrics" in result or "error" in result or "confidence" in result


@pytest.mark.asyncio
async def test_estimate_impact_apply_flag_rules(db_session, project, dataset):
    from app.ai.impact import estimate_impact
    flag = Flag(dataset_id=dataset.id, name="Test Flag", color="#FF0000")
    db_session.add(flag)
    await db_session.flush()

    action = AiAction(
        project_id=project.id, action_type="apply_flag_rules",
        title="Apply Flag Rules", status="pending",
        payload={"dataset_id": str(dataset.id), "flag_id": str(flag.id)},
    )
    db_session.add(action)
    await db_session.flush()

    result = await estimate_impact(db_session, project.id, action)
    assert isinstance(result, dict)


@pytest.mark.asyncio
async def test_estimate_impact_shear(db_session, project, dataset):
    from app.ai.impact import estimate_impact
    action = AiAction(
        project_id=project.id, action_type="run_shear_analysis",
        title="Shear Analysis", status="pending",
        payload={"dataset_id": str(dataset.id), "target_height": 120},
    )
    db_session.add(action)
    await db_session.flush()

    result = await estimate_impact(db_session, project.id, action)
    assert isinstance(result, dict)


@pytest.mark.asyncio
async def test_estimate_impact_mcp(db_session, project, dataset):
    from app.ai.impact import estimate_impact
    action = AiAction(
        project_id=project.id, action_type="run_mcp_comparison",
        title="MCP Comparison", status="pending",
        payload={
            "site_dataset_id": str(dataset.id),
            "site_column_id": str(uuid4()),
            "ref_dataset_id": str(dataset.id),
            "ref_column_id": str(uuid4()),
        },
    )
    db_session.add(action)
    await db_session.flush()

    result = await estimate_impact(db_session, project.id, action)
    assert isinstance(result, dict)


@pytest.mark.asyncio
async def test_estimate_impact_handles_exceptions(db_session, project, dataset):
    """Impact estimation should not raise even on bad data — returns low confidence result."""
    from app.ai.impact import estimate_impact
    action = AiAction(
        project_id=project.id, action_type="create_qc_flag",
        title="Bad QC", status="pending",
        payload={"dataset_id": str(uuid4()), "flag_name": "Bad", "rules": []},  # nonexistent dataset
    )
    db_session.add(action)
    await db_session.flush()

    result = await estimate_impact(db_session, project.id, action)
    assert isinstance(result, dict)
    assert result.get("confidence") in ("low", None) or "error" in result
