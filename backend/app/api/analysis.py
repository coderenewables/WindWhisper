from __future__ import annotations

import math
import uuid

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DataColumn
from app.schemas.analysis import (
    HistogramBinResponse,
    HistogramRequest,
    HistogramResponse,
    HistogramStatsResponse,
    WindRoseRequest,
    WindRoseResponse,
    WindRoseSectorResponse,
    WindRoseSpeedBinResponse,
)
from app.services.qc_engine import filter_flagged_data, get_clean_dataframe, get_dataset_or_404, load_dataset_frame


router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _format_speed_bin_label(lower: float, upper: float | None) -> str:
    if upper is None:
        return f"{lower:g}+"
    return f"{lower:g}-{upper:g}"


def _validate_speed_bin_edges(edges: list[float]) -> list[float]:
    normalized = [float(edge) for edge in edges]
    if len(normalized) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="speed_bin_edges must include at least two ascending values",
        )

    if any(current >= following for current, following in zip(normalized, normalized[1:], strict=False)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="speed_bin_edges must be strictly increasing",
        )

    return normalized


def _resolve_column(dataset_columns: list[DataColumn], column_id: uuid.UUID, label: str) -> DataColumn:
    for column in dataset_columns:
        if column.id == column_id:
            return column
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} does not belong to this dataset")


def _sector_index(direction: pd.Series, sector_width: float) -> pd.Series:
    shifted = (direction + (sector_width / 2.0)) % 360.0
    return np.floor(shifted / sector_width).astype(int)


def _serialize_histogram_stats(series: pd.Series, raw_count: int) -> HistogramStatsResponse:
    if series.empty:
        return HistogramStatsResponse(count=0, data_recovery_pct=0.0)

    return HistogramStatsResponse(
        mean=float(series.mean()),
        std=float(series.std(ddof=0)),
        min=float(series.min()),
        max=float(series.max()),
        median=float(series.median()),
        count=int(series.count()),
        data_recovery_pct=(float(series.count()) / float(raw_count) * 100.0) if raw_count else 0.0,
    )


def _resolve_histogram_edges(series: pd.Series, payload: HistogramRequest) -> np.ndarray:
    lower_bound = payload.min_val if payload.min_val is not None else float(series.min())
    upper_bound = payload.max_val if payload.max_val is not None else float(series.max())

    if upper_bound < lower_bound:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="max_val must be greater than or equal to min_val",
        )

    if payload.bin_width is not None:
        upper_edge = upper_bound
        if math.isclose(lower_bound, upper_edge):
            upper_edge = lower_bound + payload.bin_width
        edge_count = max(2, int(math.ceil((upper_edge - lower_bound) / payload.bin_width)) + 1)
        edges = lower_bound + np.arange(edge_count, dtype=float) * payload.bin_width
        if edges[-1] < upper_edge:
            edges = np.append(edges, upper_edge)
        else:
            edges[-1] = upper_edge
        return edges

    if math.isclose(lower_bound, upper_bound):
        return np.array([lower_bound, lower_bound + 1.0], dtype=float)

    return np.histogram_bin_edges(series.to_numpy(dtype=float), bins=payload.num_bins, range=(lower_bound, upper_bound))


@router.post("/wind-rose/{dataset_id}", response_model=WindRoseResponse)
async def create_wind_rose(
    dataset_id: uuid.UUID,
    payload: WindRoseRequest,
    db: AsyncSession = Depends(get_db),
) -> WindRoseResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    direction_column = _resolve_column(dataset.columns, payload.direction_column_id, "direction_column_id")
    value_column = _resolve_column(dataset.columns, payload.value_column_id, "value_column_id")

    edges = _validate_speed_bin_edges(payload.speed_bin_edges)
    frame = await get_clean_dataframe(
        db,
        dataset.id,
        column_ids=[direction_column.id, value_column.id],
        exclude_flag_ids=payload.exclude_flags,
    )

    if frame.empty:
        total_count = 0
        rose_frame = pd.DataFrame(columns=[direction_column.name, value_column.name, "sector_index"])
    else:
        rose_frame = frame[[direction_column.name, value_column.name]].rename(
            columns={direction_column.name: "direction", value_column.name: "value"},
        )
        rose_frame = rose_frame.dropna(subset=["direction", "value"])
        rose_frame["direction"] = rose_frame["direction"].mod(360.0)
        sector_width = 360.0 / payload.num_sectors
        if not rose_frame.empty:
            rose_frame["sector_index"] = _sector_index(rose_frame["direction"], sector_width)
        else:
            rose_frame["sector_index"] = pd.Series(dtype=int)
        total_count = int(len(rose_frame.index))

    sector_width = 360.0 / payload.num_sectors
    extended_edges = [*edges, math.inf]
    sectors: list[WindRoseSectorResponse] = []

    for sector_index in range(payload.num_sectors):
        sector_rows = rose_frame.loc[rose_frame["sector_index"] == sector_index] if total_count else rose_frame.iloc[0:0]
        sample_count = int(len(sector_rows.index))
        frequency = (sample_count / total_count * 100.0) if total_count else 0.0
        mean_value = float(sector_rows["value"].mean()) if sample_count else None
        energy = float((sector_rows["value"] ** 3).sum()) if sample_count else 0.0

        speed_bins: list[WindRoseSpeedBinResponse] = []
        for lower, upper in zip(extended_edges[:-1], extended_edges[1:], strict=False):
            if math.isinf(upper):
                mask = sector_rows["value"] >= lower
                upper_value = None
            else:
                mask = (sector_rows["value"] >= lower) & (sector_rows["value"] < upper)
                upper_value = upper

            count = int(mask.sum()) if sample_count else 0
            speed_bins.append(
                WindRoseSpeedBinResponse(
                    label=_format_speed_bin_label(lower, upper_value),
                    lower=lower,
                    upper=upper_value,
                    count=count,
                    frequency_pct=(count / total_count * 100.0) if total_count else 0.0,
                ),
            )

        sectors.append(
            WindRoseSectorResponse(
                sector_index=sector_index,
                direction=float((sector_index * sector_width) % 360.0),
                start_angle=float((sector_index * sector_width - sector_width / 2.0) % 360.0),
                end_angle=float((sector_index * sector_width + sector_width / 2.0) % 360.0),
                sample_count=sample_count,
                frequency=frequency,
                mean_value=mean_value,
                energy=energy,
                speed_bins=speed_bins,
            ),
        )

    return WindRoseResponse(
        dataset_id=dataset.id,
        direction_column_id=direction_column.id,
        value_column_id=value_column.id,
        num_sectors=payload.num_sectors,
        excluded_flag_ids=payload.exclude_flags,
        total_count=total_count,
        sectors=sectors,
    )


@router.post("/histogram/{dataset_id}", response_model=HistogramResponse)
async def create_histogram(
    dataset_id: uuid.UUID,
    payload: HistogramRequest,
    db: AsyncSession = Depends(get_db),
) -> HistogramResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    column = _resolve_column(dataset.columns, payload.column_id, "column_id")

    loaded = await load_dataset_frame(db, dataset.id, column_ids=[column.id])
    raw_series = loaded.frame[column.name] if column.name in loaded.frame.columns else pd.Series(dtype=float)
    filtered_frame = await filter_flagged_data(db, loaded.frame, dataset.id, loaded.columns_by_id, payload.exclude_flags)
    clean_series = filtered_frame[column.name].dropna().astype(float) if column.name in filtered_frame.columns else pd.Series(dtype=float)

    if payload.min_val is not None:
        clean_series = clean_series.loc[clean_series >= payload.min_val]
    if payload.max_val is not None:
        clean_series = clean_series.loc[clean_series <= payload.max_val]

    raw_count = int(raw_series.dropna().count())
    stats = _serialize_histogram_stats(clean_series, raw_count)
    if clean_series.empty:
        return HistogramResponse(
            dataset_id=dataset.id,
            column_id=column.id,
            excluded_flag_ids=payload.exclude_flags,
            bins=[],
            stats=stats,
        )

    edges = _resolve_histogram_edges(clean_series, payload)
    counts, bin_edges = np.histogram(clean_series.to_numpy(dtype=float), bins=edges)
    total_count = int(counts.sum())

    bins = [
        HistogramBinResponse(
            lower=float(lower),
            upper=float(upper),
            count=int(count),
            frequency_pct=(float(count) / float(total_count) * 100.0) if total_count else 0.0,
        )
        for lower, upper, count in zip(bin_edges[:-1], bin_edges[1:], counts, strict=False)
    ]

    return HistogramResponse(
        dataset_id=dataset.id,
        column_id=column.id,
        excluded_flag_ids=payload.exclude_flags,
        bins=bins,
        stats=stats,
    )