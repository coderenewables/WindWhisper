from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Flag, FlaggedRange, Project, TimeseriesData


async def _seed_analysis_dataset(db_session: AsyncSession) -> tuple[Dataset, DataColumn, DataColumn, Flag]:
    project = Project(name="Analysis Site")
    db_session.add(project)
    await db_session.flush()

    dataset = Dataset(
        project_id=project.id,
        name="Rose Mast",
        source_type="mast",
        time_step_seconds=600,
        start_time=datetime(2025, 3, 1, 0, 0, tzinfo=UTC),
        end_time=datetime(2025, 3, 1, 0, 30, tzinfo=UTC),
    )
    db_session.add(dataset)
    await db_session.flush()

    direction_column = DataColumn(dataset_id=dataset.id, name="Dir_80m", measurement_type="direction", height_m=80)
    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    db_session.add_all([direction_column, speed_column])
    await db_session.flush()

    base_time = datetime(2025, 3, 1, 0, 0, tzinfo=UTC)
    rows = [
        {"Dir_80m": 350.0, "Speed_80m": 5.0},
        {"Dir_80m": 10.0, "Speed_80m": 7.0},
        {"Dir_80m": 95.0, "Speed_80m": 8.0},
        {"Dir_80m": 185.0, "Speed_80m": 9.0},
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
            column_ids=[direction_column.id, speed_column.id],
        ),
    )

    await db_session.commit()
    return dataset, direction_column, speed_column, exclusion_flag


async def test_wind_rose_endpoint_groups_sector_statistics(client: AsyncClient, db_session: AsyncSession) -> None:
    dataset, direction_column, speed_column, _ = await _seed_analysis_dataset(db_session)

    response = await client.post(
        f"/api/analysis/wind-rose/{dataset.id}",
        json={
            "direction_column_id": str(direction_column.id),
            "value_column_id": str(speed_column.id),
            "num_sectors": 12,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 4
    assert len(payload["sectors"]) == 12

    north_sector = next(sector for sector in payload["sectors"] if sector["direction"] == 0)
    east_sector = next(sector for sector in payload["sectors"] if sector["direction"] == 90)
    south_sector = next(sector for sector in payload["sectors"] if sector["direction"] == 180)

    assert north_sector["sample_count"] == 2
    assert round(north_sector["frequency"], 2) == 50.0
    assert round(north_sector["mean_value"], 2) == 6.0
    assert north_sector["speed_bins"][1]["count"] == 1
    assert north_sector["speed_bins"][2]["count"] == 1

    assert east_sector["sample_count"] == 1
    assert round(east_sector["mean_value"], 2) == 8.0
    assert round(south_sector["energy"], 2) == 729.0


async def test_wind_rose_endpoint_respects_flag_exclusions(client: AsyncClient, db_session: AsyncSession) -> None:
    dataset, direction_column, speed_column, exclusion_flag = await _seed_analysis_dataset(db_session)

    response = await client.post(
        f"/api/analysis/wind-rose/{dataset.id}",
        json={
            "direction_column_id": str(direction_column.id),
            "value_column_id": str(speed_column.id),
            "num_sectors": 12,
            "exclude_flags": [str(exclusion_flag.id)],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 3

    south_sector = next(sector for sector in payload["sectors"] if sector["direction"] == 180)
    assert south_sector["sample_count"] == 0
    assert south_sector["mean_value"] is None


async def test_histogram_endpoint_returns_bins_and_stats(client: AsyncClient, db_session: AsyncSession) -> None:
    dataset, _, speed_column, exclusion_flag = await _seed_analysis_dataset(db_session)

    response = await client.post(
        f"/api/analysis/histogram/{dataset.id}",
        json={
            "column_id": str(speed_column.id),
            "num_bins": 4,
            "min_val": 5,
            "max_val": 9,
            "exclude_flags": [str(exclusion_flag.id)],
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["column_id"] == str(speed_column.id)
    assert payload["stats"]["count"] == 3
    assert round(payload["stats"]["mean"], 2) == 6.67
    assert round(payload["stats"]["median"], 2) == 7.0
    assert round(payload["stats"]["data_recovery_pct"], 2) == 75.0
    assert len(payload["bins"]) == 4
    assert [bin_entry["count"] for bin_entry in payload["bins"]] == [1, 0, 1, 1]


async def test_weibull_endpoint_returns_fit_parameters_and_curve(client: AsyncClient, db_session: AsyncSession) -> None:
    project = Project(name="Weibull Site")
    db_session.add(project)
    await db_session.flush()

    rng = np.random.default_rng(42)
    sampled_speeds = rng.weibull(2.0, 360) * 7.0
    start_time = datetime(2025, 4, 1, 0, 0, tzinfo=UTC)

    dataset = Dataset(
        project_id=project.id,
        name="Weibull Mast",
        source_type="mast",
        time_step_seconds=600,
        start_time=start_time,
        end_time=start_time + timedelta(minutes=(len(sampled_speeds) - 1) * 10),
    )
    db_session.add(dataset)
    await db_session.flush()

    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    db_session.add(speed_column)
    await db_session.flush()

    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=dataset.id,
                timestamp=start_time + timedelta(minutes=index * 10),
                values_json={"Speed_80m": float(speed)},
            )
            for index, speed in enumerate(sampled_speeds)
        ],
    )
    await db_session.commit()

    response = await client.post(
        f"/api/analysis/weibull/{dataset.id}",
        json={
            "column_id": str(speed_column.id),
            "num_bins": 24,
            "method": "mle",
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["column_id"] == str(speed_column.id)
    assert payload["fit"]["method"] == "mle"
    assert abs(payload["fit"]["k"] - 2.0) < 0.35
    assert abs(payload["fit"]["A"] - 7.0) < 0.75
    assert payload["fit"]["r_squared"] > 0.94
    assert payload["fit"]["ks_stat"] < 0.08
    assert len(payload["curve_points"]) >= 96
    assert max(point["frequency_pct"] for point in payload["curve_points"]) > 0