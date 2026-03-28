from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChangeLog, DataColumn, Flag, FlagRule, FlaggedRange, TimeseriesData
from app.services.qc_engine import get_dataset_or_404


RECONSTRUCTION_ACTION_TYPE = "data_reconstructed"
FLAG_APPLIED_ACTION_TYPE = "flag_applied"
FLAG_REMOVED_ACTION_TYPE = "flag_removed"
COLUMN_ADDED_ACTION_TYPE = "column_added"


async def record_change(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    *,
    action_type: str,
    description: str,
    before_state: dict | None,
    after_state: dict | None,
) -> ChangeLog:
    change = ChangeLog(
        dataset_id=dataset_id,
        action_type=action_type,
        description=description,
        before_state=before_state,
        after_state=after_state,
    )
    db.add(change)
    await db.flush()
    return change


def serialize_flagged_range_snapshot(flagged_range: FlaggedRange) -> dict[str, object]:
    return {
        "id": str(flagged_range.id),
        "flag_id": str(flagged_range.flag_id),
        "start_time": flagged_range.start_time.isoformat(),
        "end_time": flagged_range.end_time.isoformat(),
        "applied_by": flagged_range.applied_by,
        "column_ids": [str(column_id) for column_id in flagged_range.column_ids] if flagged_range.column_ids else None,
    }


def serialize_flag_rule_snapshot(rule: FlagRule) -> dict[str, object]:
    return {
        "id": str(rule.id),
        "flag_id": str(rule.flag_id),
        "rule_json": dict(rule.rule_json),
    }


def serialize_flag_snapshot(flag: Flag) -> dict[str, object]:
    return {
        "id": str(flag.id),
        "dataset_id": str(flag.dataset_id),
        "name": flag.name,
        "color": flag.color,
        "description": flag.description,
        "rules": [serialize_flag_rule_snapshot(rule) for rule in flag.rules],
        "ranges": [serialize_flagged_range_snapshot(flagged_range) for flagged_range in flag.ranges],
    }


def serialize_column_snapshot(column: DataColumn) -> dict[str, object]:
    return {
        "id": str(column.id),
        "dataset_id": str(column.dataset_id),
        "name": column.name,
        "unit": column.unit,
        "measurement_type": column.measurement_type,
        "height_m": column.height_m,
        "sensor_info": column.sensor_info,
    }


async def get_history(db: AsyncSession, dataset_id: uuid.UUID) -> list[ChangeLog]:
    await get_dataset_or_404(db, dataset_id)
    rows = (
        await db.execute(
            select(ChangeLog)
            .where(ChangeLog.dataset_id == dataset_id)
            .order_by(ChangeLog.created_at.desc(), ChangeLog.id.desc())
            .execution_options(populate_existing=True),
        )
    ).scalars().all()
    return rows


async def _get_last_change_or_404(db: AsyncSession, dataset_id: uuid.UUID) -> ChangeLog:
    await get_dataset_or_404(db, dataset_id)
    change = (
        await db.execute(
            select(ChangeLog)
            .where(ChangeLog.dataset_id == dataset_id)
            .order_by(ChangeLog.created_at.desc(), ChangeLog.id.desc())
            .limit(1)
            .execution_options(populate_existing=True),
        )
    ).scalar_one_or_none()
    if change is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No changes recorded for this dataset")
    return change


def _parse_timestamp(raw_timestamp: str) -> datetime:
    normalized = raw_timestamp.replace("Z", "+00:00") if raw_timestamp.endswith("Z") else raw_timestamp
    return datetime.fromisoformat(normalized)


async def _restore_flagged_range(db: AsyncSession, snapshot: dict) -> None:
    flagged_range = await db.get(FlaggedRange, uuid.UUID(str(snapshot["id"])))
    if flagged_range is None:
        flagged_range = FlaggedRange(
            id=uuid.UUID(str(snapshot["id"])),
            flag_id=uuid.UUID(str(snapshot["flag_id"])),
            start_time=_parse_timestamp(str(snapshot["start_time"])),
            end_time=_parse_timestamp(str(snapshot["end_time"])),
            applied_by=str(snapshot["applied_by"]),
            column_ids=[uuid.UUID(str(column_id)) for column_id in snapshot["column_ids"]] if snapshot.get("column_ids") else None,
        )
        db.add(flagged_range)
        return

    flagged_range.flag_id = uuid.UUID(str(snapshot["flag_id"]))
    flagged_range.start_time = _parse_timestamp(str(snapshot["start_time"]))
    flagged_range.end_time = _parse_timestamp(str(snapshot["end_time"]))
    flagged_range.applied_by = str(snapshot["applied_by"])
    flagged_range.column_ids = [uuid.UUID(str(column_id)) for column_id in snapshot["column_ids"]] if snapshot.get("column_ids") else None


async def _restore_flag_snapshot(db: AsyncSession, snapshot: dict) -> None:
    flag_id = uuid.UUID(str(snapshot["id"]))
    flag = await db.get(Flag, flag_id)
    if flag is None:
        flag = Flag(
            id=flag_id,
            dataset_id=uuid.UUID(str(snapshot["dataset_id"])),
            name=str(snapshot["name"]),
            color=snapshot.get("color"),
            description=snapshot.get("description"),
        )
        db.add(flag)
        await db.flush()
    else:
        flag.dataset_id = uuid.UUID(str(snapshot["dataset_id"]))
        flag.name = str(snapshot["name"])
        flag.color = snapshot.get("color")
        flag.description = snapshot.get("description")
        existing_rules = (await db.execute(select(FlagRule).where(FlagRule.flag_id == flag.id))).scalars().all()
        existing_ranges = (await db.execute(select(FlaggedRange).where(FlaggedRange.flag_id == flag.id))).scalars().all()
        for existing_rule in existing_rules:
            await db.delete(existing_rule)
        for existing_range in existing_ranges:
            await db.delete(existing_range)
        await db.flush()

    for rule_snapshot in snapshot.get("rules", []):
        db.add(
            FlagRule(
                id=uuid.UUID(str(rule_snapshot["id"])),
                flag_id=flag.id,
                rule_json=dict(rule_snapshot["rule_json"]),
            ),
        )

    for range_snapshot in snapshot.get("ranges", []):
        await _restore_flagged_range(db, dict(range_snapshot))


async def _delete_flag_snapshot(db: AsyncSession, snapshot: dict) -> None:
    flag = await db.get(Flag, uuid.UUID(str(snapshot["id"])))
    if flag is not None:
        await db.delete(flag)


async def _delete_flagged_ranges_by_id(db: AsyncSession, snapshots: list[dict]) -> None:
    for snapshot in snapshots:
        flagged_range = await db.get(FlaggedRange, uuid.UUID(str(snapshot["id"])))
        if flagged_range is not None:
            await db.delete(flagged_range)


async def _undo_created_column_change(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    change: ChangeLog,
    *,
    error_detail: str,
) -> None:
    before_state = change.before_state or {}
    created_column = before_state.get("created_column")
    changes = before_state.get("changes")
    if not isinstance(created_column, dict) or not isinstance(changes, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_detail)

    column_id = uuid.UUID(str(created_column["id"]))
    column_name = str(created_column["name"])
    rows = (
        await db.execute(
            select(TimeseriesData).where(TimeseriesData.dataset_id == dataset_id).order_by(TimeseriesData.timestamp.asc()),
        )
    ).scalars().all()
    rows_by_timestamp = {row.timestamp: row for row in rows}

    for entry in changes:
        if not isinstance(entry, dict):
            continue
        timestamp = _parse_timestamp(str(entry["timestamp"]))
        row = rows_by_timestamp.get(timestamp)
        if row is None:
            continue
        row_existed = bool(entry.get("row_existed", False))
        previous_had_key = bool(entry.get("previous_had_key", False))
        previous_value = entry.get("previous_value")

        if not row_existed:
            await db.delete(row)
            continue

        updated = dict(row.values_json)
        if previous_had_key:
            updated[column_name] = previous_value
        else:
            updated.pop(column_name, None)
        row.values_json = updated

    column = await db.get(DataColumn, column_id)
    if column is not None:
        await db.delete(column)


async def _undo_reconstruction_new_column(db: AsyncSession, dataset_id: uuid.UUID, change: ChangeLog) -> None:
    await _undo_created_column_change(
        db,
        dataset_id,
        change,
        error_detail="Change log does not contain reversible new-column reconstruction state",
    )


async def _undo_column_added(db: AsyncSession, dataset_id: uuid.UUID, change: ChangeLog) -> None:
    await _undo_created_column_change(
        db,
        dataset_id,
        change,
        error_detail="Change log does not contain reversible created-column state",
    )


async def _undo_flag_applied(db: AsyncSession, change: ChangeLog) -> None:
    before_state = change.before_state or {}
    mode = before_state.get("mode")
    if mode == "range_add":
        await _delete_flagged_ranges_by_id(db, list(before_state.get("ranges_added", [])))
        return
    if mode == "auto_ranges_replace":
        after_state = change.after_state or {}
        await _delete_flagged_ranges_by_id(db, list(after_state.get("ranges", [])))
        for snapshot in before_state.get("ranges", []):
            await _restore_flagged_range(db, dict(snapshot))
        return
    if mode == "flag_state_replace":
        previous_flag = before_state.get("flag")
        if previous_flag is None:
            after_state = change.after_state or {}
            current_flag = after_state.get("flag")
            if isinstance(current_flag, dict):
                await _delete_flag_snapshot(db, current_flag)
            return
        if isinstance(previous_flag, dict):
            await _restore_flag_snapshot(db, previous_flag)
            return
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Undo is not implemented for flag application mode: {mode}")


async def _undo_flag_removed(db: AsyncSession, change: ChangeLog) -> None:
    before_state = change.before_state or {}
    mode = before_state.get("mode")
    if mode == "range_remove":
        removed_range = before_state.get("range")
        if isinstance(removed_range, dict):
            await _restore_flagged_range(db, removed_range)
            return
    if mode == "flag_remove":
        removed_flag = before_state.get("flag")
        if isinstance(removed_flag, dict):
            await _restore_flag_snapshot(db, removed_flag)
            return
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Undo is not implemented for flag removal mode: {mode}")


async def _undo_reconstruction_overwrite(db: AsyncSession, dataset_id: uuid.UUID, change: ChangeLog) -> None:
    before_state = change.before_state or {}
    column_name = before_state.get("column_name")
    changes = before_state.get("changes")
    if not isinstance(column_name, str) or not isinstance(changes, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Change log does not contain reversible reconstruction state")

    rows = (
        await db.execute(
            select(TimeseriesData).where(TimeseriesData.dataset_id == dataset_id).order_by(TimeseriesData.timestamp.asc()),
        )
    ).scalars().all()
    rows_by_timestamp = {row.timestamp: row for row in rows}

    for entry in changes:
        if not isinstance(entry, dict):
            continue

        timestamp_raw = entry.get("timestamp")
        if not isinstance(timestamp_raw, str):
            continue
        timestamp = _parse_timestamp(timestamp_raw)

        row_existed = bool(entry.get("row_existed", False))
        previous_had_key = bool(entry.get("previous_had_key", False))
        previous_value = entry.get("previous_value")
        row = rows_by_timestamp.get(timestamp)

        if not row_existed:
            if row is not None:
                await db.delete(row)
            continue

        if row is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot undo change because one or more original rows are missing")

        updated = dict(row.values_json)
        if previous_had_key:
            updated[column_name] = previous_value
        else:
            updated.pop(column_name, None)
        row.values_json = updated


async def undo_last(db: AsyncSession, dataset_id: uuid.UUID) -> ChangeLog:
    change = await _get_last_change_or_404(db, dataset_id)

    if change.action_type == RECONSTRUCTION_ACTION_TYPE:
        before_state = change.before_state or {}
        mode = before_state.get("save_mode")
        if mode == "overwrite":
            await _undo_reconstruction_overwrite(db, dataset_id, change)
        elif mode == "new_column":
            await _undo_reconstruction_new_column(db, dataset_id, change)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Undo is not implemented for reconstruction mode: {mode}")
    elif change.action_type == FLAG_APPLIED_ACTION_TYPE:
        await _undo_flag_applied(db, change)
    elif change.action_type == FLAG_REMOVED_ACTION_TYPE:
        await _undo_flag_removed(db, change)
    elif change.action_type == COLUMN_ADDED_ACTION_TYPE:
        await _undo_column_added(db, dataset_id, change)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Undo is not implemented for action type: {change.action_type}")

    await db.delete(change)
    await db.commit()
    return change