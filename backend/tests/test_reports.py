from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, PowerCurve, Project, TimeseriesData


async def _seed_report_dataset(db_session: AsyncSession) -> tuple[Project, Dataset, list[DataColumn], PowerCurve]:
    project = Project(
        name="Report Site",
        description="Project for report generation tests",
        latitude=12.3456,
        longitude=77.6543,
        elevation=980.0,
    )
    db_session.add(project)
    await db_session.flush()

    base_time = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
    dataset = Dataset(
        project_id=project.id,
        name="Primary Mast",
        source_type="met_tower",
        file_name="primary_mast.csv",
        time_step_seconds=600,
        start_time=base_time,
        end_time=base_time + timedelta(minutes=50),
        metadata_json={"campaign": "Task 30 verification"},
    )
    db_session.add(dataset)
    await db_session.flush()

    columns = [
        DataColumn(dataset_id=dataset.id, name="Speed_40m", measurement_type="speed", unit="m/s", height_m=40.0),
        DataColumn(dataset_id=dataset.id, name="Speed_60m", measurement_type="speed", unit="m/s", height_m=60.0),
        DataColumn(dataset_id=dataset.id, name="Dir_60m", measurement_type="direction", unit="deg", height_m=60.0),
        DataColumn(dataset_id=dataset.id, name="Temp_2m", measurement_type="temperature", unit="C", height_m=2.0),
        DataColumn(dataset_id=dataset.id, name="Pressure_hPa", measurement_type="pressure", unit="hPa", height_m=2.0),
        DataColumn(dataset_id=dataset.id, name="Speed_SD_60m", measurement_type="speed_sd", unit="m/s", height_m=60.0),
    ]
    db_session.add_all(columns)

    power_curve = PowerCurve(
        name="Report Curve",
        file_name="report-curve.csv",
        points_json=[
            {"wind_speed_ms": 0.0, "power_kw": 0.0},
            {"wind_speed_ms": 3.0, "power_kw": 25.0},
            {"wind_speed_ms": 5.0, "power_kw": 320.0},
            {"wind_speed_ms": 8.0, "power_kw": 1450.0},
            {"wind_speed_ms": 11.0, "power_kw": 2500.0},
            {"wind_speed_ms": 13.0, "power_kw": 3000.0},
            {"wind_speed_ms": 25.0, "power_kw": 0.0},
        ],
        summary_json={"rated_power_kw": 3000.0},
    )
    db_session.add(power_curve)

    rows = [
        {"Speed_40m": 5.1, "Speed_60m": 6.0, "Dir_60m": 25.0, "Temp_2m": 17.2, "Pressure_hPa": 908.0, "Speed_SD_60m": 0.72},
        {"Speed_40m": 5.7, "Speed_60m": 6.8, "Dir_60m": 40.0, "Temp_2m": 17.0, "Pressure_hPa": 907.8, "Speed_SD_60m": 0.76},
        {"Speed_40m": 6.4, "Speed_60m": 7.5, "Dir_60m": 65.0, "Temp_2m": 16.8, "Pressure_hPa": 907.5, "Speed_SD_60m": 0.81},
        {"Speed_40m": 6.0, "Speed_60m": 7.0, "Dir_60m": 95.0, "Temp_2m": 16.6, "Pressure_hPa": 907.3, "Speed_SD_60m": 0.74},
        {"Speed_40m": 5.4, "Speed_60m": 6.1, "Dir_60m": 120.0, "Temp_2m": 16.5, "Pressure_hPa": 907.1, "Speed_SD_60m": 0.69},
        {"Speed_40m": 4.9, "Speed_60m": 5.6, "Dir_60m": 155.0, "Temp_2m": 16.4, "Pressure_hPa": 906.9, "Speed_SD_60m": 0.66},
    ]
    db_session.add_all(
        [
            TimeseriesData(dataset_id=dataset.id, timestamp=base_time + timedelta(minutes=10 * index), values_json=row)
            for index, row in enumerate(rows)
        ]
    )

    await db_session.commit()
    return project, dataset, columns, power_curve


async def test_generate_pdf_report_returns_pdf_artifact(client: AsyncClient, db_session: AsyncSession) -> None:
    project, dataset, columns, power_curve = await _seed_report_dataset(db_session)
    column_by_name = {column.name: column for column in columns}

    response = await client.post(
        f"/api/reports/generate/{project.id}",
        json={
            "dataset_id": str(dataset.id),
            "format": "pdf",
            "sections": ["title_page", "executive_summary", "frequency_distribution", "wind_shear"],
            "column_selection": {
                "speed_column_id": str(column_by_name["Speed_60m"].id),
                "shear_column_ids": [str(column_by_name["Speed_40m"].id), str(column_by_name["Speed_60m"].id)],
            },
            "power_curve_id": str(power_curve.id),
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["content-disposition"].endswith('report.pdf"')
    assert response.content.startswith(b"%PDF")


async def test_generate_docx_report_returns_word_artifact(client: AsyncClient, db_session: AsyncSession) -> None:
    project, dataset, columns, power_curve = await _seed_report_dataset(db_session)
    column_by_name = {column.name: column for column in columns}

    response = await client.post(
        f"/api/reports/generate/{project.id}",
        json={
            "dataset_id": str(dataset.id),
            "format": "docx",
            "sections": ["title_page", "data_summary", "qc_summary", "air_density", "turbulence", "energy_estimate"],
            "column_selection": {
                "speed_column_id": str(column_by_name["Speed_60m"].id),
                "temperature_column_id": str(column_by_name["Temp_2m"].id),
                "pressure_column_id": str(column_by_name["Pressure_hPa"].id),
                "turbulence_column_id": str(column_by_name["Speed_SD_60m"].id),
            },
            "power_curve_id": str(power_curve.id),
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert response.headers["content-disposition"].endswith('report.docx"')
    assert response.content.startswith(b"PK")


async def test_generate_report_rejects_invalid_selected_column_type(client: AsyncClient, db_session: AsyncSession) -> None:
    project, dataset, columns, _ = await _seed_report_dataset(db_session)
    column_by_name = {column.name: column for column in columns}

    response = await client.post(
        f"/api/reports/generate/{project.id}",
        json={
            "dataset_id": str(dataset.id),
            "format": "pdf",
            "sections": ["title_page", "wind_rose"],
            "column_selection": {
                "speed_column_id": str(column_by_name["Dir_60m"].id),
                "direction_column_id": str(column_by_name["Dir_60m"].id),
            },
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "speed_column_id must reference one of: speed"
