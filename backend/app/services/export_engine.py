from __future__ import annotations

import json
import math
import re
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import UTC, datetime
from io import StringIO
from typing import Any

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import Float, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import DataColumn, Dataset, Project, TimeseriesData
from app.services.qc_engine import get_clean_dataframe
from app.services.weibull import fit_weibull


@dataclass(slots=True)
class ExportedArtifact:
    content: bytes
    file_name: str
    media_type: str


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "windwhisper-export"


async def _load_dataset_with_project(db: AsyncSession, dataset_id: uuid.UUID) -> Dataset:
    statement = (
        select(Dataset)
        .options(selectinload(Dataset.columns), selectinload(Dataset.project))
        .where(Dataset.id == dataset_id)
        .execution_options(populate_existing=True)
    )
    dataset = (await db.execute(statement)).scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset


def _select_columns(dataset: Dataset, column_ids: list[uuid.UUID] | None) -> list[DataColumn]:
    if not column_ids:
        return list(dataset.columns)

    requested = set(column_ids)
    selected = [column for column in dataset.columns if column.id in requested]
    if len(selected) != len(requested):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more requested columns do not belong to this dataset",
        )
    return selected


def _resolve_column(dataset: Dataset, column_id: uuid.UUID, label: str) -> DataColumn:
    for column in dataset.columns:
        if column.id == column_id:
            return column
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} does not belong to this dataset")


def _apply_resample(frame: pd.DataFrame, resample_rule: str | None) -> pd.DataFrame:
    if not resample_rule:
        return frame

    try:
        return frame.resample(resample_rule).mean(numeric_only=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid resample rule: {resample_rule}",
        ) from exc


def _serialize_scalar(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _serialize_scalar(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_serialize_scalar(item) for item in value]
    if isinstance(value, tuple):
        return [_serialize_scalar(item) for item in value]
    if isinstance(value, np.generic):
        return _serialize_scalar(value.item())
    if pd.isna(value):
        return None
    return value


def _base_file_stem(project: Project | None, dataset: Dataset) -> str:
    project_name = _slugify(project.name) if project is not None else "project"
    dataset_name = _slugify(dataset.name)
    return f"{project_name}-{dataset_name}"


def _csv_file_name(project: Project | None, dataset: Dataset) -> str:
    return f"{_base_file_stem(project, dataset)}-clean.csv"


def _tab_file_name(project: Project | None, dataset: Dataset) -> str:
    return f"{_base_file_stem(project, dataset)}-wasp.tab"


def _json_file_name(project: Project | None, dataset: Dataset) -> str:
    return f"{_base_file_stem(project, dataset)}-iea-task43.json"


def _openwind_file_name(project: Project | None, dataset: Dataset) -> str:
    return f"{_base_file_stem(project, dataset)}-openwind.csv"


def _kml_file_name(projects: list[Project]) -> str:
    if len(projects) == 1:
        return f"{_slugify(projects[0].name)}.kml"
    return "windwhisper-projects.kml"


def _sector_index(direction: pd.Series, sector_width: float) -> pd.Series:
    shifted = (direction + (sector_width / 2.0)) % 360.0
    return np.floor(shifted / sector_width).astype(int)


async def _load_projects_for_kml(db: AsyncSession, project_ids: list[uuid.UUID] | None) -> list[Project]:
    statement = (
        select(Project)
        .options(selectinload(Project.datasets).selectinload(Dataset.columns))
        .order_by(Project.created_at.desc(), Project.id.desc())
    )
    if project_ids:
        statement = statement.where(Project.id.in_(project_ids))

    projects = list((await db.execute(statement)).scalars().unique().all())
    if project_ids:
        requested = set(project_ids)
        found = {project.id for project in projects}
        if found != requested:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more requested projects were not found")

    return projects


def _pick_representative_speed_column(project: Project) -> DataColumn | None:
    speed_columns: list[tuple[datetime | None, float, DataColumn]] = []
    fallback_timestamp = datetime.min.replace(tzinfo=UTC)

    for dataset in project.datasets:
        for column in dataset.columns:
            if column.measurement_type == "speed":
                speed_columns.append((dataset.created_at or fallback_timestamp, float(column.height_m or 0.0), column))

    if not speed_columns:
        return None

    speed_columns.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return speed_columns[0][2]


async def _calculate_project_mean_speed(db: AsyncSession, project: Project) -> float | None:
    speed_column = _pick_representative_speed_column(project)
    if speed_column is None:
        return None

    speed_expression = cast(TimeseriesData.values_json[speed_column.name].astext, Float)
    statement = select(func.avg(speed_expression)).where(TimeseriesData.dataset_id == speed_column.dataset_id)
    mean_speed = await db.scalar(statement)
    return float(mean_speed) if mean_speed is not None else None


def _project_kml_description(project: Project, mean_speed: float | None) -> str:
    lines = [project.description or "WindWhisper project workspace"]
    if project.elevation is not None:
        lines.append(f"Elevation: {project.elevation:.1f} m")
    if mean_speed is not None:
        lines.append(f"Representative mean speed: {mean_speed:.2f} m/s")
    lines.append(f"Datasets: {len(project.datasets)}")
    return "\n".join(lines)


async def _get_export_frame(
    db: AsyncSession,
    dataset: Dataset,
    *,
    selected_columns: list[DataColumn],
    exclude_flag_ids: list[uuid.UUID] | None = None,
    resample: str | None = None,
) -> pd.DataFrame:
    frame = await get_clean_dataframe(
        db,
        dataset.id,
        column_ids=[column.id for column in selected_columns],
        exclude_flag_ids=exclude_flag_ids,
    )
    frame = _apply_resample(frame, resample)
    return frame.reindex(columns=[column.name for column in selected_columns]).copy()


async def export_csv(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    *,
    column_ids: list[uuid.UUID] | None = None,
    exclude_flag_ids: list[uuid.UUID] | None = None,
    resample: str | None = None,
) -> ExportedArtifact:
    dataset = await _load_dataset_with_project(db, dataset_id)
    project = dataset.project
    selected_columns = _select_columns(dataset, column_ids)

    export_frame = await _get_export_frame(
        db,
        dataset,
        selected_columns=selected_columns,
        exclude_flag_ids=exclude_flag_ids,
        resample=resample,
    )
    export_frame.index.name = "timestamp"

    buffer = StringIO()
    export_frame.reset_index().to_csv(buffer, index=False, na_rep="")
    return ExportedArtifact(
        content=buffer.getvalue().encode("utf-8"),
        file_name=_csv_file_name(project, dataset),
        media_type="text/csv; charset=utf-8",
    )


async def export_wasp_tab(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    *,
    speed_column_id: uuid.UUID,
    direction_column_id: uuid.UUID,
    exclude_flag_ids: list[uuid.UUID] | None = None,
    num_sectors: int = 12,
    speed_bin_width: float = 1.0,
) -> ExportedArtifact:
    dataset = await _load_dataset_with_project(db, dataset_id)
    project = dataset.project
    speed_column = _resolve_column(dataset, speed_column_id, "speed_column_id")
    direction_column = _resolve_column(dataset, direction_column_id, "direction_column_id")

    if speed_column.measurement_type != "speed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="speed_column_id must reference a wind speed column")
    if direction_column.measurement_type != "direction":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="direction_column_id must reference a wind direction column")

    frame = await get_clean_dataframe(
        db,
        dataset.id,
        column_ids=[speed_column.id, direction_column.id],
        exclude_flag_ids=exclude_flag_ids,
    )
    rose_frame = frame[[direction_column.name, speed_column.name]].rename(
        columns={direction_column.name: "direction", speed_column.name: "speed"},
    )
    rose_frame = rose_frame.dropna(subset=["direction", "speed"])
    if rose_frame.empty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No paired wind direction and speed samples are available for export",
        )

    rose_frame["direction"] = rose_frame["direction"].mod(360.0)
    sector_width = 360.0 / float(num_sectors)
    rose_frame["sector_index"] = _sector_index(rose_frame["direction"], sector_width)

    max_speed = float(rose_frame["speed"].max())
    bin_count = max(1, int(math.ceil(max_speed / speed_bin_width)))
    bin_edges = np.arange(0.0, (bin_count + 1) * speed_bin_width, speed_bin_width, dtype=float)
    total_count = int(len(rose_frame.index))

    lines = [
        f"Station: {dataset.name}",
        f"{float(project.latitude or 0.0) if project is not None else 0.0:.6f} {float(project.longitude or 0.0) if project is not None else 0.0:.6f} {float(project.elevation or 0.0) if project is not None else 0.0:.3f} {float(speed_column.height_m or 0.0):.3f}",
        f"{num_sectors} {bin_count}",
    ]

    for sector_index in range(num_sectors):
        sector_rows = rose_frame.loc[rose_frame["sector_index"] == sector_index]
        sector_frequency_pct = (float(len(sector_rows.index)) / float(total_count) * 100.0) if total_count else 0.0
        histogram_counts, _ = np.histogram(sector_rows["speed"].to_numpy(dtype=float), bins=bin_edges)
        histogram_frequency_pct = [(float(count) / float(total_count) * 100.0) if total_count else 0.0 for count in histogram_counts]

        positive_speeds = sector_rows.loc[sector_rows["speed"] > 0.0, "speed"].to_numpy(dtype=float)
        if len(positive_speeds) >= 2:
            fit = fit_weibull(positive_speeds, method="mle")
            weibull_a = float(fit["A"])
            weibull_k = float(fit["k"])
        else:
            weibull_a = 0.0
            weibull_k = 0.0

        lines.append(
            " ".join(
                [
                    f"{sector_frequency_pct:.6f}",
                    *[f"{value:.6f}" for value in histogram_frequency_pct],
                    f"{weibull_a:.6f}",
                    f"{weibull_k:.6f}",
                ],
            ),
        )

    return ExportedArtifact(
        content=("\n".join(lines) + "\n").encode("utf-8"),
        file_name=_tab_file_name(project, dataset),
        media_type="text/plain; charset=utf-8",
    )


async def export_iea_json(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    *,
    column_ids: list[uuid.UUID] | None = None,
    exclude_flag_ids: list[uuid.UUID] | None = None,
    resample: str | None = None,
) -> ExportedArtifact:
    dataset = await _load_dataset_with_project(db, dataset_id)
    project = dataset.project
    selected_columns = _select_columns(dataset, column_ids)

    export_frame = await _get_export_frame(
        db,
        dataset,
        selected_columns=selected_columns,
        exclude_flag_ids=exclude_flag_ids,
        resample=resample,
    )

    time_series: list[dict[str, Any]] = []
    for timestamp, row in export_frame.iterrows():
        time_series.append(
            {
                "timestamp": timestamp.isoformat(),
                "values": {
                    column.name: _serialize_scalar(row[column.name])
                    for column in selected_columns
                },
            },
        )

    payload = {
        "schema": "iea-task-43-wra-data-model",
        "schema_version": "0.1",
        "exported_at": datetime.now(UTC).isoformat(),
        "project": {
            "id": str(project.id) if project is not None else None,
            "name": project.name if project is not None else None,
            "description": project.description if project is not None else None,
            "latitude": _serialize_scalar(project.latitude if project is not None else None),
            "longitude": _serialize_scalar(project.longitude if project is not None else None),
            "elevation": _serialize_scalar(project.elevation if project is not None else None),
        },
        "dataset": {
            "id": str(dataset.id),
            "project_id": str(dataset.project_id),
            "name": dataset.name,
            "source_type": dataset.source_type,
            "file_name": dataset.file_name,
            "time_step_seconds": dataset.time_step_seconds,
            "start_time": dataset.start_time.isoformat() if dataset.start_time is not None else None,
            "end_time": dataset.end_time.isoformat() if dataset.end_time is not None else None,
            "metadata": _serialize_scalar(dataset.metadata_json),
        },
        "filters": {
            "exclude_flag_ids": [str(flag_id) for flag_id in exclude_flag_ids or []],
            "resample": resample,
            "column_ids": [str(column.id) for column in selected_columns],
        },
        "measurement_configuration": {
            "columns": [
                {
                    "id": str(column.id),
                    "name": column.name,
                    "measurement_type": column.measurement_type,
                    "unit": column.unit,
                    "height_m": _serialize_scalar(column.height_m),
                    "sensor_info": _serialize_scalar(column.sensor_info),
                }
                for column in selected_columns
            ],
        },
        "time_series": time_series,
    }

    return ExportedArtifact(
        content=json.dumps(payload, indent=2).encode("utf-8"),
        file_name=_json_file_name(project, dataset),
        media_type="application/json; charset=utf-8",
    )


async def export_openwind(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    *,
    column_ids: list[uuid.UUID] | None = None,
    exclude_flag_ids: list[uuid.UUID] | None = None,
    resample: str | None = None,
) -> ExportedArtifact:
    dataset = await _load_dataset_with_project(db, dataset_id)
    project = dataset.project
    selected_columns = _select_columns(dataset, column_ids)

    export_frame = await _get_export_frame(
        db,
        dataset,
        selected_columns=selected_columns,
        exclude_flag_ids=exclude_flag_ids,
        resample=resample,
    )
    openwind_frame = export_frame.copy()
    openwind_frame.insert(0, "Time", openwind_frame.index.strftime("%H:%M:%S"))
    openwind_frame.insert(0, "Date", openwind_frame.index.strftime("%Y-%m-%d"))

    buffer = StringIO()
    openwind_frame.to_csv(buffer, index=False, na_rep="")
    return ExportedArtifact(
        content=buffer.getvalue().encode("utf-8"),
        file_name=_openwind_file_name(project, dataset),
        media_type="text/csv; charset=utf-8",
    )


async def export_kml(
    db: AsyncSession,
    *,
    project_ids: list[uuid.UUID] | None = None,
) -> ExportedArtifact:
    projects = await _load_projects_for_kml(db, project_ids)

    kml = ET.Element("kml", xmlns="http://www.opengis.net/kml/2.2")
    document = ET.SubElement(kml, "Document")
    ET.SubElement(document, "name").text = "WindWhisper Projects"

    if not projects:
        ET.indent(kml, space="  ")
        return ExportedArtifact(
            content=ET.tostring(kml, encoding="utf-8", xml_declaration=True),
            file_name="windwhisper_projects.kml",
            media_type="application/vnd.google-earth.kml+xml; charset=utf-8",
        )

    mapped_projects: list[Project] = []
    for project in projects:
        if project.latitude is None or project.longitude is None:
            continue

        mapped_projects.append(project)
        mean_speed = await _calculate_project_mean_speed(db, project)

        placemark = ET.SubElement(document, "Placemark")
        ET.SubElement(placemark, "name").text = project.name
        ET.SubElement(placemark, "description").text = _project_kml_description(project, mean_speed)
        point = ET.SubElement(placemark, "Point")
        ET.SubElement(point, "coordinates").text = (
            f"{float(project.longitude):.6f},{float(project.latitude):.6f},{float(project.elevation or 0.0):.3f}"
        )

    if not mapped_projects:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No selected projects include latitude and longitude coordinates")

    ET.indent(kml, space="  ")
    return ExportedArtifact(
        content=ET.tostring(kml, encoding="utf-8", xml_declaration=True),
        file_name=_kml_file_name(mapped_projects),
        media_type="application/vnd.google-earth.kml+xml; charset=utf-8",
    )