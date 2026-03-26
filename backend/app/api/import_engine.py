from __future__ import annotations

import json
import math
import tempfile
import uuid
from pathlib import Path
from typing import Annotated, Any

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DataColumn, Dataset, Project, TimeseriesData
from app.schemas import (
    ColumnInfo,
    ConfirmImportRequest,
    DatasetImportResponse,
    ExcelSheetListResponse,
    UploadPreviewResponse,
)
from app.services.file_parsers import (
    detect_columns,
    is_campbell_content,
    is_nrg_content,
    list_excel_sheets,
    parse_campbell,
    parse_csv,
    parse_excel,
    parse_nrg,
    sniff_delimiter,
)
from app.services.file_parsers.auto_detect import infer_time_step_seconds


router = APIRouter(prefix="/api/import", tags=["import"])
DbSession = Annotated[AsyncSession, Depends(get_db)]
IMPORT_DIR = Path(tempfile.gettempdir()) / "windwhisper_imports"
TEXT_SUFFIXES = {".csv", ".txt", ".tsv"}
EXCEL_SUFFIXES = {".xls", ".xlsx"}
LOGGER_SUFFIXES = {".dat"}
SUPPORTED_SUFFIXES = TEXT_SUFFIXES | EXCEL_SUFFIXES | LOGGER_SUFFIXES


def _ensure_import_dir() -> Path:
    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    return IMPORT_DIR


def _normalize_scalar(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def _preview_rows(df: pd.DataFrame, limit: int = 20) -> list[dict[str, Any]]:
    preview = df.head(limit).reset_index()
    rows: list[dict[str, Any]] = []
    for record in preview.to_dict(orient="records"):
        rows.append({key: _normalize_scalar(value) for key, value in record.items()})
    return rows


def _serialize_frame(df: pd.DataFrame) -> list[dict[str, Any]]:
    serialized_rows: list[dict[str, Any]] = []
    timestamp_column = str(df.index.name or "timestamp")
    for timestamp, row in df.iterrows():
        values = {column: _normalize_scalar(value) for column, value in row.items()}
        serialized_rows.append({timestamp_column: _normalize_scalar(timestamp), **values})
    return serialized_rows


def _load_frame(rows: list[dict[str, Any]], timestamp_column: str) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    if timestamp_column not in frame.columns:
        raise ValueError("Import session is missing its timestamp column")
    timestamps = pd.to_datetime(frame[timestamp_column], errors="coerce", utc=True)
    frame = frame.drop(columns=[timestamp_column])
    frame.index = timestamps
    frame.index.name = timestamp_column
    return frame.sort_index()


def _session_file(import_id: uuid.UUID) -> Path:
    return _ensure_import_dir() / f"{import_id}.json"


def _write_session(
    import_id: uuid.UUID,
    file_name: str,
    parser_type: str,
    delimiter: str | None,
    df: pd.DataFrame,
    columns: list[ColumnInfo],
    parser_metadata: dict[str, Any] | None = None,
    sheet_names: list[str] | None = None,
    selected_sheet: str | None = None,
) -> None:
    payload = {
        "file_name": file_name,
        "parser_type": parser_type,
        "delimiter": delimiter,
        "timestamp_column": str(df.index.name or "timestamp"),
        "rows": _serialize_frame(df),
        "columns": [column.model_dump() for column in columns],
        "parser_metadata": parser_metadata or {},
        "sheet_names": sheet_names or [],
        "selected_sheet": selected_sheet,
        "time_step_seconds": infer_time_step_seconds(df.index),
    }
    _session_file(import_id).write_text(json.dumps(payload), encoding="utf-8")


def _read_session(import_id: uuid.UUID) -> dict[str, Any]:
    session_file = _session_file(import_id)
    if not session_file.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import session not found")
    return json.loads(session_file.read_text(encoding="utf-8"))


def _delete_session(import_id: uuid.UUID) -> None:
    session_file = _session_file(import_id)
    if session_file.exists():
        session_file.unlink()


async def _require_project(db: AsyncSession, project_id: uuid.UUID) -> Project:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _sniff_file_text(file_path: Path) -> str:
    return file_path.read_text(encoding="utf-8-sig", errors="ignore")[:4096]


def _select_text_parser(file_path: Path, suffix: str) -> str:
    if suffix == ".csv" or suffix == ".tsv":
        return "csv"

    text = _sniff_file_text(file_path)
    if suffix == ".dat":
        return "campbell" if is_campbell_content(text) else "csv"
    if suffix == ".txt":
        return "nrg" if is_nrg_content(text) else "csv"
    return "csv"


def _merge_column_metadata(columns: list[ColumnInfo], parser_metadata: dict[str, Any]) -> list[ColumnInfo]:
    overrides = parser_metadata.get("column_metadata", {})
    merged_columns: list[ColumnInfo] = []
    for column in columns:
        override = overrides.get(column.name, {})
        merged_columns.append(
            column.model_copy(
                update={
                    "measurement_type": override.get("measurement_type", column.measurement_type),
                    "height_m": override.get("height_m", column.height_m),
                    "unit": override.get("unit", column.unit),
                },
            ),
        )
    return merged_columns


@router.post("/upload/{project_id}", response_model=UploadPreviewResponse)
async def upload_import_file(
    project_id: uuid.UUID,
    db: DbSession,
    sheet_name: str | None = Form(default=None),
    file: UploadFile = File(...),
) -> UploadPreviewResponse:
    await _require_project(db, project_id)

    suffix = Path(file.filename or "upload.csv").suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")

    import_id = uuid.uuid4()
    temp_file = _ensure_import_dir() / f"{import_id}{suffix}"
    temp_file.write_bytes(await file.read())

    try:
        delimiter: str | None = None
        sheet_names: list[str] = []
        selected_sheet: str | None = None
        parser_metadata: dict[str, Any] = {}

        if suffix in TEXT_SUFFIXES:
            parser_type = _select_text_parser(temp_file, suffix)
            if parser_type == "nrg":
                frame, parser_metadata = parse_nrg(str(temp_file))
            else:
                delimiter = sniff_delimiter(str(temp_file))
                frame = parse_csv(str(temp_file))
                parser_type = "csv"
        elif suffix in LOGGER_SUFFIXES:
            parser_type = _select_text_parser(temp_file, suffix)
            if parser_type == "campbell":
                frame, parser_metadata = parse_campbell(str(temp_file))
            else:
                delimiter = sniff_delimiter(str(temp_file))
                frame = parse_csv(str(temp_file))
                parser_type = "csv"
        else:
            frame, sheet_names, selected_sheet = parse_excel(str(temp_file), sheet_name=sheet_name or 0)
            parser_type = "excel"

        columns = detect_columns(frame)
        columns = _merge_column_metadata(columns, parser_metadata)
        _write_session(
            import_id,
            file.filename or temp_file.name,
            parser_type,
            delimiter,
            frame,
            columns,
            parser_metadata=parser_metadata,
            sheet_names=sheet_names,
            selected_sheet=selected_sheet,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    finally:
        if temp_file.exists():
            temp_file.unlink()

    return UploadPreviewResponse(
        import_id=import_id,
        file_name=file.filename or temp_file.name,
        delimiter=delimiter,
        row_count=len(frame),
        time_step_seconds=infer_time_step_seconds(frame.index),
        preview_rows=_preview_rows(frame),
        columns=columns,
        sheet_names=sheet_names,
        selected_sheet=selected_sheet,
    )


@router.get("/sheets/{project_id}", response_model=ExcelSheetListResponse)
async def list_import_sheets(
    project_id: uuid.UUID,
    db: DbSession,
    import_id: uuid.UUID = Query(...),
) -> ExcelSheetListResponse:
    await _require_project(db, project_id)
    session_payload = _read_session(import_id)
    if session_payload.get("parser_type") != "excel":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Import session is not an Excel upload")

    return ExcelSheetListResponse(
        import_id=import_id,
        sheet_names=session_payload.get("sheet_names", []),
        selected_sheet=session_payload.get("selected_sheet"),
    )


@router.post(
    "/confirm/{project_id}",
    response_model=DatasetImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def confirm_import(
    project_id: uuid.UUID,
    payload: ConfirmImportRequest,
    db: DbSession,
) -> DatasetImportResponse:
    await _require_project(db, project_id)

    session_payload = _read_session(payload.import_id)
    frame = _load_frame(session_payload["rows"], session_payload["timestamp_column"])
    confirmed_columns = payload.columns or [ColumnInfo.model_validate(item) for item in session_payload["columns"]]
    dataset_name = payload.dataset_name or Path(session_payload["file_name"]).stem
    time_step_seconds = infer_time_step_seconds(frame.index)
    start_time = frame.index.min().to_pydatetime() if len(frame.index) else None
    end_time = frame.index.max().to_pydatetime() if len(frame.index) else None

    dataset = Dataset(
        project_id=project_id,
        name=dataset_name,
        source_type="file_upload",
        file_name=session_payload["file_name"],
        time_step_seconds=time_step_seconds,
        start_time=start_time,
        end_time=end_time,
        metadata_json={
            "delimiter": session_payload["delimiter"],
            "parser_type": session_payload.get("parser_type"),
            "row_count": len(frame),
            "import_id": str(payload.import_id),
            "source_metadata": session_payload.get("parser_metadata", {}),
            "sheet_names": session_payload.get("sheet_names", []),
            "selected_sheet": session_payload.get("selected_sheet"),
        },
    )
    db.add(dataset)
    await db.flush()

    db.add_all(
        [
            DataColumn(
                dataset_id=dataset.id,
                name=column.name,
                unit=column.unit,
                measurement_type=column.measurement_type,
                height_m=column.height_m,
                sensor_info={"confidence": column.confidence},
            )
            for column in confirmed_columns
        ],
    )

    rows_to_insert = [
        {
            "dataset_id": dataset.id,
            "timestamp": timestamp.to_pydatetime(),
            "values_json": {column: _normalize_scalar(value) for column, value in row.items()},
        }
        for timestamp, row in frame.iterrows()
    ]
    if rows_to_insert:
        await db.execute(insert(TimeseriesData), rows_to_insert)

    await db.commit()
    _delete_session(payload.import_id)

    return DatasetImportResponse(
        dataset_id=dataset.id,
        project_id=project_id,
        name=dataset.name,
        row_count=len(frame),
        column_count=len(confirmed_columns),
        time_step_seconds=time_step_seconds,
        start_time=start_time,
        end_time=end_time,
    )