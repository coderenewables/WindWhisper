from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import DataColumn, Dataset, Flag, FlagRule, FlaggedRange, TimeseriesData
from app.schemas.qc import FlagRuleCreate


@dataclass(slots=True)
class LoadedDatasetFrame:
    dataset: Dataset
    columns_by_id: dict[uuid.UUID, DataColumn]
    frame: pd.DataFrame


def icing_rules(temperature_column_id: uuid.UUID, speed_sd_column_id: uuid.UUID) -> list[FlagRuleCreate]:
    return [
        FlagRuleCreate(column_id=temperature_column_id, operator="<", value=2, logic="AND", group_index=1, order_index=1),
        FlagRuleCreate(column_id=speed_sd_column_id, operator="==", value=0, logic="AND", group_index=1, order_index=2),
    ]


def range_check(column_id: uuid.UUID, minimum: float, maximum: float) -> list[FlagRuleCreate]:
    return [
        FlagRuleCreate(column_id=column_id, operator="between", value=[minimum, maximum], logic="AND", group_index=1, order_index=1),
    ]


def flat_line(column_id: uuid.UUID, duration: int) -> list[FlagRuleCreate]:
    return [
        FlagRuleCreate(column_id=column_id, operator="==", value=0, logic="AND", group_index=1, order_index=1),
        FlagRuleCreate(column_id=column_id, operator=">=", value=duration, logic="AND", group_index=1, order_index=2),
    ]


async def get_flag_or_404(db: AsyncSession, flag_id: uuid.UUID) -> Flag:
    statement = (
        select(Flag)
        .options(selectinload(Flag.rules), selectinload(Flag.ranges), selectinload(Flag.dataset).selectinload(Dataset.columns))
        .where(Flag.id == flag_id)
        .execution_options(populate_existing=True)
    )
    flag = (await db.execute(statement)).scalar_one_or_none()
    if flag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flag not found")
    return flag


async def get_dataset_or_404(db: AsyncSession, dataset_id: uuid.UUID) -> Dataset:
    statement = (
        select(Dataset)
        .options(
            selectinload(Dataset.columns),
            selectinload(Dataset.flags).selectinload(Flag.rules),
            selectinload(Dataset.flags).selectinload(Flag.ranges),
        )
        .where(Dataset.id == dataset_id)
        .execution_options(populate_existing=True)
    )
    dataset = (await db.execute(statement)).scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset


async def get_flagged_range_or_404(db: AsyncSession, range_id: uuid.UUID) -> FlaggedRange:
    flagged_range = await db.get(FlaggedRange, range_id)
    if flagged_range is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flagged range not found")
    return flagged_range


async def load_dataset_frame(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    *,
    column_ids: list[uuid.UUID] | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> LoadedDatasetFrame:
    dataset = await get_dataset_or_404(db, dataset_id)
    selected_columns = dataset.columns
    if column_ids is not None:
        selected_columns = [column for column in dataset.columns if column.id in column_ids]

    statement = select(TimeseriesData.timestamp, TimeseriesData.values_json).where(TimeseriesData.dataset_id == dataset_id)
    if start is not None:
        statement = statement.where(TimeseriesData.timestamp >= start)
    if end is not None:
        statement = statement.where(TimeseriesData.timestamp <= end)

    rows = (await db.execute(statement.order_by(TimeseriesData.timestamp.asc()))).all()

    column_names = [column.name for column in selected_columns]
    records: list[dict[str, Any]] = []
    for timestamp, values_json in rows:
        record = {"timestamp": timestamp}
        for column_name in column_names:
            record[column_name] = values_json.get(column_name)
        records.append(record)

    if records:
        frame = pd.DataFrame.from_records(records)
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
        frame = frame.set_index("timestamp").sort_index()
        frame = frame.apply(pd.to_numeric, errors="coerce")
    else:
        frame = pd.DataFrame(columns=column_names)
        frame.index = pd.DatetimeIndex([], name="timestamp", tz="UTC")

    return LoadedDatasetFrame(
        dataset=dataset,
        columns_by_id={column.id: column for column in selected_columns},
        frame=frame,
    )


async def filter_flagged_data(
    db: AsyncSession,
    frame: pd.DataFrame,
    dataset_id: uuid.UUID,
    columns_by_id: dict[uuid.UUID, DataColumn],
    exclude_flag_ids: list[uuid.UUID] | None,
) -> pd.DataFrame:
    if frame.empty or not exclude_flag_ids:
        return frame

    rows = (
        await db.execute(
            select(FlaggedRange)
            .join(Flag, Flag.id == FlaggedRange.flag_id)
            .where(Flag.dataset_id == dataset_id, FlaggedRange.flag_id.in_(exclude_flag_ids))
            .order_by(FlaggedRange.start_time.asc(), FlaggedRange.id.asc()),
        )
    ).scalars().all()
    if not rows:
        return frame

    filtered = frame.copy()
    column_names_by_id = {column_id: column.name for column_id, column in columns_by_id.items()}
    for flagged_range in rows:
        mask = (filtered.index >= flagged_range.start_time) & (filtered.index <= flagged_range.end_time)
        if not mask.any():
            continue

        if flagged_range.column_ids:
            target_columns = [column_names_by_id[column_id] for column_id in flagged_range.column_ids if column_id in column_names_by_id]
            if target_columns:
                filtered.loc[mask, target_columns] = pd.NA
            continue

        filtered.loc[mask, :] = pd.NA

    return filtered


async def get_clean_dataframe(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    *,
    column_ids: list[uuid.UUID] | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    exclude_flag_ids: list[uuid.UUID] | None = None,
) -> pd.DataFrame:
    loaded = await load_dataset_frame(db, dataset_id, column_ids=column_ids, start=start, end=end)
    return await filter_flagged_data(db, loaded.frame, dataset_id, loaded.columns_by_id, exclude_flag_ids)


def _expected_gap_tolerance(dataset: Dataset, frame: pd.DataFrame) -> timedelta:
    if dataset.time_step_seconds:
        return timedelta(seconds=max(dataset.time_step_seconds, 1) * 1.5)
    if len(frame.index) > 1:
        deltas = frame.index.to_series().diff().dropna()
        if not deltas.empty:
            median_delta = deltas.median()
            return median_delta * 1.5
    return timedelta(minutes=15)


def _evaluate_rule(series: pd.Series, operator: str, value: Any) -> pd.Series:
    if operator == "==":
        return series == value
    if operator == "!=":
        return series != value
    if operator == "<":
        return series < value
    if operator == ">":
        return series > value
    if operator == "<=":
        return series <= value
    if operator == ">=":
        return series >= value
    if operator == "between":
        lower, upper = value
        return series.between(lower, upper, inclusive="both")
    if operator == "is_null":
        return series.isna()
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported operator: {operator}")


def _merge_mask_to_ranges(mask: pd.Series, tolerance: timedelta) -> list[tuple[datetime, datetime]]:
    active_timestamps = [timestamp.to_pydatetime() for timestamp, is_flagged in mask.items() if bool(is_flagged)]
    if not active_timestamps:
        return []

    merged: list[tuple[datetime, datetime]] = []
    range_start = active_timestamps[0]
    range_end = active_timestamps[0]

    for timestamp in active_timestamps[1:]:
        if timestamp - range_end <= tolerance:
            range_end = timestamp
            continue
        merged.append((range_start, range_end))
        range_start = timestamp
        range_end = timestamp

    merged.append((range_start, range_end))
    return merged


def serialize_rule(rule: FlagRule, columns_by_id: dict[uuid.UUID, DataColumn]) -> dict[str, Any]:
    payload = dict(rule.rule_json)
    column = columns_by_id.get(uuid.UUID(str(payload["column_id"]))) if payload.get("column_id") else None
    payload["column_name"] = column.name if column else None
    return payload


async def apply_rules(db: AsyncSession, dataset_id: uuid.UUID, flag_id: uuid.UUID) -> list[FlaggedRange]:
    loaded = await load_dataset_frame(db, dataset_id)
    flag = await get_flag_or_404(db, flag_id)
    if flag.dataset_id != dataset_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Flag does not belong to this dataset")
    if not flag.rules:
        return []

    if loaded.frame.empty:
        await db.execute(delete(FlaggedRange).where(FlaggedRange.flag_id == flag_id, FlaggedRange.applied_by == "auto"))
        await db.commit()
        return []

    grouped_rules: dict[int, list[FlagRule]] = {}
    involved_column_ids: list[uuid.UUID] = []
    for rule in sorted(
        flag.rules,
        key=lambda item: (
            int(item.rule_json.get("group_index", 1)),
            int(item.rule_json.get("order_index", 1)),
            str(item.id),
        ),
    ):
        grouped_rules.setdefault(int(rule.rule_json.get("group_index", 1)), []).append(rule)

    group_masks: list[pd.Series] = []
    for group_rules in grouped_rules.values():
        group_mask: pd.Series | None = None
        for rule in group_rules:
            rule_json = rule.rule_json
            column_id = uuid.UUID(str(rule_json["column_id"]))
            column = loaded.columns_by_id.get(column_id)
            if column is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rule references a missing dataset column")
            series = loaded.frame[column.name]
            rule_mask = _evaluate_rule(series, str(rule_json["operator"]), rule_json.get("value")).fillna(False)
            if group_mask is None:
                group_mask = rule_mask
            elif str(rule_json.get("logic", "AND")).upper() == "OR":
                group_mask = group_mask | rule_mask
            else:
                group_mask = group_mask & rule_mask
            involved_column_ids.append(column_id)

        if group_mask is not None:
            group_masks.append(group_mask)

    if not group_masks:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Flag has no valid rules to apply")

    combined_mask = group_masks[0]
    for group_mask in group_masks[1:]:
        combined_mask = combined_mask | group_mask

    tolerance = _expected_gap_tolerance(loaded.dataset, loaded.frame)
    merged_ranges = _merge_mask_to_ranges(combined_mask, tolerance)

    await db.execute(delete(FlaggedRange).where(FlaggedRange.flag_id == flag_id, FlaggedRange.applied_by == "auto"))
    created_ranges: list[FlaggedRange] = []
    for start_time, end_time in merged_ranges:
        flagged_range = FlaggedRange(
            flag_id=flag_id,
            start_time=start_time,
            end_time=end_time,
            applied_by="auto",
            column_ids=involved_column_ids or None,
        )
        db.add(flagged_range)
        created_ranges.append(flagged_range)

    await db.commit()
    for flagged_range in created_ranges:
        await db.refresh(flagged_range)
    return created_ranges
