from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Flag, FlaggedRange, Project, TimeseriesData
from app.services.qc_engine import get_clean_dataframe


async def _seed_dataset_with_flag(db_session: AsyncSession) -> tuple[Project, Dataset, DataColumn, Flag]:
    project = Project(name="Filtered Queries")
    db_session.add(project)
    await db_session.flush()

    dataset = Dataset(
        project_id=project.id,
        name="Mast B",
        source_type="mast",
        time_step_seconds=600,
        start_time=datetime(2025, 1, 1, 0, 0, tzinfo=UTC),
        end_time=datetime(2025, 1, 1, 0, 30, tzinfo=UTC),
    )
    db_session.add(dataset)
    await db_session.flush()

    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    temp_column = DataColumn(dataset_id=dataset.id, name="Temp_2m", measurement_type="temperature", height_m=2)
    db_session.add_all([speed_column, temp_column])
    await db_session.flush()

    base_time = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
    rows = [
        {"Speed_80m": 4.0, "Temp_2m": 5.0},
        {"Speed_80m": 3.0, "Temp_2m": 4.0},
        {"Speed_80m": 2.0, "Temp_2m": 3.0},
        {"Speed_80m": 1.0, "Temp_2m": 2.0},
    ]
    db_session.add_all(
        [
            TimeseriesData(dataset_id=dataset.id, timestamp=base_time + timedelta(minutes=index * 10), values_json=row)
            for index, row in enumerate(rows)
        ],
    )
    await db_session.flush()

    flag = Flag(dataset_id=dataset.id, name="Icing", color="#1f8f84")
    db_session.add(flag)
    await db_session.flush()

    db_session.add(
        FlaggedRange(
            flag_id=flag.id,
            start_time=datetime(2025, 1, 1, 0, 10, tzinfo=UTC),
            end_time=datetime(2025, 1, 1, 0, 20, tzinfo=UTC),
            applied_by="manual",
            column_ids=[speed_column.id],
        ),
    )
    await db_session.commit()
    return project, dataset, speed_column, flag


async def test_get_clean_dataframe_masks_flagged_values(db_session: AsyncSession) -> None:
    _, dataset, speed_column, flag = await _seed_dataset_with_flag(db_session)

    frame = await get_clean_dataframe(
        db_session,
        dataset.id,
        column_ids=[speed_column.id],
        exclude_flag_ids=[flag.id],
    )

    assert frame.loc["2025-01-01 00:00:00+00:00", "Speed_80m"] == 4.0
    assert frame.loc["2025-01-01 00:10:00+00:00", "Speed_80m"] != frame.loc["2025-01-01 00:10:00+00:00", "Speed_80m"]
    assert frame.loc["2025-01-01 00:20:00+00:00", "Speed_80m"] != frame.loc["2025-01-01 00:20:00+00:00", "Speed_80m"]
    assert frame.loc["2025-01-01 00:30:00+00:00", "Speed_80m"] == 1.0


async def test_timeseries_endpoint_accepts_exclude_flags(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, speed_column, flag = await _seed_dataset_with_flag(db_session)

    response = await client.get(
        f"/api/datasets/{dataset.id}/timeseries",
        params={"columns": str(speed_column.id), "exclude_flags": str(flag.id)},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["excluded_flag_ids"] == [str(flag.id)]
    assert payload["columns"][str(speed_column.id)]["values"] == [4.0, None, None, 1.0]
