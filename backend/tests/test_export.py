from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Flag, FlaggedRange, Project, TimeseriesData


async def _seed_export_dataset(db_session: AsyncSession) -> tuple[Dataset, DataColumn, DataColumn, DataColumn, Flag]:
    project = Project(
        name="Export Site",
        description="Export validation project",
        latitude=11.245,
        longitude=76.912,
        elevation=1240.0,
    )
    db_session.add(project)
    await db_session.flush()

    base_time = datetime(2025, 6, 1, 0, 0, tzinfo=UTC)
    dataset = Dataset(
        project_id=project.id,
        name="Export Mast",
        source_type="mast",
        file_name="export_mast.csv",
        time_step_seconds=600,
        start_time=base_time,
        end_time=base_time + timedelta(minutes=30),
        metadata_json={"site_code": "EXP-001", "campaign": "validation"},
    )
    db_session.add(dataset)
    await db_session.flush()

    direction_column = DataColumn(dataset_id=dataset.id, name="Dir_80m", measurement_type="direction", unit="deg", height_m=80)
    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", unit="m/s", height_m=80)
    temperature_column = DataColumn(dataset_id=dataset.id, name="Temp_2m", measurement_type="temperature", unit="C", height_m=2)
    db_session.add_all([direction_column, speed_column, temperature_column])
    await db_session.flush()

    rows = [
        {"Dir_80m": 350.0, "Speed_80m": 5.0, "Temp_2m": 14.0},
        {"Dir_80m": 10.0, "Speed_80m": 7.0, "Temp_2m": 14.5},
        {"Dir_80m": 95.0, "Speed_80m": 8.0, "Temp_2m": 15.0},
        {"Dir_80m": 185.0, "Speed_80m": 9.0, "Temp_2m": 15.5},
    ]
    db_session.add_all(
        [
            TimeseriesData(dataset_id=dataset.id, timestamp=base_time + timedelta(minutes=index * 10), values_json=row)
            for index, row in enumerate(rows)
        ],
    )

    exclusion_flag = Flag(dataset_id=dataset.id, name="Exclude south", color="#ef4444")
    db_session.add(exclusion_flag)
    await db_session.flush()
    db_session.add(
        FlaggedRange(
            flag_id=exclusion_flag.id,
            start_time=base_time + timedelta(minutes=30),
            end_time=base_time + timedelta(minutes=30),
            applied_by="manual",
            column_ids=[direction_column.id, speed_column.id, temperature_column.id],
        ),
    )

    await db_session.commit()
    return dataset, direction_column, speed_column, temperature_column, exclusion_flag


async def test_csv_export_returns_clean_csv_with_resample_and_flag_exclusions(client: AsyncClient, db_session: AsyncSession) -> None:
    dataset, _, speed_column, _, exclusion_flag = await _seed_export_dataset(db_session)

    response = await client.post(
        f"/api/export/csv/{dataset.id}",
        json={
            "column_ids": [str(speed_column.id)],
            "exclude_flags": [str(exclusion_flag.id)],
            "resample": "20min",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment;" in response.headers["content-disposition"]

    lines = response.text.strip().splitlines()
    assert lines[0] == "timestamp,Speed_80m"
    assert len(lines) == 3
    assert ",6.0" in lines[1]
    assert lines[2].endswith(",8.0")


async def test_wasp_tab_export_returns_sector_frequency_table(client: AsyncClient, db_session: AsyncSession) -> None:
    dataset, direction_column, speed_column, _, _ = await _seed_export_dataset(db_session)

    response = await client.post(
        f"/api/export/wasp-tab/{dataset.id}",
        json={
            "speed_column_id": str(speed_column.id),
            "direction_column_id": str(direction_column.id),
            "num_sectors": 12,
            "speed_bin_width": 1.0,
        },
    )

    assert response.status_code == 200
    lines = response.text.strip().splitlines()
    assert lines[0] == "Station: Export Mast"
    assert lines[2] == "12 9"
    assert len(lines) == 15

    north_sector = [float(value) for value in lines[3].split()]
    east_sector = [float(value) for value in lines[6].split()]
    south_sector = [float(value) for value in lines[9].split()]

    assert round(north_sector[0], 2) == 50.0
    assert round(sum(north_sector[1:-2]), 2) == 50.0
    assert round(east_sector[0], 2) == 25.0
    assert round(south_sector[0], 2) == 25.0


async def test_iea_json_export_returns_project_dataset_and_timeseries_payload(client: AsyncClient, db_session: AsyncSession) -> None:
    dataset, direction_column, speed_column, _, exclusion_flag = await _seed_export_dataset(db_session)

    response = await client.post(
        f"/api/export/iea-json/{dataset.id}",
        json={
            "column_ids": [str(direction_column.id), str(speed_column.id)],
            "exclude_flags": [str(exclusion_flag.id)],
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")

    payload = json.loads(response.text)
    assert payload["schema"] == "iea-task-43-wra-data-model"
    assert payload["project"]["name"] == "Export Site"
    assert payload["dataset"]["name"] == "Export Mast"
    assert payload["dataset"]["metadata"]["site_code"] == "EXP-001"
    assert [column["name"] for column in payload["measurement_configuration"]["columns"]] == ["Dir_80m", "Speed_80m"]
    assert len(payload["time_series"]) == 4
    assert payload["time_series"][-1]["values"]["Dir_80m"] is None
    assert payload["time_series"][-1]["values"]["Speed_80m"] is None


async def test_openwind_export_returns_date_time_csv_layout(client: AsyncClient, db_session: AsyncSession) -> None:
    dataset, direction_column, speed_column, _, exclusion_flag = await _seed_export_dataset(db_session)

    response = await client.post(
        f"/api/export/openwind/{dataset.id}",
        json={
            "column_ids": [str(direction_column.id), str(speed_column.id)],
            "exclude_flags": [str(exclusion_flag.id)],
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"].endswith('openwind.csv"')

    lines = response.text.strip().splitlines()
    assert lines[0] == "Date,Time,Dir_80m,Speed_80m"
    assert lines[1] == "2025-06-01,00:00:00,350.0,5.0"
    assert lines[-1] == "2025-06-01,00:30:00,,"