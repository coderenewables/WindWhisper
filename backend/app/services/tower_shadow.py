from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime

import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn
from app.schemas.qc import TowerShadowMethod, TowerShadowRequest
from app.services.qc_engine import _expected_gap_tolerance, _merge_mask_to_ranges, get_dataset_or_404, load_dataset_frame


@dataclass(slots=True)
class TowerShadowSector:
    direction_start: float
    direction_end: float
    affected_column_ids: list[uuid.UUID]
    point_count: int
    ranges: list[tuple[datetime, datetime]]


@dataclass(slots=True)
class TowerShadowDetectionResult:
    method: TowerShadowMethod
    direction_column: DataColumn
    sectors: list[TowerShadowSector]
    columns_by_id: dict[uuid.UUID, DataColumn]


def _normalize_angle(angle: float) -> float:
    return angle % 360


def _sector_mask(series: pd.Series, start: float, end: float) -> pd.Series:
    normalized = series.mod(360)
    if start <= end:
        return normalized.between(start, end, inclusive="both")
    return (normalized >= start) | (normalized <= end)


def _select_direction_column(columns: list[DataColumn], direction_column_id: uuid.UUID | None) -> DataColumn:
    direction_columns = [column for column in columns if column.measurement_type == "direction"]
    if not direction_columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dataset must include a direction column")

    if direction_column_id is None:
        return sorted(direction_columns, key=lambda column: (column.height_m or 0, column.name))[0]

    for column in direction_columns:
        if column.id == direction_column_id:
            return column
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="direction_column_id must be a direction column from this dataset")


def _sort_speed_columns(columns: list[DataColumn]) -> list[DataColumn]:
    return sorted(
        [column for column in columns if column.measurement_type == "speed"],
        key=lambda column: (column.height_m or 0, column.name),
    )


def _merge_direction_bins(low_bins: list[int], bin_width: int = 5) -> list[tuple[float, float]]:
    if not low_bins:
        return []

    bins = sorted(set(low_bins))
    sectors: list[list[int]] = [[bins[0]]]
    for current in bins[1:]:
        previous = sectors[-1][-1]
        if current - previous == bin_width:
            sectors[-1].append(current)
        else:
            sectors.append([current])

    if len(sectors) > 1 and sectors[0][0] == 0 and sectors[-1][-1] == 360 - bin_width:
        merged = sectors[-1] + sectors[0]
        sectors = [merged, *sectors[1:-1]]

    results: list[tuple[float, float]] = []
    for sector_bins in sectors:
        start = float(sector_bins[0])
        end = float((sector_bins[-1] + bin_width) % 360)
        results.append((start, end))
    return results


async def detect_tower_shadow(db: AsyncSession, dataset_id: uuid.UUID, payload: TowerShadowRequest) -> TowerShadowDetectionResult:
    dataset = await get_dataset_or_404(db, dataset_id)
    direction_column = _select_direction_column(dataset.columns, payload.direction_column_id)
    columns_by_id = {column.id: column for column in dataset.columns}

    if payload.method == TowerShadowMethod.manual:
        speed_columns = _sort_speed_columns(dataset.columns)
        if not speed_columns:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dataset must include at least one speed column")

        assert payload.boom_orientations is not None
        orientations = [_normalize_angle(value) for value in payload.boom_orientations]
        if len(orientations) == 1:
            mapped_orientations = orientations * len(speed_columns)
        elif len(orientations) == len(speed_columns):
            mapped_orientations = orientations
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide either one boom orientation or one orientation per speed column",
            )

        loaded = await load_dataset_frame(
            db,
            dataset_id,
            column_ids=[direction_column.id, *[column.id for column in speed_columns]],
        )
        tolerance = _expected_gap_tolerance(loaded.dataset, loaded.frame)
        direction_series = loaded.frame[direction_column.name]
        sectors: list[TowerShadowSector] = []
        for speed_column, boom_orientation in zip(speed_columns, mapped_orientations, strict=True):
            sector_center = _normalize_angle(boom_orientation + 180)
            direction_start = _normalize_angle(sector_center - payload.shadow_width)
            direction_end = _normalize_angle(sector_center + payload.shadow_width)
            mask = _sector_mask(direction_series, direction_start, direction_end) & loaded.frame[speed_column.name].notna()
            point_count = int(mask.sum())
            if point_count == 0:
                continue
            sectors.append(
                TowerShadowSector(
                    direction_start=direction_start,
                    direction_end=direction_end,
                    affected_column_ids=[speed_column.id],
                    point_count=point_count,
                    ranges=_merge_mask_to_ranges(mask.fillna(False), tolerance),
                ),
            )

        return TowerShadowDetectionResult(
            method=payload.method,
            direction_column=direction_column,
            sectors=sectors,
            columns_by_id=columns_by_id,
        )

    speed_groups: dict[float, list[DataColumn]] = {}
    for speed_column in _sort_speed_columns(dataset.columns):
        if speed_column.height_m is None:
            continue
        speed_groups.setdefault(float(speed_column.height_m), []).append(speed_column)

    paired_groups = [columns[:2] for columns in speed_groups.values() if len(columns) >= 2]
    if not paired_groups:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto tower shadow detection requires at least two speed sensors at the same height",
        )

    candidate_columns = [direction_column.id]
    for group in paired_groups:
        candidate_columns.extend(column.id for column in group)

    loaded = await load_dataset_frame(db, dataset_id, column_ids=candidate_columns)
    tolerance = _expected_gap_tolerance(loaded.dataset, loaded.frame)
    direction_series = loaded.frame[direction_column.name]
    sectors: list[TowerShadowSector] = []

    for speed_a, speed_b in paired_groups:
        pair_frame = loaded.frame[[direction_column.name, speed_a.name, speed_b.name]].dropna()
        pair_frame = pair_frame[(pair_frame[speed_a.name] > 0) & (pair_frame[speed_b.name] > 0)]
        if pair_frame.empty:
            continue

        ratio = pair_frame[speed_a.name] / pair_frame[speed_b.name]
        direction_bins = ((pair_frame[direction_column.name].mod(360) / 5).apply(math.floor) * 5).astype(int)
        ratio_by_bin = ratio.groupby(direction_bins).mean()
        if ratio_by_bin.empty:
            continue

        threshold = float(ratio_by_bin.mean() - (2 * ratio_by_bin.std(ddof=0)))
        low_bins = [int(bin_start) for bin_start, value in ratio_by_bin.items() if float(value) < threshold]
        for direction_start, direction_end in _merge_direction_bins(low_bins):
            mask = (
                _sector_mask(direction_series, direction_start, direction_end)
                & loaded.frame[speed_a.name].notna()
                & loaded.frame[speed_b.name].notna()
            )
            point_count = int(mask.sum())
            if point_count == 0:
                continue
            sectors.append(
                TowerShadowSector(
                    direction_start=direction_start,
                    direction_end=direction_end,
                    affected_column_ids=[speed_a.id, speed_b.id],
                    point_count=point_count,
                    ranges=_merge_mask_to_ranges(mask.fillna(False), tolerance),
                ),
            )

    return TowerShadowDetectionResult(
        method=payload.method,
        direction_column=direction_column,
        sectors=sectors,
        columns_by_id=columns_by_id,
    )