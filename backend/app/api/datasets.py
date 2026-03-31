from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Annotated, Any

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import DataColumn, Dataset, Project, TimeseriesData
from app.schemas.history import ChangeLogListResponse, ChangeLogResponse, UndoResponse
from app.schemas.timeseries import (
    DatasetColumnResponse,
    DatasetDetailResponse,
    DatasetListResponse,
    DatasetSummaryResponse,
    TimeSeriesColumnResponse,
    TimeSeriesResponse,
)
from app.services.history import get_history, undo_last
from app.services.qc_engine import get_clean_dataframe


router = APIRouter(prefix="/api", tags=["datasets"])
DbSession = Annotated[AsyncSession, Depends(get_db)]
MAX_TIMESERIES_POINTS = 5000


def _serialize_column(column: DataColumn) -> DatasetColumnResponse:
    return DatasetColumnResponse(
        id=column.id,
        name=column.name,
        unit=column.unit,
        measurement_type=column.measurement_type,
        height_m=column.height_m,
        sensor_info=column.sensor_info,
    )


def _serialize_dataset(
    dataset: Dataset,
    *,
    column_count: int = 0,
    row_count: int = 0,
) -> DatasetSummaryResponse:
    return DatasetSummaryResponse(
        id=dataset.id,
        project_id=dataset.project_id,
        name=dataset.name,
        source_type=dataset.source_type,
        file_name=dataset.file_name,
        time_step_seconds=dataset.time_step_seconds,
        start_time=dataset.start_time,
        end_time=dataset.end_time,
        created_at=dataset.created_at,
        column_count=column_count,
        row_count=row_count,
    )


def _serialize_change(change: object) -> ChangeLogResponse:
    return ChangeLogResponse(
        id=getattr(change, "id"),
        dataset_id=getattr(change, "dataset_id"),
        action_type=getattr(change, "action_type"),
        description=getattr(change, "description"),
        before_state=getattr(change, "before_state"),
        after_state=getattr(change, "after_state"),
        created_at=getattr(change, "created_at"),
    )


def _coerce_float(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_column_ids(raw_column_ids: str | None) -> list[uuid.UUID] | None:
    if raw_column_ids is None or not raw_column_ids.strip():
        return None

    parsed_ids: list[uuid.UUID] = []
    for item in raw_column_ids.split(","):
        try:
            parsed_ids.append(uuid.UUID(item.strip()))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid column id: {item.strip()}",
            ) from exc
    return parsed_ids


def _parse_flag_ids(raw_flag_ids: str | None) -> list[uuid.UUID] | None:
    if raw_flag_ids is None or not raw_flag_ids.strip():
        return None

    parsed_ids: list[uuid.UUID] = []
    for item in raw_flag_ids.split(","):
        try:
            parsed_ids.append(uuid.UUID(item.strip()))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid flag id: {item.strip()}",
            ) from exc
    return parsed_ids


def _apply_resample(frame: pd.DataFrame, resample_rule: str | None) -> tuple[pd.DataFrame, str | None]:
    applied_rule = resample_rule
    if resample_rule:
        try:
            frame = frame.resample(resample_rule).mean(numeric_only=True)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid resample rule: {resample_rule}",
            ) from exc

    if len(frame) > MAX_TIMESERIES_POINTS and len(frame.index) > 1:
        span_seconds = max(1, int((frame.index.max() - frame.index.min()).total_seconds()))
        bucket_seconds = max(1, math.ceil(span_seconds / MAX_TIMESERIES_POINTS))
        auto_rule = f"{bucket_seconds}s"
        frame = frame.resample(auto_rule).mean(numeric_only=True)
        applied_rule = applied_rule or auto_rule

    if applied_rule:
        return frame.dropna(how="all"), applied_rule
    return frame, applied_rule


async def _get_dataset_or_404(db: AsyncSession, dataset_id: uuid.UUID) -> Dataset:
    statement = (
        select(Dataset)
        .options(selectinload(Dataset.columns))
        .where(Dataset.id == dataset_id)
        .execution_options(populate_existing=True)
    )
    dataset = (await db.execute(statement)).scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset


@router.get("/projects/{project_id}/datasets", response_model=DatasetListResponse)
async def list_project_datasets(project_id: uuid.UUID, db: DbSession) -> DatasetListResponse:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    column_count_subquery = (
        select(DataColumn.dataset_id, func.count(DataColumn.id).label("column_count"))
        .group_by(DataColumn.dataset_id)
        .subquery()
    )
    row_count_subquery = (
        select(TimeseriesData.dataset_id, func.count(TimeseriesData.id).label("row_count"))
        .group_by(TimeseriesData.dataset_id)
        .subquery()
    )

    statement = (
        select(
            Dataset,
            func.coalesce(column_count_subquery.c.column_count, 0),
            func.coalesce(row_count_subquery.c.row_count, 0),
        )
        .outerjoin(column_count_subquery, column_count_subquery.c.dataset_id == Dataset.id)
        .outerjoin(row_count_subquery, row_count_subquery.c.dataset_id == Dataset.id)
        .where(Dataset.project_id == project_id)
        .order_by(Dataset.created_at.desc(), Dataset.id.desc())
    )
    rows = (await db.execute(statement)).all()

    return DatasetListResponse(
        datasets=[
            _serialize_dataset(dataset, column_count=column_count, row_count=row_count)
            for dataset, column_count, row_count in rows
        ],
        total=len(rows),
    )


@router.get("/datasets/{dataset_id}", response_model=DatasetDetailResponse)
async def get_dataset(dataset_id: uuid.UUID, db: DbSession) -> DatasetDetailResponse:
    dataset = await _get_dataset_or_404(db, dataset_id)
    row_count = await db.scalar(select(func.count(TimeseriesData.id)).where(TimeseriesData.dataset_id == dataset.id))

    summary = _serialize_dataset(dataset, column_count=len(dataset.columns), row_count=row_count or 0)
    return DatasetDetailResponse(**summary.model_dump(), columns=[_serialize_column(column) for column in dataset.columns])


@router.get("/datasets/{dataset_id}/history", response_model=ChangeLogListResponse)
async def get_dataset_history(dataset_id: uuid.UUID, db: DbSession) -> ChangeLogListResponse:
    changes = await get_history(db, dataset_id)
    return ChangeLogListResponse(changes=[_serialize_change(change) for change in changes], total=len(changes))


@router.post("/datasets/{dataset_id}/undo", response_model=UndoResponse)
async def undo_dataset_change(dataset_id: uuid.UUID, db: DbSession) -> UndoResponse:
    change = await undo_last(db, dataset_id)
    return UndoResponse(undone_change=_serialize_change(change))


@router.get("/datasets/{dataset_id}/timeseries", response_model=TimeSeriesResponse)
async def get_dataset_timeseries(
    dataset_id: uuid.UUID,
    db: DbSession,
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    columns: str | None = Query(default=None),
    resample: str | None = Query(default=None),
    exclude_flags: str | None = Query(default=None),
) -> TimeSeriesResponse:
    dataset = await _get_dataset_or_404(db, dataset_id)
    requested_column_ids = _parse_column_ids(columns)
    excluded_flag_ids = _parse_flag_ids(exclude_flags)

    selected_columns = dataset.columns
    if requested_column_ids is not None:
        selected_columns = [column for column in dataset.columns if column.id in requested_column_ids]
        if len(selected_columns) != len(requested_column_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more requested columns do not belong to this dataset",
            )

    if not selected_columns:
        return TimeSeriesResponse(
            dataset_id=dataset.id,
            resample=resample,
            excluded_flag_ids=excluded_flag_ids or [],
            start_time=start,
            end_time=end,
            timestamps=[],
            columns={
                str(column.id): TimeSeriesColumnResponse(
                    name=column.name,
                    unit=column.unit,
                    measurement_type=column.measurement_type,
                    values=[],
                )
                for column in selected_columns
            },
        )

    frame = await get_clean_dataframe(
        db,
        dataset.id,
        column_ids=[column.id for column in selected_columns],
        start=start,
        end=end,
        exclude_flag_ids=excluded_flag_ids,
    )

    if frame.empty:
        return TimeSeriesResponse(
            dataset_id=dataset.id,
            resample=resample,
            excluded_flag_ids=excluded_flag_ids or [],
            start_time=start,
            end_time=end,
            timestamps=[],
            columns={
                str(column.id): TimeSeriesColumnResponse(
                    name=column.name,
                    unit=column.unit,
                    measurement_type=column.measurement_type,
                    values=[],
                )
                for column in selected_columns
            },
        )

    frame, applied_resample = _apply_resample(frame, resample)

    timestamps = list(frame.index.to_pydatetime())
    column_payload = {
        str(column.id): TimeSeriesColumnResponse(
            name=column.name,
            unit=column.unit,
            measurement_type=column.measurement_type,
            values=[_coerce_float(value) for value in frame[column.name].tolist()] if column.name in frame.columns else [],
        )
        for column in selected_columns
    }

    return TimeSeriesResponse(
        dataset_id=dataset.id,
        resample=applied_resample,
        excluded_flag_ids=excluded_flag_ids or [],
        start_time=timestamps[0] if timestamps else start,
        end_time=timestamps[-1] if timestamps else end,
        timestamps=timestamps,
        columns=column_payload,
    )


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(dataset_id: uuid.UUID, db: DbSession) -> None:
    dataset = await db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    
    await db.delete(dataset)
    await db.commit()

