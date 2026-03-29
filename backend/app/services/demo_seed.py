from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Project, TimeseriesData
from app.services.file_parsers.auto_detect import detect_columns, infer_time_step_seconds


DEMO_PROJECT_NAME = "GoKaatru Demo Project"
DEMO_PROJECT_DESCRIPTION = (
    "Preloaded sample workspace with met-mast measurements, ERA5 and MERRA-style reference datasets, "
    "and a sample turbine power curve so users can explore the full workflow immediately."
)
DEMO_PROJECT_LATITUDE = 35.123
DEMO_PROJECT_LONGITUDE = -101.456
DEMO_PROJECT_ELEVATION = 1420.0
DEMO_SOURCE = "demo_seed"
DEMO_DATASET_FILE_NAME = "sample_met_tower.csv"
DEMO_ERA5_FILE_NAME = "sample_reanalysis_era5.csv"
DEMO_MERRA_FILE_NAME = "sample_reanalysis_merra2.csv"
DEMO_MEASUREMENT_DATASET_NAME = "Demo Met Mast"
DEMO_ERA5_DATASET_NAME = "Demo ERA5 Reference"
DEMO_MERRA_DATASET_NAME = "Demo MERRA-2 Reference"
DEMO_MEASUREMENT_ROW_LIMIT = 365 * 24 * 6
DEMO_REFERENCE_ROW_LIMIT = 2 * 365 * 24
TIMESERIES_INSERT_CHUNK_SIZE = 2000


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _data_dir() -> Path:
    return _repo_root() / "data"


def _load_csv_frame(file_name: str, row_limit: int | None = None) -> pd.DataFrame:
    file_path = _data_dir() / file_name
    if not file_path.exists():
        raise FileNotFoundError(f"Demo seed file not found: {file_path}")

    frame = pd.read_csv(file_path)
    timestamp_column = next((column for column in frame.columns if str(column).lower() == "timestamp"), None)
    if timestamp_column is None:
        raise ValueError(f"Demo seed file is missing a timestamp column: {file_name}")

    timestamps = pd.to_datetime(frame[timestamp_column], utc=True, errors="coerce")
    normalized = frame.drop(columns=[timestamp_column]).copy()
    normalized.index = timestamps
    normalized.index.name = "timestamp"
    normalized = normalized[normalized.index.notna()].sort_index()

    if row_limit is not None and len(normalized) > row_limit:
        normalized = normalized.iloc[:row_limit].copy()
    return normalized


def _build_demo_merra_frame(era5_frame: pd.DataFrame) -> pd.DataFrame:
    required_columns = {"Ref_Speed_100m", "Ref_Dir_100m", "Ref_Temp_2m", "Ref_Pressure_hPa"}
    missing = required_columns.difference(era5_frame.columns)
    if missing:
        raise ValueError(f"ERA5 demo frame is missing required columns: {sorted(missing)}")

    angle_radians = pd.Series(pd.to_numeric(era5_frame["Ref_Dir_100m"], errors="coerce"), index=era5_frame.index).fillna(0.0)
    seasonal_signal = pd.Series(
        [math.sin(index_value.dayofyear / 365.25 * math.tau) for index_value in era5_frame.index],
        index=era5_frame.index,
        dtype=float,
    )
    speed_50m = pd.to_numeric(era5_frame["Ref_Speed_100m"], errors="coerce") * 0.9 + seasonal_signal * 0.18
    direction_50m = (angle_radians + 7.5 * pd.Series([math.cos(value / 180.0 * math.pi) for value in angle_radians], index=era5_frame.index)).mod(360.0)
    temperature_2m = pd.to_numeric(era5_frame["Ref_Temp_2m"], errors="coerce") + seasonal_signal * 0.25
    pressure_hpa = pd.to_numeric(era5_frame["Ref_Pressure_hPa"], errors="coerce") - seasonal_signal * 0.8

    merra = pd.DataFrame(
        {
            "Speed_50m": speed_50m.round(3),
            "Dir_50m": direction_50m.round(2),
            "Temp_2m": temperature_2m.round(3),
            "Pressure_hPa": pressure_hpa.round(3),
        },
        index=era5_frame.index,
    )
    merra.index.name = "timestamp"
    return merra.dropna(how="all")


def _dataset_metadata(file_name: str, row_count: int, parser_type: str, source: str) -> dict[str, Any]:
    return {
        "seeded": True,
        "seed_source": DEMO_SOURCE,
        "parser_type": parser_type,
        "row_count": row_count,
        "source_metadata": {"origin": source},
        "sheet_names": [],
        "selected_sheet": None,
        "delimiter": ",",
        "file_name": file_name,
    }


async def _get_demo_project(db: AsyncSession) -> Project | None:
    return (
        await db.execute(
            select(Project).where(
                or_(
                    Project.name == DEMO_PROJECT_NAME,
                    Project.description == DEMO_PROJECT_DESCRIPTION,
                ),
            ),
        )
    ).scalar_one_or_none()


async def _ensure_demo_project(db: AsyncSession) -> Project:
    existing = await _get_demo_project(db)
    if existing is not None:
        return existing

    project = Project(
        name=DEMO_PROJECT_NAME,
        description=DEMO_PROJECT_DESCRIPTION,
        latitude=DEMO_PROJECT_LATITUDE,
        longitude=DEMO_PROJECT_LONGITUDE,
        elevation=DEMO_PROJECT_ELEVATION,
    )
    db.add(project)
    await db.flush()
    return project


async def _dataset_exists(db: AsyncSession, project_id: Any, dataset_name: str) -> bool:
    return (
        await db.execute(
            select(Dataset.id).where(
                Dataset.project_id == project_id,
                Dataset.name == dataset_name,
            ),
        )
    ).scalar_one_or_none() is not None


def _build_timeseries_rows(dataset_id: Any, frame: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for timestamp, row in frame.iterrows():
        values = {
            str(column): (None if pd.isna(value) else float(value) if hasattr(value, "__float__") else value)
            for column, value in row.items()
        }
        rows.append({"dataset_id": dataset_id, "timestamp": timestamp.to_pydatetime(), "values_json": values})
    return rows


async def _insert_timeseries_rows(db: AsyncSession, rows: list[dict[str, Any]]) -> None:
    for start in range(0, len(rows), TIMESERIES_INSERT_CHUNK_SIZE):
        chunk = rows[start : start + TIMESERIES_INSERT_CHUNK_SIZE]
        await db.execute(insert(TimeseriesData), chunk)


async def _create_dataset(
    db: AsyncSession,
    *,
    project_id: Any,
    dataset_name: str,
    file_name: str,
    source_type: str,
    parser_type: str,
    source_label: str,
    frame: pd.DataFrame,
) -> Dataset:
    dataset = Dataset(
        project_id=project_id,
        name=dataset_name,
        source_type=source_type,
        file_name=file_name,
        time_step_seconds=infer_time_step_seconds(frame.index),
        start_time=frame.index.min().to_pydatetime() if len(frame.index) else None,
        end_time=frame.index.max().to_pydatetime() if len(frame.index) else None,
        metadata_json=_dataset_metadata(file_name, len(frame), parser_type, source_label),
    )
    db.add(dataset)
    await db.flush()

    columns = detect_columns(frame)
    db.add_all(
        [
            DataColumn(
                dataset_id=dataset.id,
                name=column.name,
                unit=column.unit,
                measurement_type=column.measurement_type,
                height_m=column.height_m,
                sensor_info={
                    "confidence": column.confidence,
                    "seeded": True,
                    "seed_source": DEMO_SOURCE,
                },
            )
            for column in columns
        ],
    )
    await db.flush()

    await _insert_timeseries_rows(db, _build_timeseries_rows(dataset.id, frame))
    return dataset


async def ensure_seeded_demo_workspace(db: AsyncSession) -> Project:
    project = await _ensure_demo_project(db)

    measurement_exists = await _dataset_exists(db, project.id, DEMO_MEASUREMENT_DATASET_NAME)
    era5_exists = await _dataset_exists(db, project.id, DEMO_ERA5_DATASET_NAME)
    merra_exists = await _dataset_exists(db, project.id, DEMO_MERRA_DATASET_NAME)

    if not measurement_exists:
        measurement_frame = _load_csv_frame(DEMO_DATASET_FILE_NAME, row_limit=DEMO_MEASUREMENT_ROW_LIMIT)
        await _create_dataset(
            db,
            project_id=project.id,
            dataset_name=DEMO_MEASUREMENT_DATASET_NAME,
            file_name=DEMO_DATASET_FILE_NAME,
            source_type="file_upload",
            parser_type="csv",
            source_label="sample_met_tower",
            frame=measurement_frame,
        )

    era5_frame: pd.DataFrame | None = None
    if not era5_exists or not merra_exists:
        era5_frame = _load_csv_frame(DEMO_ERA5_FILE_NAME, row_limit=DEMO_REFERENCE_ROW_LIMIT)

    if not era5_exists and era5_frame is not None:
        await _create_dataset(
            db,
            project_id=project.id,
            dataset_name=DEMO_ERA5_DATASET_NAME,
            file_name=DEMO_ERA5_FILE_NAME,
            source_type="reanalysis",
            parser_type="csv",
            source_label="sample_era5_reference",
            frame=era5_frame,
        )

    if not merra_exists:
        if era5_frame is None:
            era5_frame = _load_csv_frame(DEMO_ERA5_FILE_NAME, row_limit=DEMO_REFERENCE_ROW_LIMIT)
        merra_frame = _build_demo_merra_frame(era5_frame)
        await _create_dataset(
            db,
            project_id=project.id,
            dataset_name=DEMO_MERRA_DATASET_NAME,
            file_name=DEMO_MERRA_FILE_NAME,
            source_type="reanalysis",
            parser_type="synthetic",
            source_label="derived_merra_reference",
            frame=merra_frame,
        )

    await db.commit()
    await db.refresh(project)
    return project