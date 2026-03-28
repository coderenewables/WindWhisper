from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
from httpx import AsyncClient
from sqlalchemy import select
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


async def test_profiles_endpoint_returns_diurnal_monthly_heatmap_and_yearly_overlays(client: AsyncClient, db_session: AsyncSession) -> None:
    project = Project(name="Profiles Site")
    db_session.add(project)
    await db_session.flush()

    start_time = datetime(2024, 1, 15, 0, 0, tzinfo=UTC)
    dataset = Dataset(
        project_id=project.id,
        name="Profiles Mast",
        source_type="mast",
        time_step_seconds=3600,
        start_time=start_time,
        end_time=datetime(2025, 2, 15, 23, 0, tzinfo=UTC),
    )
    db_session.add(dataset)
    await db_session.flush()

    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    db_session.add(speed_column)
    await db_session.flush()

    rows: list[TimeseriesData] = []
    timestamps = [
        datetime(2024, 1, 15, 0, 0, tzinfo=UTC),
        datetime(2024, 1, 15, 12, 0, tzinfo=UTC),
        datetime(2024, 2, 15, 0, 0, tzinfo=UTC),
        datetime(2024, 2, 15, 12, 0, tzinfo=UTC),
        datetime(2025, 1, 15, 0, 0, tzinfo=UTC),
        datetime(2025, 1, 15, 12, 0, tzinfo=UTC),
        datetime(2025, 2, 15, 0, 0, tzinfo=UTC),
        datetime(2025, 2, 15, 12, 0, tzinfo=UTC),
    ]
    values = [6.0, 8.0, 7.0, 9.0, 10.0, 12.0, 11.0, 13.0]
    rows.extend(
        TimeseriesData(dataset_id=dataset.id, timestamp=timestamp, values_json={"Speed_80m": value})
        for timestamp, value in zip(timestamps, values, strict=False)
    )
    db_session.add_all(rows)
    await db_session.commit()

    response = await client.post(
        f"/api/analysis/profiles/{dataset.id}",
        json={
            "column_id": str(speed_column.id),
            "include_yearly_overlays": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset_id"] == str(dataset.id)
    assert payload["column_id"] == str(speed_column.id)
    assert payload["years_available"] == [2024, 2025]
    assert len(payload["diurnal"]) == 24
    assert len(payload["monthly"]) == 12
    assert len(payload["heatmap"]) == 288
    assert len(payload["diurnal_by_year"]) == 2
    assert len(payload["monthly_by_year"]) == 2

    midnight = next(point for point in payload["diurnal"] if point["hour"] == 0)
    noon = next(point for point in payload["diurnal"] if point["hour"] == 12)
    january = next(point for point in payload["monthly"] if point["month"] == 1)
    february = next(point for point in payload["monthly"] if point["month"] == 2)
    jan_midnight = next(cell for cell in payload["heatmap"] if cell["month"] == 1 and cell["hour"] == 0)

    assert midnight["sample_count"] == 4
    assert midnight["mean_value"] == 8.5
    assert noon["sample_count"] == 4
    assert noon["mean_value"] == 10.5
    assert january["sample_count"] == 4
    assert january["mean_value"] == 9.0
    assert february["sample_count"] == 4
    assert february["mean_value"] == 10.0
    assert jan_midnight["mean_value"] == 8.0


async def test_profiles_endpoint_respects_flag_exclusions(client: AsyncClient, db_session: AsyncSession) -> None:
    dataset, _, speed_column, exclusion_flag = await _seed_analysis_dataset(db_session)

    response = await client.post(
        f"/api/analysis/profiles/{dataset.id}",
        json={
            "column_id": str(speed_column.id),
            "exclude_flags": [str(exclusion_flag.id)],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    south_hour = next(point for point in payload["diurnal"] if point["hour"] == 0)
    assert south_hour["sample_count"] == 3
    assert round(south_hour["mean_value"], 2) == 6.67

async def test_scatter_endpoint_returns_paired_points_and_applies_flag_exclusions(client: AsyncClient, db_session: AsyncSession) -> None:
    dataset, direction_column, speed_column, exclusion_flag = await _seed_analysis_dataset(db_session)

    temperature_column = DataColumn(dataset_id=dataset.id, name="Temp_2m", measurement_type="temperature", height_m=2)
    db_session.add(temperature_column)
    await db_session.flush()

    result = await db_session.execute(
        select(TimeseriesData).where(TimeseriesData.dataset_id == dataset.id).order_by(TimeseriesData.timestamp.asc())
    )
    rows = result.scalars().all()
    temperatures = [6.0, 7.0, 8.0, 9.0]
    for row, temperature in zip(rows, temperatures):
        row.values_json = {**row.values_json, "Temp_2m": temperature}
    await db_session.commit()

    response = await client.post(
        f"/api/analysis/scatter/{dataset.id}",
        json={
            "x_column_id": str(direction_column.id),
            "y_column_id": str(speed_column.id),
            "color_column_id": str(temperature_column.id),
            "exclude_flags": [str(exclusion_flag.id)],
            "max_points": 500,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset_id"] == str(dataset.id)
    assert payload["x_column_id"] == str(direction_column.id)
    assert payload["y_column_id"] == str(speed_column.id)
    assert payload["color_column_id"] == str(temperature_column.id)
    assert payload["total_count"] == 3
    assert payload["sample_count"] == 3
    assert payload["is_downsampled"] is False
    assert payload["points"] == [
        {"x": 350.0, "y": 5.0, "color": 6.0},
        {"x": 10.0, "y": 7.0, "color": 7.0},
        {"x": 95.0, "y": 8.0, "color": 8.0},
    ]


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


async def test_shear_and_extrapolation_endpoints_return_profiles_and_create_column(client: AsyncClient, db_session: AsyncSession) -> None:
    project = Project(name="Shear Site")
    db_session.add(project)
    await db_session.flush()

    start_time = datetime(2025, 5, 1, 0, 0, tzinfo=UTC)
    dataset = Dataset(
        project_id=project.id,
        name="Shear Mast",
        source_type="mast",
        time_step_seconds=600,
        start_time=start_time,
        end_time=start_time + timedelta(minutes=30),
    )
    db_session.add(dataset)
    await db_session.flush()

    direction_column = DataColumn(dataset_id=dataset.id, name="Dir_80m", measurement_type="direction", height_m=80)
    speed_60m = DataColumn(dataset_id=dataset.id, name="Speed_60m", measurement_type="speed", height_m=60)
    speed_80m = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    db_session.add_all([direction_column, speed_60m, speed_80m])
    await db_session.flush()

    alpha = 0.2
    base_speeds = np.array([6.0, 7.5, 9.0, 10.5], dtype=float)
    speeds_60m = base_speeds
    speeds_80m = base_speeds * np.power(80.0 / 60.0, alpha)
    directions = [0.0, 90.0, 180.0, 270.0]

    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=dataset.id,
                timestamp=start_time + timedelta(minutes=index * 10),
                values_json={
                    "Dir_80m": directions[index],
                    "Speed_60m": float(speeds_60m[index]),
                    "Speed_80m": float(speeds_80m[index]),
                },
            )
            for index in range(4)
        ],
    )
    await db_session.commit()

    shear_response = await client.post(
        f"/api/analysis/shear/{dataset.id}",
        json={
            "direction_column_id": str(direction_column.id),
            "target_height": 100,
            "method": "power",
        },
    )

    assert shear_response.status_code == 200
    shear_payload = shear_response.json()
    assert shear_payload["method"] == "power"
    assert len(shear_payload["pair_stats"]) == 1
    assert abs(shear_payload["pair_stats"][0]["mean_value"] - alpha) < 1e-6
    assert len(shear_payload["direction_bins"]) == 12
    assert len(shear_payload["time_of_day"]) == 24
    assert shear_payload["target_height"] == 100
    assert shear_payload["target_mean_speed"] > shear_payload["profile_points"][1]["mean_speed"]

    extrapolate_response = await client.post(
        f"/api/analysis/extrapolate/{dataset.id}",
        json={
            "target_height": 100,
            "method": "power",
            "create_column": True,
            "column_name": "Speed_100m_power",
        },
    )

    assert extrapolate_response.status_code == 200
    extrapolate_payload = extrapolate_response.json()
    assert extrapolate_payload["created_column"]["name"] == "Speed_100m_power"
    assert extrapolate_payload["summary"]["count"] == 4
    assert len(extrapolate_payload["values"]) == 4
    created_column_id = extrapolate_payload["created_column"]["id"]

    history_response = await client.get(f"/api/datasets/{dataset.id}/history")
    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert history_payload["total"] == 1
    assert history_payload["changes"][0]["action_type"] == "column_added"
    assert history_payload["changes"][0]["before_state"]["created_column"]["id"] == created_column_id

    refreshed_dataset = await db_session.get(Dataset, dataset.id)
    assert refreshed_dataset is not None
    result = await db_session.execute(
        select(TimeseriesData).where(TimeseriesData.dataset_id == dataset.id).order_by(TimeseriesData.timestamp.asc())
    )
    rows = result.scalars().all()
    assert all("Speed_100m_power" in row.values_json for row in rows)

    undo_response = await client.post(f"/api/datasets/{dataset.id}/undo")
    assert undo_response.status_code == 200
    undo_payload = undo_response.json()
    assert undo_payload["undone_change"]["action_type"] == "column_added"

    dataset_after_undo = await client.get(f"/api/datasets/{dataset.id}")
    assert dataset_after_undo.status_code == 200
    assert all(column["id"] != created_column_id for column in dataset_after_undo.json()["columns"])

    result_after_undo = await db_session.execute(
        select(TimeseriesData).where(TimeseriesData.dataset_id == dataset.id).order_by(TimeseriesData.timestamp.asc())
    )
    rows_after_undo = result_after_undo.scalars().all()
    assert all("Speed_100m_power" not in row.values_json for row in rows_after_undo)

    history_after_undo = await client.get(f"/api/datasets/{dataset.id}/history")
    assert history_after_undo.status_code == 200
    assert history_after_undo.json()["total"] == 0


async def test_turbulence_endpoint_returns_speed_bins_direction_bins_and_summary(client: AsyncClient, db_session: AsyncSession) -> None:
    project = Project(name="TI Site")
    db_session.add(project)
    await db_session.flush()

    start_time = datetime(2025, 6, 1, 0, 0, tzinfo=UTC)
    dataset = Dataset(
        project_id=project.id,
        name="TI Mast",
        source_type="mast",
        time_step_seconds=600,
        start_time=start_time,
        end_time=start_time + timedelta(minutes=50),
    )
    db_session.add(dataset)
    await db_session.flush()

    direction_column = DataColumn(dataset_id=dataset.id, name="Dir_80m", measurement_type="direction", height_m=80)
    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    speed_sd_column = DataColumn(dataset_id=dataset.id, name="Speed_SD_80m", measurement_type="speed_sd", height_m=80)
    db_session.add_all([direction_column, speed_column, speed_sd_column])
    await db_session.flush()

    speeds = [12.0, 14.0, 15.0, 15.5, 16.0, 17.0]
    speed_sd = [1.5, 2.1, 2.8, 3.0, 3.1, 3.2]
    directions = [0.0, 30.0, 60.0, 120.0, 180.0, 240.0]
    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=dataset.id,
                timestamp=start_time + timedelta(minutes=index * 10),
                values_json={
                    "Dir_80m": directions[index],
                    "Speed_80m": speeds[index],
                    "Speed_SD_80m": speed_sd[index],
                },
            )
            for index in range(len(speeds))
        ],
    )

    flag = Flag(dataset_id=dataset.id, name="Exclude final step", color="#ef4444")
    db_session.add(flag)
    await db_session.flush()
    db_session.add(
        FlaggedRange(
            flag_id=flag.id,
            start_time=start_time + timedelta(minutes=50),
            end_time=start_time + timedelta(minutes=50),
            applied_by="manual",
            column_ids=[speed_column.id, speed_sd_column.id, direction_column.id],
        ),
    )
    await db_session.commit()

    response = await client.post(
        f"/api/analysis/turbulence/{dataset.id}",
        json={
            "speed_column_id": str(speed_column.id),
            "sd_column_id": str(speed_sd_column.id),
            "direction_column_id": str(direction_column.id),
            "exclude_flags": [str(flag.id)],
            "bin_width": 1.0,
            "num_sectors": 12,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["speed_column_id"] == str(speed_column.id)
    assert payload["sd_column_id"] == str(speed_sd_column.id)
    assert payload["direction_column_id"] == str(direction_column.id)
    assert payload["summary"]["sample_count"] == 5
    assert payload["summary"]["mean_ti"] > 0.14
    assert payload["summary"]["characteristic_ti_15"] is not None
    assert payload["summary"]["iec_class"] in {"IEC Class B", "IEC Class A", "Above IEC Class A"}
    assert len(payload["scatter_points"]) == 5
    assert len(payload["speed_bins"]) >= 4
    assert len(payload["direction_bins"]) == 12
    assert len(payload["iec_curves"]) == 3


async def test_air_density_endpoint_uses_measured_pressure_and_returns_monthly_summary(client: AsyncClient, db_session: AsyncSession) -> None:
    project = Project(name="Density Site", elevation=145)
    db_session.add(project)
    await db_session.flush()

    start_time = datetime(2025, 7, 1, 0, 0, tzinfo=UTC)
    dataset = Dataset(
        project_id=project.id,
        name="Density Mast",
        source_type="mast",
        time_step_seconds=600,
        start_time=start_time,
        end_time=start_time + timedelta(minutes=30),
    )
    db_session.add(dataset)
    await db_session.flush()

    temperature_column = DataColumn(dataset_id=dataset.id, name="Temp_2m", measurement_type="temperature", height_m=2)
    pressure_column = DataColumn(dataset_id=dataset.id, name="Press_hPa", measurement_type="pressure", height_m=2)
    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    db_session.add_all([temperature_column, pressure_column, speed_column])
    await db_session.flush()

    rows = [
        {"Temp_2m": 12.0, "Press_hPa": 1013.0, "Speed_80m": 7.0},
        {"Temp_2m": 13.0, "Press_hPa": 1011.5, "Speed_80m": 7.5},
        {"Temp_2m": 14.0, "Press_hPa": 1012.2, "Speed_80m": 8.0},
        {"Temp_2m": 15.0, "Press_hPa": 1010.8, "Speed_80m": 8.5},
    ]
    db_session.add_all(
        [
            TimeseriesData(dataset_id=dataset.id, timestamp=start_time + timedelta(minutes=index * 10), values_json=row)
            for index, row in enumerate(rows)
        ],
    )
    await db_session.commit()

    response = await client.post(
        f"/api/analysis/air-density/{dataset.id}",
        json={
            "temperature_column_id": str(temperature_column.id),
            "pressure_column_id": str(pressure_column.id),
            "speed_column_id": str(speed_column.id),
            "pressure_source": "measured",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["pressure_source"] == "measured"
    assert payload["summary"]["mean_density"] > 1.2
    assert payload["summary"]["mean_wind_power_density"] > 200
    assert payload["summary"]["sample_count"] == 4
    assert len(payload["density_points"]) == 4
    assert len(payload["monthly"]) == 1
    assert payload["monthly"][0]["label"] == "Jul"


async def test_air_density_endpoint_can_estimate_pressure_from_project_elevation(client: AsyncClient, db_session: AsyncSession) -> None:
    project = Project(name="Estimated Pressure Site", elevation=450)
    db_session.add(project)
    await db_session.flush()

    start_time = datetime(2025, 8, 1, 0, 0, tzinfo=UTC)
    dataset = Dataset(
        project_id=project.id,
        name="Density Mast Estimated",
        source_type="mast",
        time_step_seconds=600,
        start_time=start_time,
        end_time=start_time + timedelta(minutes=20),
    )
    db_session.add(dataset)
    await db_session.flush()

    temperature_column = DataColumn(dataset_id=dataset.id, name="Temp_2m", measurement_type="temperature", height_m=2)
    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    db_session.add_all([temperature_column, speed_column])
    await db_session.flush()

    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=dataset.id,
                timestamp=start_time + timedelta(minutes=index * 10),
                values_json={"Temp_2m": 10 + index, "Speed_80m": 6.5 + index * 0.4},
            )
            for index in range(3)
        ],
    )
    await db_session.commit()

    response = await client.post(
        f"/api/analysis/air-density/{dataset.id}",
        json={
            "temperature_column_id": str(temperature_column.id),
            "speed_column_id": str(speed_column.id),
            "pressure_source": "estimated",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["pressure_source"] == "estimated"
    assert payload["summary"]["estimated_pressure_hpa"] is not None
    assert payload["summary"]["elevation_m"] == 450
    assert payload["summary"]["mean_density"] is not None


async def test_extreme_wind_endpoint_returns_return_periods_and_gust_factor(client: AsyncClient, db_session: AsyncSession) -> None:
    project = Project(name="Extreme Wind Site")
    db_session.add(project)
    await db_session.flush()

    start_time = datetime(2020, 1, 1, 0, 0, tzinfo=UTC)
    dataset = Dataset(
        project_id=project.id,
        name="Extreme Wind Mast",
        source_type="mast",
        time_step_seconds=600,
        start_time=start_time,
        end_time=datetime(2024, 12, 31, 0, 0, tzinfo=UTC),
    )
    db_session.add(dataset)
    await db_session.flush()

    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    gust_column = DataColumn(dataset_id=dataset.id, name="Gust_80m", measurement_type="gust", height_m=80)
    db_session.add_all([speed_column, gust_column])
    await db_session.flush()

    annual_speed_maxima = [18.5, 19.8, 21.4, 22.1, 23.0]
    annual_gust_maxima = [24.0, 25.7, 27.3, 28.9, 30.8]
    for index, year in enumerate(range(2020, 2025)):
        db_session.add(
            TimeseriesData(
                dataset_id=dataset.id,
                timestamp=datetime(year, 1, 15, 0, 0, tzinfo=UTC),
                values_json={"Speed_80m": annual_speed_maxima[index] - 4.0, "Gust_80m": annual_gust_maxima[index] - 5.0},
            ),
        )
        db_session.add(
            TimeseriesData(
                dataset_id=dataset.id,
                timestamp=datetime(year, 12, 1, 0, 0, tzinfo=UTC),
                values_json={"Speed_80m": annual_speed_maxima[index], "Gust_80m": annual_gust_maxima[index]},
            ),
        )
    await db_session.commit()

    response = await client.post(
        f"/api/analysis/extreme-wind/{dataset.id}",
        json={
            "speed_column_id": str(speed_column.id),
            "gust_column_id": str(gust_column.id),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["data_source"] == "gust"
    assert payload["summary"]["annual_max_count"] == 5
    assert payload["summary"]["short_record_warning"] is False
    assert payload["summary"]["gust_factor"] > 1.0
    assert payload["summary"]["ve50"] is not None
    assert payload["summary"]["ve50"] > max(annual_gust_maxima)
    assert payload["gumbel_fit"]["scale"] > 0
    assert len(payload["annual_maxima"]) == 5
    assert len(payload["return_periods"]) == 4
    assert len(payload["return_period_curve"]) >= 24
    assert len(payload["observed_points"]) == 5


async def test_power_curve_upload_endpoint_parses_csv(client: AsyncClient) -> None:
    csv_content = "wind_speed_ms,power_kw\n0,0\n4,120\n8,1350\n12,3000\n25,0\n"

    response = await client.post(
        "/api/analysis/power-curve/upload",
        files={"file": ("sample_power_curve.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["file_name"] == "sample_power_curve.csv"
    assert payload["summary"]["point_count"] == 5
    assert payload["summary"]["rated_power_kw"] == 3000.0
    assert payload["summary"]["cut_in_speed_ms"] == 4.0
    assert payload["points"][2]["wind_speed_ms"] == 8.0


async def test_power_curve_library_crud_persists_curves_for_reuse(client: AsyncClient) -> None:
    create_response = await client.post(
        "/api/analysis/power-curves",
        json={
            "name": "Generic 3 MW",
            "file_name": "generic_3mw.csv",
            "points": [
                {"wind_speed_ms": 0, "power_kw": 0},
                {"wind_speed_ms": 5, "power_kw": 250},
                {"wind_speed_ms": 10, "power_kw": 1500},
                {"wind_speed_ms": 12, "power_kw": 3000},
                {"wind_speed_ms": 25, "power_kw": 0},
            ],
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Generic 3 MW"
    assert created["summary"]["rated_power_kw"] == 3000.0
    curve_id = created["id"]

    list_response = await client.get("/api/analysis/power-curves")
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["total"] == 2
    assert any(item["id"] == curve_id for item in listed["items"])

    update_response = await client.put(
        f"/api/analysis/power-curves/{curve_id}",
        json={
            "name": "Generic 3 MW Updated",
            "points": [
                {"wind_speed_ms": 0, "power_kw": 0},
                {"wind_speed_ms": 4, "power_kw": 100},
                {"wind_speed_ms": 8, "power_kw": 1300},
                {"wind_speed_ms": 12, "power_kw": 3000},
                {"wind_speed_ms": 25, "power_kw": 0},
            ],
        },
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "Generic 3 MW Updated"
    assert updated["summary"]["cut_in_speed_ms"] == 4.0

    delete_response = await client.delete(f"/api/analysis/power-curves/{curve_id}")
    assert delete_response.status_code == 204

    final_list_response = await client.get("/api/analysis/power-curves")
    assert final_list_response.status_code == 200
    final_payload = final_list_response.json()
    assert final_payload["total"] == 1
    assert final_payload["items"][0]["file_name"] == "sample_power_curve.csv"
    assert final_payload["items"][0]["summary"]["rated_power_kw"] == 3000.0


async def test_power_curve_library_list_seeds_sample_curve_when_empty(client: AsyncClient) -> None:
    response = await client.get("/api/analysis/power-curves")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["name"] == "Sample 3 MW Turbine"
    assert payload["items"][0]["file_name"] == "sample_power_curve.csv"
    assert payload["items"][0]["summary"]["rated_power_kw"] == 3000.0


async def test_energy_estimate_endpoint_returns_annualized_summary_and_breakdowns(client: AsyncClient, db_session: AsyncSession) -> None:
    project = Project(name="Energy Site", elevation=120)
    db_session.add(project)
    await db_session.flush()

    start_time = datetime(2025, 1, 31, 22, 0, tzinfo=UTC)
    dataset = Dataset(
        project_id=project.id,
        name="Energy Mast",
        source_type="mast",
        time_step_seconds=3600,
        start_time=start_time,
        end_time=start_time + timedelta(hours=3),
    )
    db_session.add(dataset)
    await db_session.flush()

    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_100m", measurement_type="speed", height_m=100)
    db_session.add(speed_column)
    await db_session.flush()

    speeds = [5.0, 10.0, 12.0, 10.0]
    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=dataset.id,
                timestamp=start_time + timedelta(hours=index),
                values_json={"Speed_100m": speeds[index]},
            )
            for index in range(len(speeds))
        ],
    )
    await db_session.commit()

    response = await client.post(
        f"/api/analysis/energy-estimate/{dataset.id}",
        json={
            "speed_column_id": str(speed_column.id),
            "power_curve_points": [
                {"wind_speed_ms": 0, "power_kw": 0},
                {"wind_speed_ms": 5, "power_kw": 250},
                {"wind_speed_ms": 10, "power_kw": 1500},
                {"wind_speed_ms": 12, "power_kw": 3000},
                {"wind_speed_ms": 20, "power_kw": 3000},
                {"wind_speed_ms": 25, "power_kw": 0},
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["speed_column_id"] == str(speed_column.id)
    assert payload["summary"]["time_step_hours"] == 1.0
    assert payload["summary"]["rated_power_kw"] == 3000.0
    assert payload["summary"]["mean_power_kw"] == 1562.5
    assert payload["summary"]["capacity_factor_pct"] == 52.083333333333336
    assert payload["summary"]["annual_energy_mwh"] == 13687.5
    assert payload["summary"]["equivalent_full_load_hours"] == 4562.5
    assert payload["summary"]["air_density_adjusted"] is False
    assert len(payload["monthly"]) == 2
    assert payload["monthly"][0]["label"] == "Jan"
    assert len(payload["speed_bins"]) >= 7


async def test_energy_estimate_endpoint_applies_air_density_adjustment(client: AsyncClient, db_session: AsyncSession) -> None:
    project = Project(name="Dense Site", elevation=30)
    db_session.add(project)
    await db_session.flush()

    start_time = datetime(2025, 3, 1, 0, 0, tzinfo=UTC)
    dataset = Dataset(
        project_id=project.id,
        name="Dense Mast",
        source_type="mast",
        time_step_seconds=3600,
        start_time=start_time,
        end_time=start_time + timedelta(hours=2),
    )
    db_session.add(dataset)
    await db_session.flush()

    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_90m", measurement_type="speed", height_m=90)
    temperature_column = DataColumn(dataset_id=dataset.id, name="Temp_2m", measurement_type="temperature", height_m=2)
    pressure_column = DataColumn(dataset_id=dataset.id, name="Press_hPa", measurement_type="pressure", height_m=2)
    db_session.add_all([speed_column, temperature_column, pressure_column])
    await db_session.flush()

    rows = [
        {"Speed_90m": 10.0, "Temp_2m": 5.0, "Press_hPa": 1030.0},
        {"Speed_90m": 11.0, "Temp_2m": 4.0, "Press_hPa": 1031.0},
        {"Speed_90m": 12.0, "Temp_2m": 4.0, "Press_hPa": 1032.0},
    ]
    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=dataset.id,
                timestamp=start_time + timedelta(hours=index),
                values_json=row,
            )
            for index, row in enumerate(rows)
        ],
    )
    await db_session.commit()

    response = await client.post(
        f"/api/analysis/energy-estimate/{dataset.id}",
        json={
            "speed_column_id": str(speed_column.id),
            "temperature_column_id": str(temperature_column.id),
            "pressure_column_id": str(pressure_column.id),
            "air_density_adjustment": True,
            "pressure_source": "measured",
            "power_curve_points": [
                {"wind_speed_ms": 0, "power_kw": 0},
                {"wind_speed_ms": 5, "power_kw": 300},
                {"wind_speed_ms": 10, "power_kw": 1500},
                {"wind_speed_ms": 12, "power_kw": 3000},
                {"wind_speed_ms": 20, "power_kw": 3000},
                {"wind_speed_ms": 25, "power_kw": 0},
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["air_density_adjusted"] is True
    assert payload["summary"]["pressure_source"] == "measured"
    assert payload["summary"]["annual_energy_mwh"] > 0
    assert payload["summary"]["mean_power_kw"] > 0