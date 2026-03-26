from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DataColumn, Flag, FlagRule, FlaggedRange
from app.schemas.qc import (
    FlagCreate,
    FlaggedRangeResponse,
    FlagResponse,
    FlagRuleCreate,
    FlagRuleResponse,
    FlagRuleUpdate,
    ManualFlagRequest,
)
from app.services.qc_engine import apply_rules, get_dataset_or_404, get_flag_or_404, get_flagged_range_or_404


router = APIRouter(prefix="/api/qc", tags=["qc"])
DbSession = Annotated[AsyncSession, Depends(get_db)]


def _serialize_flag(flag: Flag, rule_count: int = 0, flagged_count: int = 0) -> FlagResponse:
    return FlagResponse(
        id=flag.id,
        dataset_id=flag.dataset_id,
        name=flag.name,
        color=flag.color,
        description=flag.description,
        rule_count=rule_count,
        flagged_count=flagged_count,
    )


def _serialize_rule(rule: FlagRule) -> FlagRuleResponse:
    return FlagRuleResponse(
        id=rule.id,
        flag_id=rule.flag_id,
        column_id=uuid.UUID(str(rule.rule_json["column_id"])),
        operator=str(rule.rule_json["operator"]),
        value=rule.rule_json.get("value"),
        logic=rule.rule_json.get("logic", "AND"),
        group_index=int(rule.rule_json.get("group_index", 1)),
        order_index=int(rule.rule_json.get("order_index", 1)),
    )


def _serialize_flagged_range(flagged_range: FlaggedRange) -> FlaggedRangeResponse:
    return FlaggedRangeResponse(
        id=flagged_range.id,
        flag_id=flagged_range.flag_id,
        start_time=flagged_range.start_time,
        end_time=flagged_range.end_time,
        applied_by=flagged_range.applied_by,
        column_ids=flagged_range.column_ids,
    )


@router.post("/flags/{dataset_id}", response_model=FlagResponse, status_code=status.HTTP_201_CREATED)
async def create_flag(dataset_id: uuid.UUID, payload: FlagCreate, db: DbSession) -> FlagResponse:
    await get_dataset_or_404(db, dataset_id)
    flag = Flag(dataset_id=dataset_id, **payload.model_dump())
    db.add(flag)
    await db.commit()
    await db.refresh(flag)
    return _serialize_flag(flag)


@router.get("/flags/{dataset_id}", response_model=list[FlagResponse])
async def list_flags(dataset_id: uuid.UUID, db: DbSession) -> list[FlagResponse]:
    await get_dataset_or_404(db, dataset_id)
    rule_count_subquery = (
        select(FlagRule.flag_id, func.count(FlagRule.id).label("rule_count"))
        .group_by(FlagRule.flag_id)
        .subquery()
    )
    range_count_subquery = (
        select(FlaggedRange.flag_id, func.count(FlaggedRange.id).label("flagged_count"))
        .group_by(FlaggedRange.flag_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(
                Flag,
                func.coalesce(rule_count_subquery.c.rule_count, 0),
                func.coalesce(range_count_subquery.c.flagged_count, 0),
            )
            .outerjoin(rule_count_subquery, rule_count_subquery.c.flag_id == Flag.id)
            .outerjoin(range_count_subquery, range_count_subquery.c.flag_id == Flag.id)
            .where(Flag.dataset_id == dataset_id)
            .order_by(Flag.name.asc(), Flag.id.asc()),
        )
    ).all()
    return [_serialize_flag(flag, rule_count=rule_count, flagged_count=flagged_count) for flag, rule_count, flagged_count in rows]


@router.delete("/flags/{flag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flag(flag_id: uuid.UUID, db: DbSession) -> Response:
    flag = await get_flag_or_404(db, flag_id)
    await db.delete(flag)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/flags/{flag_id}/rules", response_model=FlagRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_flag_rule(flag_id: uuid.UUID, payload: FlagRuleCreate, db: DbSession) -> FlagRuleResponse:
    flag = await get_flag_or_404(db, flag_id)
    dataset = await get_dataset_or_404(db, flag.dataset_id)
    if payload.column_id not in {column.id for column in dataset.columns}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="column_id must belong to the same dataset as the flag",
        )

    rule = FlagRule(
        flag_id=flag_id,
        rule_json={
            "column_id": str(payload.column_id),
            "operator": payload.operator,
            "value": payload.value,
            "logic": payload.logic or "AND",
            "group_index": payload.group_index,
            "order_index": payload.order_index,
        },
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _serialize_rule(rule)


@router.get("/flags/{flag_id}/rules", response_model=list[FlagRuleResponse])
async def list_flag_rules(flag_id: uuid.UUID, db: DbSession) -> list[FlagRuleResponse]:
    flag = await get_flag_or_404(db, flag_id)
    ordered_rules = sorted(
        flag.rules,
        key=lambda rule: (
            int(rule.rule_json.get("group_index", 1)),
            int(rule.rule_json.get("order_index", 1)),
            str(rule.id),
        ),
    )
    return [_serialize_rule(rule) for rule in ordered_rules]


@router.put("/rules/{rule_id}", response_model=FlagRuleResponse)
async def update_flag_rule(rule_id: uuid.UUID, payload: FlagRuleUpdate, db: DbSession) -> FlagRuleResponse:
    rule = await db.get(FlagRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flag rule not found")

    flag = await get_flag_or_404(db, rule.flag_id)
    dataset = await get_dataset_or_404(db, flag.dataset_id)
    if payload.column_id not in {column.id for column in dataset.columns}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="column_id must belong to the same dataset as the flag",
        )

    rule.rule_json = {
        "column_id": str(payload.column_id),
        "operator": payload.operator,
        "value": payload.value,
        "logic": payload.logic or "AND",
        "group_index": payload.group_index,
        "order_index": payload.order_index,
    }
    await db.commit()
    await db.refresh(rule)
    return _serialize_rule(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flag_rule(rule_id: uuid.UUID, db: DbSession) -> Response:
    rule = await db.get(FlagRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flag rule not found")
    await db.delete(rule)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/flags/{flag_id}/manual", response_model=FlaggedRangeResponse, status_code=status.HTTP_201_CREATED)
async def create_manual_flagged_range(flag_id: uuid.UUID, payload: ManualFlagRequest, db: DbSession) -> FlaggedRangeResponse:
    flag = await get_flag_or_404(db, flag_id)
    dataset = await get_dataset_or_404(db, flag.dataset_id)
    dataset_column_ids = {column.id for column in dataset.columns}
    if payload.column_ids and not set(payload.column_ids).issubset(dataset_column_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All column_ids must belong to the same dataset as the flag",
        )

    flagged_range = FlaggedRange(
        flag_id=flag.id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        applied_by="manual",
        column_ids=payload.column_ids,
    )
    db.add(flagged_range)
    await db.commit()
    await db.refresh(flagged_range)
    return _serialize_flagged_range(flagged_range)


@router.post("/flags/{flag_id}/apply-rules", response_model=list[FlaggedRangeResponse])
async def apply_flag_rules(flag_id: uuid.UUID, db: DbSession) -> list[FlaggedRangeResponse]:
    flag = await get_flag_or_404(db, flag_id)
    flagged_ranges = await apply_rules(db, flag.dataset_id, flag.id)
    return [_serialize_flagged_range(flagged_range) for flagged_range in flagged_ranges]


@router.get("/datasets/{dataset_id}/flagged-ranges", response_model=list[FlaggedRangeResponse])
async def list_dataset_flagged_ranges(dataset_id: uuid.UUID, db: DbSession) -> list[FlaggedRangeResponse]:
    await get_dataset_or_404(db, dataset_id)
    rows = (
        await db.execute(
            select(FlaggedRange)
            .join(Flag, Flag.id == FlaggedRange.flag_id)
            .where(Flag.dataset_id == dataset_id)
            .order_by(FlaggedRange.start_time.asc(), FlaggedRange.id.asc()),
        )
    ).scalars().all()
    return [_serialize_flagged_range(flagged_range) for flagged_range in rows]


@router.delete("/flagged-ranges/{range_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flagged_range(range_id: uuid.UUID, db: DbSession) -> Response:
    flagged_range = await get_flagged_range_or_404(db, range_id)
    await db.delete(flagged_range)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
