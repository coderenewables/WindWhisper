from __future__ import annotations

from pathlib import Path

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, TimeseriesData


SAMPLE_FILE = Path(__file__).resolve().parents[2] / "data" / "sample_met_tower.csv"
SAMPLE_WORKBOOK = Path(__file__).resolve().parents[2] / "data" / "sample_met_tower.xlsx"
SAMPLE_NRG = Path(__file__).resolve().parents[2] / "data" / "sample_nrg.txt"
SAMPLE_CAMPBELL = Path(__file__).resolve().parents[2] / "data" / "sample_campbell.dat"


async def create_project_for_import(client: AsyncClient) -> str:
    response = await client.post("/api/projects", json={"name": "Import Target"})
    assert response.status_code == 201
    return response.json()["id"]


async def test_upload_csv_returns_preview_with_detected_columns(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)

    response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": (SAMPLE_FILE.name, SAMPLE_FILE.read_bytes(), "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["row_count"] >= 1000
    assert len(payload["preview_rows"]) == 20
    assert payload["time_step_seconds"] == 600

    columns = {column["name"]: column for column in payload["columns"]}
    assert columns["Speed_80m"]["measurement_type"] == "speed"
    assert columns["Speed_80m"]["height_m"] == 80.0
    assert columns["Dir_60m"]["measurement_type"] == "direction"
    assert columns["Temp_2m"]["measurement_type"] == "temperature"


async def test_confirm_import_persists_dataset_and_timeseries(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    project_id = await create_project_for_import(client)
    upload_response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": (SAMPLE_FILE.name, SAMPLE_FILE.read_bytes(), "text/csv")},
    )
    upload_payload = upload_response.json()

    confirm_response = await client.post(
        f"/api/import/confirm/{project_id}",
        json={
            "import_id": upload_payload["import_id"],
            "dataset_name": "Sample Met Tower",
            "columns": upload_payload["columns"],
        },
    )

    assert confirm_response.status_code == 201
    summary = confirm_response.json()
    assert summary["name"] == "Sample Met Tower"
    assert summary["row_count"] == upload_payload["row_count"]
    assert summary["column_count"] == len(upload_payload["columns"])

    dataset_count = await db_session.scalar(select(func.count(Dataset.id)))
    column_count = await db_session.scalar(select(func.count(DataColumn.id)))
    timeseries_count = await db_session.scalar(select(func.count(TimeseriesData.id)))

    assert dataset_count == 1
    assert column_count == len(upload_payload["columns"])
    assert timeseries_count == upload_payload["row_count"]


async def test_upload_accepts_tab_delimited_text(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)
    tab_delimited = "\n".join(
        [
            "Timestamp\tSpeed_40m\tDir_40m\tTemp_2m",
            "2025-01-01T00:00:00Z\t7.1\t182\t12.4",
            "2025-01-01T00:10:00Z\t7.4\t188\t12.1",
            "2025-01-01T00:20:00Z\t6.9\t176\t11.9",
        ],
    )

    response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": ("sample_tab.txt", tab_delimited.encode("utf-8"), "text/plain")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["delimiter"] == "\t"
    assert payload["row_count"] == 3


async def test_upload_excel_returns_sheets_and_detected_enhanced_columns(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)

    response = await client.post(
        f"/api/import/upload/{project_id}",
        data={"sheet_name": "MetData"},
        files={
            "file": (
                SAMPLE_WORKBOOK.name,
                SAMPLE_WORKBOOK.read_bytes(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["selected_sheet"] == "MetData"
    assert payload["sheet_names"] == ["MetData", "Summary"]
    assert payload["time_step_seconds"] == 600

    columns = {column["name"]: column for column in payload["columns"]}
    assert columns["Speed (m/s) 80m"]["measurement_type"] == "speed"
    assert columns["Speed SD (m/s) 80m"]["measurement_type"] == "speed_sd"
    assert columns["TI (%) 80m"]["measurement_type"] == "turbulence_intensity"
    assert columns["Gust Max (m/s) 80m"]["measurement_type"] == "gust"
    assert columns["BP (hPa) 2m"]["measurement_type"] == "pressure"
    assert columns["BP (hPa) 2m"]["height_m"] == 2.0


async def test_list_import_sheets_returns_workbook_sheet_names(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)
    upload_response = await client.post(
        f"/api/import/upload/{project_id}",
        files={
            "file": (
                SAMPLE_WORKBOOK.name,
                SAMPLE_WORKBOOK.read_bytes(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
        },
    )
    import_id = upload_response.json()["import_id"]

    response = await client.get(f"/api/import/sheets/{project_id}", params={"import_id": import_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["sheet_names"] == ["MetData", "Summary"]
    assert payload["selected_sheet"] == "MetData"


async def test_confirm_excel_import_persists_dataset(client: AsyncClient, db_session: AsyncSession) -> None:
    project_id = await create_project_for_import(client)
    upload_response = await client.post(
        f"/api/import/upload/{project_id}",
        data={"sheet_name": "MetData"},
        files={
            "file": (
                SAMPLE_WORKBOOK.name,
                SAMPLE_WORKBOOK.read_bytes(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
        },
    )
    upload_payload = upload_response.json()

    confirm_response = await client.post(
        f"/api/import/confirm/{project_id}",
        json={
            "import_id": upload_payload["import_id"],
            "dataset_name": "Excel Met Tower",
            "columns": upload_payload["columns"],
        },
    )

    assert confirm_response.status_code == 201
    summary = confirm_response.json()
    assert summary["name"] == "Excel Met Tower"
    assert summary["time_step_seconds"] == 600

    dataset = await db_session.scalar(select(Dataset))
    timeseries_count = await db_session.scalar(select(func.count(TimeseriesData.id)))
    assert dataset is not None
    assert dataset.metadata_json["parser_type"] == "excel"
    assert dataset.metadata_json["selected_sheet"] == "MetData"
    assert timeseries_count == upload_payload["row_count"]


async def test_upload_nrg_auto_detects_parser_and_columns(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)

    response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": (SAMPLE_NRG.name, SAMPLE_NRG.read_bytes(), "text/plain")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["row_count"] == 6
    assert payload["time_step_seconds"] == 600

    columns = {column["name"]: column for column in payload["columns"]}
    assert columns["Speed_60m"]["measurement_type"] == "speed"
    assert columns["Speed_SD_60m"]["measurement_type"] == "speed_sd"
    assert columns["Dir_60m"]["measurement_type"] == "direction"
    assert columns["Temp_2m"]["measurement_type"] == "temperature"


async def test_confirm_nrg_import_persists_site_metadata(client: AsyncClient, db_session: AsyncSession) -> None:
    project_id = await create_project_for_import(client)
    upload_response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": (SAMPLE_NRG.name, SAMPLE_NRG.read_bytes(), "text/plain")},
    )
    upload_payload = upload_response.json()

    confirm_response = await client.post(
        f"/api/import/confirm/{project_id}",
        json={
            "import_id": upload_payload["import_id"],
            "dataset_name": "NRG Tower",
            "columns": upload_payload["columns"],
        },
    )

    assert confirm_response.status_code == 201
    dataset = await db_session.scalar(select(Dataset))
    assert dataset is not None
    assert dataset.metadata_json["parser_type"] == "nrg"
    assert dataset.metadata_json["source_metadata"]["site_info"]["site_number"] == "NRG-2045"
    assert dataset.metadata_json["source_metadata"]["site_info"]["latitude"] == 35.123


async def test_upload_campbell_auto_detects_parser_and_units(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)

    response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": (SAMPLE_CAMPBELL.name, SAMPLE_CAMPBELL.read_bytes(), "text/plain")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["row_count"] == 6
    assert payload["time_step_seconds"] == 600

    columns = {column["name"]: column for column in payload["columns"]}
    assert columns["WS_80m_Avg"]["measurement_type"] == "speed"
    assert columns["WS_80m_Std"]["measurement_type"] == "speed_sd"
    assert columns["BP_2m_Avg"]["measurement_type"] == "pressure"
    assert columns["BP_2m_Avg"]["unit"] == "hPa"
    assert columns["AirTC_2m_Avg"]["measurement_type"] == "temperature"


async def test_confirm_campbell_import_persists_units_metadata(client: AsyncClient, db_session: AsyncSession) -> None:
    project_id = await create_project_for_import(client)
    upload_response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": (SAMPLE_CAMPBELL.name, SAMPLE_CAMPBELL.read_bytes(), "text/plain")},
    )
    upload_payload = upload_response.json()

    confirm_response = await client.post(
        f"/api/import/confirm/{project_id}",
        json={
            "import_id": upload_payload["import_id"],
            "dataset_name": "Campbell Logger",
            "columns": upload_payload["columns"],
        },
    )

    assert confirm_response.status_code == 201
    dataset = await db_session.scalar(select(Dataset))
    assert dataset is not None
    assert dataset.metadata_json["parser_type"] == "campbell"
    assert dataset.metadata_json["source_metadata"]["column_metadata"]["WS_80m_Avg"]["unit"] == "m/s"
    assert dataset.metadata_json["source_metadata"]["logger_info"]["format"] == "TOA5"


# --- Edge-case tests ---


async def test_upload_empty_csv_returns_400(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)

    response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": ("empty.csv", b"", "text/csv")},
    )

    assert response.status_code == 400


async def test_upload_header_only_csv_returns_400(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)
    header_only = b"Timestamp,Speed_80m,Dir_80m\n"

    response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": ("header_only.csv", header_only, "text/csv")},
    )

    assert response.status_code == 400


async def test_upload_csv_missing_timestamp_column_returns_400(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)
    no_timestamp = b"Speed_80m,Dir_80m\n5.0,180\n6.0,190\n"

    response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": ("no_ts.csv", no_timestamp, "text/csv")},
    )

    assert response.status_code == 400


async def test_upload_semicolon_delimited_csv_is_auto_detected(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)
    semicolon_csv = (
        "Timestamp;Speed_40m;Dir_40m\n"
        "2025-06-01T00:00:00Z;5.3;280\n"
        "2025-06-01T00:10:00Z;5.7;275\n"
        "2025-06-01T00:20:00Z;6.1;270\n"
    )

    response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": ("semi.csv", semicolon_csv.encode(), "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["delimiter"] == ";"
    assert payload["row_count"] == 3


async def test_upload_csv_with_all_nan_values_returns_preview(client: AsyncClient) -> None:
    project_id = await create_project_for_import(client)
    nan_csv = (
        "Timestamp,Speed_40m,Dir_40m\n"
        "2025-07-01T00:00:00Z,,\n"
        "2025-07-01T00:10:00Z,,\n"
    )

    response = await client.post(
        f"/api/import/upload/{project_id}",
        files={"file": ("nan.csv", nan_csv.encode(), "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["row_count"] == 2