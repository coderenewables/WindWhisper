from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Project, TimeseriesData
from app.services.demo_seed import (
    DEMO_ERA5_DATASET_NAME,
    DEMO_MEASUREMENT_DATASET_NAME,
    DEMO_MERRA_DATASET_NAME,
    DEMO_PROJECT_NAME,
    ensure_seeded_demo_workspace,
)


async def test_ensure_seeded_demo_workspace_creates_idempotent_demo_content(
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.services.demo_seed.DEMO_MEASUREMENT_ROW_LIMIT", 144)
    monkeypatch.setattr("app.services.demo_seed.DEMO_REFERENCE_ROW_LIMIT", 168)

    project = await ensure_seeded_demo_workspace(db_session)
    project_again = await ensure_seeded_demo_workspace(db_session)

    assert project.id == project_again.id
    assert project.name == DEMO_PROJECT_NAME

    projects = (await db_session.execute(select(Project))).scalars().all()
    assert len(projects) == 1

    datasets = (
        await db_session.execute(
            select(Dataset)
            .where(Dataset.project_id == project.id)
            .order_by(Dataset.name.asc()),
        )
    ).scalars().all()
    assert {dataset.name for dataset in datasets} == {
        DEMO_ERA5_DATASET_NAME,
        DEMO_MEASUREMENT_DATASET_NAME,
        DEMO_MERRA_DATASET_NAME,
    }

    dataset_ids = [dataset.id for dataset in datasets]
    column_count = await db_session.scalar(select(func.count(DataColumn.id)).where(DataColumn.dataset_id.in_(dataset_ids)))
    row_count = await db_session.scalar(select(func.count(TimeseriesData.id)).where(TimeseriesData.dataset_id.in_(dataset_ids)))

    assert (column_count or 0) >= 12
    assert (row_count or 0) == 144 + 168 + 168

    source_types = {dataset.name: dataset.source_type for dataset in datasets}
    assert source_types[DEMO_MEASUREMENT_DATASET_NAME] == "file_upload"
    assert source_types[DEMO_ERA5_DATASET_NAME] == "reanalysis"
    assert source_types[DEMO_MERRA_DATASET_NAME] == "reanalysis"