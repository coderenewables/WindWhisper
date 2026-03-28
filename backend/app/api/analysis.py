from __future__ import annotations

import math
import uuid
from calendar import month_abbr
from datetime import datetime
from io import StringIO
from typing import Any, cast

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DataColumn, PowerCurve, Project, TimeseriesData
from app.schemas.analysis import (
    AirDensityMonthlyResponse,
    AirDensityPointResponse,
    AirDensityRequest,
    AirDensityResponse,
    AirDensitySummaryResponse,
    EnergyEstimateMonthlyResponse,
    EnergyEstimateRequest,
    EnergyEstimateResponse,
    EnergyEstimateSpeedBinResponse,
    EnergyEstimateSummaryResponse,
    ExtremeWindAnnualMaximumResponse,
    ExtremeWindGumbelFitResponse,
    ExtremeWindObservedPointResponse,
    ExtremeWindRequest,
    ExtremeWindResponse,
    ExtremeWindReturnPeriodResponse,
    ExtremeWindSummaryResponse,
    ExtrapolatedColumnResponse,
    ExtrapolateRequest,
    ExtrapolateResponse,
    ExtrapolateSummaryResponse,
    HistogramBinResponse,
    HistogramRequest,
    HistogramResponse,
    HistogramStatsResponse,
    PowerCurveLibraryCreateRequest,
    PowerCurveLibraryListResponse,
    PowerCurveLibraryResponse,
    PowerCurveLibraryUpdateRequest,
    PowerCurvePointResponse,
    PowerCurveSummaryResponse,
    ProfileRequest,
    ProfilesResponse,
    DiurnalProfilePointResponse,
    MonthlyProfilePointResponse,
    MonthlyDiurnalHeatmapCellResponse,
    DiurnalProfileYearResponse,
    MonthlyProfileYearResponse,
    PowerCurveUploadResponse,
    ScatterPointResponse,
    ScatterRequest,
    ScatterResponse,
    ShearDirectionBinResponse,
    ShearPairResponse,
    ShearProfilePointResponse,
    ShearRequest,
    ShearResponse,
    ShearTimeOfDayResponse,
    TurbulenceCurvePointResponse,
    TurbulenceDirectionBinResponse,
    TurbulenceIecCurveResponse,
    TurbulenceRequest,
    TurbulenceResponse,
    TurbulenceScatterPointResponse,
    TurbulenceSpeedBinResponse,
    TurbulenceSummaryResponse,
    WeibullCurvePointResponse,
    WeibullFitResponse,
    WeibullRequest,
    WeibullResponse,
    WindRoseRequest,
    WindRoseResponse,
    WindRoseSectorResponse,
    WindRoseSpeedBinResponse,
)
from app.services.air_density import air_density_summary, build_density_points, calculate_air_density, estimate_pressure_from_elevation, monthly_averages, wind_power_density
from app.services.energy_estimate import ensure_seeded_default_power_curve, energy_by_month, energy_by_speed_bin, gross_energy_estimate, load_power_curve, parse_power_curve_csv, summarize_power_curve
from app.services.extreme_wind import extreme_wind_summary
from app.services.qc_engine import filter_flagged_data, get_clean_dataframe, get_dataset_or_404, load_dataset_frame
from app.services.turbulence import build_scatter_points, calculate_ti, iec_reference_curves, ti_by_direction, ti_by_speed_bin, ti_summary
from app.services.weibull import fit_weibull, weibull_pdf
from app.services.wind_shear import extrapolate_to_height, shear_profile


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


def _coerce_numeric_series(frame: pd.DataFrame, column_name: str) -> pd.Series:
    if column_name not in frame.columns:
        return pd.Series(dtype=float)
    return pd.to_numeric(frame[column_name], errors="coerce").dropna().astype(float)


async def _load_clean_numeric_series(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    column: DataColumn,
    exclude_flag_ids: list[uuid.UUID],
) -> tuple[pd.Series, pd.Series]:
    loaded = await load_dataset_frame(db, dataset_id, column_ids=[column.id])
    raw_series = _coerce_numeric_series(loaded.frame, column.name)
    filtered_frame = await filter_flagged_data(db, loaded.frame, dataset_id, loaded.columns_by_id, exclude_flag_ids)
    clean_series = _coerce_numeric_series(filtered_frame, column.name)
    return raw_series, clean_series


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


def _apply_numeric_bounds(series: pd.Series, minimum: float | None, maximum: float | None) -> pd.Series:
    bounded = series
    if minimum is not None:
        bounded = bounded.loc[bounded >= minimum]
    if maximum is not None:
        bounded = bounded.loc[bounded <= maximum]
    return bounded


def _speed_columns_with_heights(dataset_columns: list[DataColumn], requested_ids: list[uuid.UUID]) -> list[DataColumn]:
    selected = [column for column in dataset_columns if column.measurement_type == "speed" and column.height_m is not None]
    if requested_ids:
        requested_set = set(requested_ids)
        selected = [column for column in selected if column.id in requested_set]
        if len(selected) != len(requested_set):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more requested speed columns do not belong to this dataset")

    unique_heights = {float(column.height_m) for column in selected if column.height_m is not None}
    if len(unique_heights) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least two wind speed columns with distinct heights are required for shear analysis",
        )

    return sorted(selected, key=lambda column: (float(column.height_m or 0.0), column.name))


def _serialize_shear_response(
    dataset_id: uuid.UUID,
    payload: ShearRequest,
    profile: dict[str, Any],
) -> ShearResponse:
    target_mean_speed = profile.get("target_mean_speed")
    representative_pair = cast(dict[str, Any] | None, profile.get("representative_pair"))
    pair_stats = cast(list[dict[str, Any]], profile.get("pair_stats", []))
    profile_points = cast(list[dict[str, Any]], profile.get("profile_points", []))
    direction_bins = cast(list[dict[str, Any]], profile.get("direction_bins", []))
    time_of_day = cast(list[dict[str, Any]], profile.get("time_of_day", []))

    return ShearResponse(
        dataset_id=dataset_id,
        method=payload.method,
        excluded_flag_ids=payload.exclude_flags,
        direction_column_id=payload.direction_column_id,
        target_height=payload.target_height,
        target_mean_speed=float(target_mean_speed) if target_mean_speed is not None else None,
        representative_pair=ShearPairResponse(**representative_pair) if representative_pair else None,
        pair_stats=[ShearPairResponse(**pair) for pair in pair_stats],
        profile_points=[ShearProfilePointResponse(**point) for point in profile_points],
        direction_bins=[ShearDirectionBinResponse(**sector) for sector in direction_bins],
        time_of_day=[ShearTimeOfDayResponse(**item) for item in time_of_day],
    )


def _summary_from_values(values: np.ndarray) -> ExtrapolateSummaryResponse:
    valid = values[np.isfinite(values)]
    if valid.size == 0:
        return ExtrapolateSummaryResponse(count=0)
    return ExtrapolateSummaryResponse(
        mean_speed=float(np.mean(valid)),
        median_speed=float(np.median(valid)),
        std_speed=float(np.std(valid, ddof=0)),
        count=int(valid.size),
    )


def _coerce_numeric_array(frame: pd.DataFrame, column_name: str) -> np.ndarray:
    if column_name not in frame.columns:
        return np.array([], dtype=float)
    return pd.to_numeric(frame[column_name], errors="coerce").to_numpy(dtype=float)


def _profile_label_for_hour(hour: int) -> str:
    return f"{hour:02d}:00"


def _profile_label_for_month(month: int) -> str:
    return month_abbr[month]


def _build_diurnal_profile_points(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []

    index = pd.DatetimeIndex(frame.index)
    points: list[dict[str, Any]] = []
    for hour in range(24):
        hour_values = frame.loc[index.hour == hour, "value"]
        sample_count = int(hour_values.count())
        if sample_count:
            points.append(
                {
                    "hour": hour,
                    "label": _profile_label_for_hour(hour),
                    "mean_value": float(hour_values.mean()),
                    "std_value": None if pd.isna(hour_values.std()) else float(hour_values.std()),
                    "min_value": float(hour_values.min()),
                    "max_value": float(hour_values.max()),
                    "sample_count": sample_count,
                },
            )
        else:
            points.append(
                {
                    "hour": hour,
                    "label": _profile_label_for_hour(hour),
                    "mean_value": None,
                    "std_value": None,
                    "min_value": None,
                    "max_value": None,
                    "sample_count": 0,
                },
            )
    return points


def _build_monthly_profile_points(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []

    index = pd.DatetimeIndex(frame.index)
    points: list[dict[str, Any]] = []
    for month in range(1, 13):
        month_values = frame.loc[index.month == month, "value"]
        sample_count = int(month_values.count())
        if sample_count:
            points.append(
                {
                    "month": month,
                    "label": _profile_label_for_month(month),
                    "mean_value": float(month_values.mean()),
                    "std_value": None if pd.isna(month_values.std()) else float(month_values.std()),
                    "min_value": float(month_values.min()),
                    "max_value": float(month_values.max()),
                    "sample_count": sample_count,
                },
            )
        else:
            points.append(
                {
                    "month": month,
                    "label": _profile_label_for_month(month),
                    "mean_value": None,
                    "std_value": None,
                    "min_value": None,
                    "max_value": None,
                    "sample_count": 0,
                },
            )
    return points


def _build_monthly_diurnal_heatmap(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []

    index = pd.DatetimeIndex(frame.index)
    cells: list[dict[str, Any]] = []
    for month in range(1, 13):
        for hour in range(24):
            cell_values = frame.loc[(index.month == month) & (index.hour == hour), "value"]
            sample_count = int(cell_values.count())
            mean_value = float(cell_values.mean()) if sample_count else None
            cells.append(
                {
                    "month": month,
                    "month_label": _profile_label_for_month(month),
                    "hour": hour,
                    "hour_label": _profile_label_for_hour(hour),
                    "mean_value": mean_value,
                    "sample_count": sample_count,
                },
            )
    return cells


def _build_yearly_profile_overlays(frame: pd.DataFrame, max_years: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[int]]:
    if frame.empty:
        return [], [], []

    index = pd.DatetimeIndex(frame.index)
    years = sorted(int(year) for year in index.year.unique())
    selected_years = years[-max_years:]
    diurnal_by_year: list[dict[str, Any]] = []
    monthly_by_year: list[dict[str, Any]] = []
    for year in selected_years:
        year_frame = frame.loc[index.year == year]
        diurnal_by_year.append({"year": year, "points": _build_diurnal_profile_points(year_frame)})
        monthly_by_year.append({"year": year, "points": _build_monthly_profile_points(year_frame)})
    return diurnal_by_year, monthly_by_year, years


def _build_scatter_frame(frame: pd.DataFrame, x_name: str, y_name: str, color_name: str | None) -> pd.DataFrame:
    scatter_frame = pd.DataFrame(
        {
            "x": pd.to_numeric(frame[x_name], errors="coerce"),
            "y": pd.to_numeric(frame[y_name], errors="coerce"),
        },
        index=frame.index,
    )
    if color_name is not None:
        scatter_frame["color"] = pd.to_numeric(frame[color_name], errors="coerce")
    return scatter_frame.dropna(subset=["x", "y"])


def _json_safe_value(value: object) -> object:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _json_safe_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe_value(item) for item in value]
    return value


async def _resolve_project_elevation(db: AsyncSession, project_id: uuid.UUID) -> float | None:
    result = await db.execute(select(Project.elevation).where(Project.id == project_id))
    value = result.scalar_one_or_none()
    return float(value) if value is not None else None


def _serialize_power_curve(curve: pd.DataFrame) -> list[PowerCurvePointResponse]:
    return [
        PowerCurvePointResponse(wind_speed_ms=float(row.wind_speed_ms), power_kw=float(row.power_kw))
        for row in curve.itertuples(index=False)
    ]


def _serialize_power_curve_record(record: PowerCurve) -> PowerCurveLibraryResponse:
    points = load_power_curve(record.points_json or [])
    return PowerCurveLibraryResponse(
        id=record.id,
        name=record.name,
        file_name=record.file_name,
        summary=PowerCurveSummaryResponse(**(record.summary_json or summarize_power_curve(points))),
        points=_serialize_power_curve(points),
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


async def _get_power_curve_or_404(db: AsyncSession, curve_id: uuid.UUID) -> PowerCurve:
    record = await db.get(PowerCurve, curve_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Power curve not found")
    return record


@router.post("/scatter/{dataset_id}", response_model=ScatterResponse)
async def create_scatter_analysis(
    dataset_id: uuid.UUID,
    payload: ScatterRequest,
    db: AsyncSession = Depends(get_db),
) -> ScatterResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    x_column = _resolve_column(dataset.columns, payload.x_column_id, "x_column_id")
    y_column = _resolve_column(dataset.columns, payload.y_column_id, "y_column_id")
    color_column = _resolve_column(dataset.columns, payload.color_column_id, "color_column_id") if payload.color_column_id is not None else None

    column_ids = [x_column.id, y_column.id]
    if color_column is not None:
        column_ids.append(color_column.id)

    frame = await get_clean_dataframe(db, dataset.id, column_ids=column_ids, exclude_flag_ids=payload.exclude_flags)
    if frame.empty:
        return ScatterResponse(
            dataset_id=dataset.id,
            x_column_id=x_column.id,
            y_column_id=y_column.id,
            color_column_id=color_column.id if color_column is not None else None,
            excluded_flag_ids=payload.exclude_flags,
        )

    scatter_frame = _build_scatter_frame(frame, x_column.name, y_column.name, color_column.name if color_column is not None else None)
    total_count = int(len(scatter_frame.index))
    sampled = scatter_frame
    is_downsampled = False

    if total_count > payload.max_points:
        rng = np.random.default_rng(42)
        selected_indices = np.sort(rng.choice(total_count, size=payload.max_points, replace=False))
        sampled = scatter_frame.iloc[selected_indices]
        is_downsampled = True

    return ScatterResponse(
        dataset_id=dataset.id,
        x_column_id=x_column.id,
        y_column_id=y_column.id,
        color_column_id=color_column.id if color_column is not None else None,
        excluded_flag_ids=payload.exclude_flags,
        total_count=total_count,
        sample_count=int(len(sampled.index)),
        is_downsampled=is_downsampled,
        points=[
            ScatterPointResponse(
                x=float(record["x"]),
                y=float(record["y"]),
                color=None if pd.isna(record.get("color", np.nan)) else float(record["color"]),
            )
            for record in sampled.to_dict(orient="records")
        ],
    )


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

    raw_series, clean_series = await _load_clean_numeric_series(db, dataset.id, column, payload.exclude_flags)
    clean_series = _apply_numeric_bounds(clean_series, payload.min_val, payload.max_val)

    raw_count = int(raw_series.count())
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


@router.post("/weibull/{dataset_id}", response_model=WeibullResponse)
async def create_weibull_fit(
    dataset_id: uuid.UUID,
    payload: WeibullRequest,
    db: AsyncSession = Depends(get_db),
) -> WeibullResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    column = _resolve_column(dataset.columns, payload.column_id, "column_id")

    if column.measurement_type != "speed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Weibull fitting is only available for wind speed columns",
        )

    _, clean_series = await _load_clean_numeric_series(db, dataset.id, column, payload.exclude_flags)
    clean_series = _apply_numeric_bounds(clean_series, payload.min_val, payload.max_val)
    positive_series = clean_series.loc[clean_series > 0]

    if positive_series.shape[0] < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least two positive wind speed samples are required for a Weibull fit",
        )

    fit = fit_weibull(positive_series.to_numpy(dtype=float), method=payload.method)
    edges = _resolve_histogram_edges(positive_series, payload)
    point_count = max(payload.curve_points, len(edges) * 4)
    x_values = np.linspace(float(edges[0]), float(edges[-1]), point_count, dtype=float)
    pdf_values = weibull_pdf(x_values, float(fit["k"]), float(fit["A"]))
    representative_width = float(np.mean(np.diff(edges))) if len(edges) > 1 else 1.0

    return WeibullResponse(
        dataset_id=dataset.id,
        column_id=column.id,
        excluded_flag_ids=payload.exclude_flags,
        fit=WeibullFitResponse(**fit),
        curve_points=[
            WeibullCurvePointResponse(
                x=float(x_value),
                pdf=float(pdf_value),
                frequency_pct=float(pdf_value * representative_width * 100.0),
            )
            for x_value, pdf_value in zip(x_values, pdf_values, strict=False)
        ],
    )


@router.post("/shear/{dataset_id}", response_model=ShearResponse)
async def create_shear_analysis(
    dataset_id: uuid.UUID,
    payload: ShearRequest,
    db: AsyncSession = Depends(get_db),
) -> ShearResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    speed_columns = _speed_columns_with_heights(dataset.columns, payload.speed_column_ids)
    direction_column = None
    if payload.direction_column_id is not None:
        direction_column = _resolve_column(dataset.columns, payload.direction_column_id, "direction_column_id")

    column_ids = [column.id for column in speed_columns]
    if direction_column is not None:
        column_ids.append(direction_column.id)

    loaded = await load_dataset_frame(db, dataset.id, column_ids=column_ids)
    filtered = await filter_flagged_data(db, loaded.frame, dataset.id, loaded.columns_by_id, payload.exclude_flags)

    speeds_by_height = {
        float(column.height_m): _coerce_numeric_series(filtered, column.name).to_numpy(dtype=float)
        for column in speed_columns
    }

    if len({len(values) for values in speeds_by_height.values()}) != 1:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Speed columns do not align for shear analysis")

    direction_values = None
    if direction_column is not None:
        direction_values = pd.to_numeric(filtered[direction_column.name], errors="coerce").to_numpy(dtype=float)

    profile = shear_profile(
        speeds_by_height,
        column_ids_by_height={float(column.height_m): column.id for column in speed_columns},
        timestamps=[timestamp.to_pydatetime() if hasattr(timestamp, "to_pydatetime") else timestamp for timestamp in filtered.index.to_list()],
        directions=direction_values,
        method=payload.method,
        num_sectors=payload.num_sectors,
        target_height=payload.target_height,
    )
    return _serialize_shear_response(dataset.id, payload, profile)


@router.post("/turbulence/{dataset_id}", response_model=TurbulenceResponse)
async def create_turbulence_analysis(
    dataset_id: uuid.UUID,
    payload: TurbulenceRequest,
    db: AsyncSession = Depends(get_db),
) -> TurbulenceResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    speed_column = _resolve_column(dataset.columns, payload.speed_column_id, "speed_column_id")
    sd_column = _resolve_column(dataset.columns, payload.sd_column_id, "sd_column_id")
    direction_column = _resolve_column(dataset.columns, payload.direction_column_id, "direction_column_id") if payload.direction_column_id is not None else None

    if speed_column.measurement_type != "speed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="speed_column_id must reference a wind speed column")

    if sd_column.measurement_type not in {"speed_sd", "turbulence_intensity"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sd_column_id must reference a wind speed standard deviation or turbulence intensity column",
        )

    column_ids = [speed_column.id, sd_column.id]
    if direction_column is not None:
        column_ids.append(direction_column.id)

    frame = await get_clean_dataframe(db, dataset.id, column_ids=column_ids, exclude_flag_ids=payload.exclude_flags)
    if frame.empty:
        return TurbulenceResponse(
            dataset_id=dataset.id,
            speed_column_id=speed_column.id,
            sd_column_id=sd_column.id,
            direction_column_id=direction_column.id if direction_column is not None else None,
            excluded_flag_ids=payload.exclude_flags,
            bin_width=payload.bin_width,
            num_sectors=payload.num_sectors,
            summary=TurbulenceSummaryResponse(),
        )

    speed_values = _coerce_numeric_array(frame, speed_column.name)
    ti_values = _coerce_numeric_array(frame, sd_column.name)
    if sd_column.measurement_type != "turbulence_intensity":
        ti_values = calculate_ti(speed_values, ti_values)

    speed_bins = ti_by_speed_bin(speed_values, ti_values, bin_width=payload.bin_width)
    direction_bins = []
    if direction_column is not None:
        direction_values = _coerce_numeric_array(frame, direction_column.name)
        direction_bins = ti_by_direction(direction_values, ti_values, num_sectors=payload.num_sectors)

    summary = ti_summary(speed_values, ti_values, speed_bins=speed_bins)
    finite_speed = speed_values[np.isfinite(speed_values) & (speed_values > 0)]
    if finite_speed.size:
        min_speed = float(np.min(finite_speed))
        max_speed = float(np.max(finite_speed))
    else:
        min_speed = 1.0
        max_speed = 25.0

    return TurbulenceResponse(
        dataset_id=dataset.id,
        speed_column_id=speed_column.id,
        sd_column_id=sd_column.id,
        direction_column_id=direction_column.id if direction_column is not None else None,
        excluded_flag_ids=payload.exclude_flags,
        bin_width=payload.bin_width,
        num_sectors=payload.num_sectors,
        summary=TurbulenceSummaryResponse(**summary),
        scatter_points=[TurbulenceScatterPointResponse(**point) for point in build_scatter_points(speed_values, ti_values, max_points=payload.max_scatter_points)],
        speed_bins=[TurbulenceSpeedBinResponse(**item) for item in speed_bins],
        direction_bins=[TurbulenceDirectionBinResponse(**item) for item in direction_bins],
        iec_curves=[
            TurbulenceIecCurveResponse(
                label=curve["label"],
                reference_intensity=float(curve["reference_intensity"]),
                points=[TurbulenceCurvePointResponse(**point) for point in curve["points"]],
            )
            for curve in iec_reference_curves(min_speed, max_speed)
        ],
    )


@router.post("/air-density/{dataset_id}", response_model=AirDensityResponse)
async def create_air_density_analysis(
    dataset_id: uuid.UUID,
    payload: AirDensityRequest,
    db: AsyncSession = Depends(get_db),
) -> AirDensityResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    temperature_column = _resolve_column(dataset.columns, payload.temperature_column_id, "temperature_column_id")
    speed_column = _resolve_column(dataset.columns, payload.speed_column_id, "speed_column_id")
    pressure_column = _resolve_column(dataset.columns, payload.pressure_column_id, "pressure_column_id") if payload.pressure_column_id is not None else None

    if temperature_column.measurement_type != "temperature":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="temperature_column_id must reference a temperature column")
    if speed_column.measurement_type != "speed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="speed_column_id must reference a wind speed column")
    if pressure_column is not None and pressure_column.measurement_type != "pressure":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="pressure_column_id must reference a pressure column")

    project_elevation = await _resolve_project_elevation(db, dataset.project_id)
    selected_elevation = payload.elevation_m if payload.elevation_m is not None else project_elevation

    if payload.pressure_source == "measured" and pressure_column is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A pressure column is required when pressure_source is measured")
    if payload.pressure_source == "estimated" and selected_elevation is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Elevation is required when pressure_source is estimated")
    if payload.pressure_source == "auto" and pressure_column is None and selected_elevation is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide either a pressure column or an elevation to estimate pressure")

    use_estimated_pressure = payload.pressure_source == "estimated" or (payload.pressure_source == "auto" and pressure_column is None)
    column_ids = [temperature_column.id, speed_column.id]
    if pressure_column is not None:
      column_ids.append(pressure_column.id)

    frame = await get_clean_dataframe(db, dataset.id, column_ids=column_ids, exclude_flag_ids=payload.exclude_flags)
    timestamps = pd.DatetimeIndex(frame.index)
    if frame.empty:
        pressure_source = "estimated" if use_estimated_pressure else "measured"
        estimated_pressure_hpa = estimate_pressure_from_elevation(selected_elevation) if use_estimated_pressure and selected_elevation is not None else None
        return AirDensityResponse(
            dataset_id=dataset.id,
            temperature_column_id=temperature_column.id,
            speed_column_id=speed_column.id,
            pressure_column_id=pressure_column.id if pressure_column is not None else None,
            excluded_flag_ids=payload.exclude_flags,
            summary=AirDensitySummaryResponse(
                pressure_source=pressure_source,
                elevation_m=selected_elevation,
                estimated_pressure_hpa=estimated_pressure_hpa,
            ),
        )

    temperature_values = _coerce_numeric_array(frame, temperature_column.name)
    speed_values = _coerce_numeric_array(frame, speed_column.name)
    estimated_pressure_hpa = estimate_pressure_from_elevation(selected_elevation) if use_estimated_pressure and selected_elevation is not None else None
    if use_estimated_pressure:
        pressure_values = np.full(temperature_values.shape, estimated_pressure_hpa if estimated_pressure_hpa is not None else np.nan, dtype=float)
        pressure_source = "estimated"
    else:
        pressure_values = _coerce_numeric_array(frame, pressure_column.name if pressure_column is not None else "")
        pressure_source = "measured"

    density_values = calculate_air_density(temperature_values, pressure_values)
    wpd_values = wind_power_density(speed_values, density_values)
    summary = air_density_summary(density_values, wpd_values)
    monthly_rows = monthly_averages(timestamps, density_values, wpd_values)
    density_points = build_density_points(timestamps, density_values, wpd_values, max_points=payload.max_series_points)

    return AirDensityResponse(
        dataset_id=dataset.id,
        temperature_column_id=temperature_column.id,
        speed_column_id=speed_column.id,
        pressure_column_id=pressure_column.id if pressure_column is not None else None,
        excluded_flag_ids=payload.exclude_flags,
        summary=AirDensitySummaryResponse(
            pressure_source=pressure_source,
            elevation_m=selected_elevation,
            estimated_pressure_hpa=estimated_pressure_hpa,
            **summary,
        ),
        density_points=[AirDensityPointResponse(**point) for point in density_points],
        monthly=[AirDensityMonthlyResponse(**row) for row in monthly_rows],
    )


@router.post("/extreme-wind/{dataset_id}", response_model=ExtremeWindResponse)
async def create_extreme_wind_analysis(
    dataset_id: uuid.UUID,
    payload: ExtremeWindRequest,
    db: AsyncSession = Depends(get_db),
) -> ExtremeWindResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    speed_column = _resolve_column(dataset.columns, payload.speed_column_id, "speed_column_id")
    gust_column = _resolve_column(dataset.columns, payload.gust_column_id, "gust_column_id") if payload.gust_column_id is not None else None

    if speed_column.measurement_type != "speed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="speed_column_id must reference a wind speed column")
    if gust_column is not None and gust_column.measurement_type != "gust":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="gust_column_id must reference a gust column")

    column_ids = [speed_column.id]
    if gust_column is not None:
        column_ids.append(gust_column.id)

    frame = await get_clean_dataframe(db, dataset.id, column_ids=column_ids, exclude_flag_ids=payload.exclude_flags)
    if frame.empty:
        return ExtremeWindResponse(
            dataset_id=dataset.id,
            speed_column_id=speed_column.id,
            gust_column_id=gust_column.id if gust_column is not None else None,
            excluded_flag_ids=payload.exclude_flags,
            summary=ExtremeWindSummaryResponse(data_source="gust" if gust_column is not None else "speed"),
            gumbel_fit=ExtremeWindGumbelFitResponse(),
        )

    speed_series = pd.to_numeric(frame[speed_column.name], errors="coerce")
    gust_series = pd.to_numeric(frame[gust_column.name], errors="coerce") if gust_column is not None else None
    summary = extreme_wind_summary(
        speed_series,
        gust_series,
        return_periods=payload.return_periods,
        max_curve_points=payload.max_curve_points,
    )

    return ExtremeWindResponse(
        dataset_id=dataset.id,
        speed_column_id=speed_column.id,
        gust_column_id=gust_column.id if gust_column is not None else None,
        excluded_flag_ids=payload.exclude_flags,
        summary=ExtremeWindSummaryResponse(**summary["summary"]),
        gumbel_fit=ExtremeWindGumbelFitResponse(**summary["gumbel_fit"]),
        annual_maxima=[ExtremeWindAnnualMaximumResponse(**row) for row in summary["annual_maxima"]],
        return_periods=[ExtremeWindReturnPeriodResponse(**row) for row in summary["return_periods"]],
        return_period_curve=[ExtremeWindReturnPeriodResponse(**row) for row in summary["return_period_curve"]],
        observed_points=[ExtremeWindObservedPointResponse(**row) for row in summary["observed_points"]],
    )


@router.post("/extrapolate/{dataset_id}", response_model=ExtrapolateResponse)
async def create_extrapolated_series(
    dataset_id: uuid.UUID,
    payload: ExtrapolateRequest,
    db: AsyncSession = Depends(get_db),
) -> ExtrapolateResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    speed_columns = _speed_columns_with_heights(dataset.columns, payload.speed_column_ids)
    loaded = await load_dataset_frame(db, dataset.id, column_ids=[column.id for column in speed_columns])
    filtered = await filter_flagged_data(db, loaded.frame, dataset.id, loaded.columns_by_id, payload.exclude_flags)

    speeds_by_height = {
        float(column.height_m): pd.to_numeric(filtered[column.name], errors="coerce").to_numpy(dtype=float)
        for column in speed_columns
    }
    extrapolated = extrapolate_to_height(
        speeds_by_height,
        column_ids_by_height={float(column.height_m): column.id for column in speed_columns},
        target_height=payload.target_height,
        method=payload.method,
    )
    values = np.asarray(extrapolated["values"], dtype=float)
    created_column = None

    if payload.create_column:
        representative = extrapolated.get("representative_pair")
        if representative is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to create an extrapolated channel without a representative shear pair")

        source_unit = speed_columns[0].unit
        column_name = payload.column_name or f"Speed_{payload.target_height:g}m_{payload.method}"
        if any(column.name == column_name for column in dataset.columns):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A column with this name already exists in the dataset")

        column = DataColumn(
            dataset_id=dataset.id,
            name=column_name,
            unit=source_unit,
            measurement_type="speed",
            height_m=payload.target_height,
            sensor_info={
                "derived": True,
                "method": payload.method,
                "source": "wind_shear_extrapolation",
                "representative_pair": _json_safe_value(representative),
            },
        )
        db.add(column)
        await db.flush()

        rows = (
            await db.execute(
                select(TimeseriesData)
                .where(TimeseriesData.dataset_id == dataset.id)
                .order_by(TimeseriesData.timestamp.asc(), TimeseriesData.id.asc())
            )
        ).scalars().all()

        if len(rows) != len(values):
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Extrapolated values do not align with dataset rows")

        for row, value in zip(rows, values, strict=False):
            row.values_json = {**row.values_json, column_name: None if not np.isfinite(value) else float(value)}

        await db.commit()
        created_column = ExtrapolatedColumnResponse(
            id=column.id,
            name=column.name,
            unit=column.unit,
            measurement_type=column.measurement_type,
            height_m=column.height_m,
            sensor_info=column.sensor_info,
        )
    else:
        await db.rollback()

    timestamps = [timestamp.to_pydatetime() if hasattr(timestamp, "to_pydatetime") else timestamp for timestamp in loaded.frame.index.to_list()]
    return ExtrapolateResponse(
        dataset_id=dataset.id,
        method=payload.method,
        target_height=payload.target_height,
        excluded_flag_ids=payload.exclude_flags,
        representative_pair=ShearPairResponse(**extrapolated["representative_pair"]) if extrapolated.get("representative_pair") else None,
        summary=_summary_from_values(values),
        timestamps=timestamps,
        values=[None if not np.isfinite(value) else float(value) for value in values],
        created_column=created_column,
    )


@router.post("/power-curve/upload", response_model=PowerCurveUploadResponse)
async def upload_power_curve(file: UploadFile = File(...)) -> PowerCurveUploadResponse:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A power curve file is required")

    try:
        contents = (await file.read()).decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Power curve file must be UTF-8 encoded text") from exc

    try:
        curve = parse_power_curve_csv(contents)
    except (ValueError, pd.errors.ParserError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return PowerCurveUploadResponse(
        file_name=file.filename,
        summary=PowerCurveSummaryResponse(**summarize_power_curve(curve)),
        points=_serialize_power_curve(curve),
    )


@router.get("/power-curves", response_model=PowerCurveLibraryListResponse)
async def list_power_curves(db: AsyncSession = Depends(get_db)) -> PowerCurveLibraryListResponse:
    await ensure_seeded_default_power_curve(db)
    records = (await db.execute(select(PowerCurve).order_by(PowerCurve.updated_at.desc(), PowerCurve.created_at.desc(), PowerCurve.name.asc()))).scalars().all()
    items = [_serialize_power_curve_record(record) for record in records]
    return PowerCurveLibraryListResponse(items=items, total=len(items))


@router.post("/power-curves", response_model=PowerCurveLibraryResponse, status_code=status.HTTP_201_CREATED)
async def create_power_curve_library_item(
    payload: PowerCurveLibraryCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> PowerCurveLibraryResponse:
    try:
        curve = load_power_curve({"points": [point.model_dump() for point in payload.points]})
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    existing = (await db.execute(select(PowerCurve).where(PowerCurve.name == payload.name))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A saved power curve with this name already exists")

    record = PowerCurve(
        name=payload.name,
        file_name=payload.file_name,
        summary_json=summarize_power_curve(curve),
        points_json=[point.model_dump() for point in _serialize_power_curve(curve)],
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return _serialize_power_curve_record(record)


@router.put("/power-curves/{curve_id}", response_model=PowerCurveLibraryResponse)
async def update_power_curve_library_item(
    curve_id: uuid.UUID,
    payload: PowerCurveLibraryUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> PowerCurveLibraryResponse:
    record = await _get_power_curve_or_404(db, curve_id)

    if payload.name is not None and payload.name != record.name:
        existing = (await db.execute(select(PowerCurve).where(PowerCurve.name == payload.name, PowerCurve.id != curve_id))).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A saved power curve with this name already exists")
        record.name = payload.name

    if payload.file_name is not None:
        record.file_name = payload.file_name

    if payload.points is not None:
        try:
            curve = load_power_curve({"points": [point.model_dump() for point in payload.points]})
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        record.summary_json = summarize_power_curve(curve)
        record.points_json = [point.model_dump() for point in _serialize_power_curve(curve)]

    await db.commit()
    await db.refresh(record)
    return _serialize_power_curve_record(record)


@router.delete("/power-curves/{curve_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_power_curve_library_item(
    curve_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    record = await _get_power_curve_or_404(db, curve_id)
    await db.delete(record)
    await db.commit()


@router.post("/energy-estimate/{dataset_id}", response_model=EnergyEstimateResponse)
async def create_energy_estimate(
    dataset_id: uuid.UUID,
    payload: EnergyEstimateRequest,
    db: AsyncSession = Depends(get_db),
) -> EnergyEstimateResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    speed_column = _resolve_column(dataset.columns, payload.speed_column_id, "speed_column_id")
    temperature_column = _resolve_column(dataset.columns, payload.temperature_column_id, "temperature_column_id") if payload.temperature_column_id is not None else None
    pressure_column = _resolve_column(dataset.columns, payload.pressure_column_id, "pressure_column_id") if payload.pressure_column_id is not None else None

    if speed_column.measurement_type != "speed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="speed_column_id must reference a wind speed column")
    if temperature_column is not None and temperature_column.measurement_type != "temperature":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="temperature_column_id must reference a temperature column")
    if pressure_column is not None and pressure_column.measurement_type != "pressure":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="pressure_column_id must reference a pressure column")

    try:
        power_curve = load_power_curve({"points": [point.model_dump() for point in payload.power_curve_points]})
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    project_elevation = await _resolve_project_elevation(db, dataset.project_id)
    selected_elevation = payload.elevation_m if payload.elevation_m is not None else project_elevation
    estimated_pressure_hpa = None
    density_values = None
    pressure_source = None

    column_ids = [speed_column.id]
    if payload.air_density_adjustment:
        if temperature_column is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="temperature_column_id is required when air_density_adjustment is enabled")
        column_ids.append(temperature_column.id)

        if payload.pressure_source == "measured" and pressure_column is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="pressure_column_id is required when pressure_source is measured")
        if payload.pressure_source == "estimated" and selected_elevation is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="elevation_m or project elevation is required when pressure_source is estimated")
        if payload.pressure_source == "auto" and pressure_column is None and selected_elevation is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a pressure column or elevation to enable air density adjustment")
        if pressure_column is not None:
            column_ids.append(pressure_column.id)

    frame = await get_clean_dataframe(db, dataset.id, column_ids=column_ids, exclude_flag_ids=payload.exclude_flags)
    if frame.empty:
        power_curve_summary = PowerCurveSummaryResponse(**summarize_power_curve(power_curve))
        return EnergyEstimateResponse(
            dataset_id=dataset.id,
            speed_column_id=speed_column.id,
            temperature_column_id=temperature_column.id if temperature_column is not None else None,
            pressure_column_id=pressure_column.id if pressure_column is not None else None,
            excluded_flag_ids=payload.exclude_flags,
            air_density_adjustment=payload.air_density_adjustment,
            power_curve=_serialize_power_curve(power_curve),
            power_curve_summary=power_curve_summary,
            summary=EnergyEstimateSummaryResponse(
                rated_power_kw=power_curve_summary.rated_power_kw,
                air_density_adjusted=False,
                pressure_source=payload.pressure_source if payload.air_density_adjustment else None,
                elevation_m=selected_elevation,
            ),
        )

    timestamps = pd.DatetimeIndex(frame.index)
    speed_values = _coerce_numeric_array(frame, speed_column.name)

    if payload.air_density_adjustment:
        temperature_values = _coerce_numeric_array(frame, temperature_column.name if temperature_column is not None else "")
        use_estimated_pressure = payload.pressure_source == "estimated" or (payload.pressure_source == "auto" and pressure_column is None)
        if use_estimated_pressure:
            estimated_pressure_hpa = estimate_pressure_from_elevation(selected_elevation) if selected_elevation is not None else None
            pressure_values = np.full(speed_values.shape, estimated_pressure_hpa if estimated_pressure_hpa is not None else np.nan, dtype=float)
            pressure_source = "estimated"
        else:
            pressure_values = _coerce_numeric_array(frame, pressure_column.name if pressure_column is not None else "")
            pressure_source = "measured"
        density_values = calculate_air_density(temperature_values, pressure_values)

    try:
        estimate = gross_energy_estimate(
            speed_values,
            power_curve,
            density=density_values,
            air_density_adjustment=payload.air_density_adjustment,
            timestamps=timestamps,
            density_reference=payload.density_reference_kg_per_m3,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    power_values = np.asarray(estimate["power_kw"], dtype=float)
    time_step_hours = float(estimate["time_step_hours"])
    monthly_rows = energy_by_month(timestamps, power_values, time_step_hours=time_step_hours)
    speed_bin_rows = energy_by_speed_bin(speed_values, power_values, time_step_hours=time_step_hours, bin_width=payload.speed_bin_width)
    power_curve_summary = PowerCurveSummaryResponse(**summarize_power_curve(power_curve))

    return EnergyEstimateResponse(
        dataset_id=dataset.id,
        speed_column_id=speed_column.id,
        temperature_column_id=temperature_column.id if temperature_column is not None else None,
        pressure_column_id=pressure_column.id if pressure_column is not None else None,
        excluded_flag_ids=payload.exclude_flags,
        air_density_adjustment=payload.air_density_adjustment,
        power_curve=_serialize_power_curve(power_curve),
        power_curve_summary=power_curve_summary,
        summary=EnergyEstimateSummaryResponse(
            time_step_hours=time_step_hours,
            pressure_source=pressure_source,
            elevation_m=selected_elevation,
            estimated_pressure_hpa=estimated_pressure_hpa,
            **estimate["summary"],
        ),
        monthly=[EnergyEstimateMonthlyResponse(**row) for row in monthly_rows],
        speed_bins=[EnergyEstimateSpeedBinResponse(**row) for row in speed_bin_rows],
    )


@router.post("/profiles/{dataset_id}", response_model=ProfilesResponse)
async def create_profile_analysis(
    dataset_id: uuid.UUID,
    payload: ProfileRequest,
    db: AsyncSession = Depends(get_db),
) -> ProfilesResponse:
    dataset = await get_dataset_or_404(db, dataset_id)
    column = _resolve_column(dataset.columns, payload.column_id, "column_id")

    frame = await get_clean_dataframe(db, dataset.id, column_ids=[column.id], exclude_flag_ids=payload.exclude_flags)
    value_frame = pd.DataFrame(index=frame.index)
    value_frame["value"] = pd.to_numeric(frame[column.name], errors="coerce") if not frame.empty else pd.Series(dtype=float)
    value_frame = value_frame.dropna(subset=["value"])

    if value_frame.empty:
        return ProfilesResponse(
            dataset_id=dataset.id,
            column_id=column.id,
            excluded_flag_ids=payload.exclude_flags,
        )

    diurnal = _build_diurnal_profile_points(value_frame)
    monthly = _build_monthly_profile_points(value_frame)
    heatmap = _build_monthly_diurnal_heatmap(value_frame)
    diurnal_by_year: list[dict[str, Any]] = []
    monthly_by_year: list[dict[str, Any]] = []
    years_available: list[int] = sorted(int(year) for year in pd.DatetimeIndex(value_frame.index).year.unique())

    if payload.include_yearly_overlays:
        diurnal_by_year, monthly_by_year, years_available = _build_yearly_profile_overlays(value_frame, payload.max_years)

    return ProfilesResponse(
        dataset_id=dataset.id,
        column_id=column.id,
        excluded_flag_ids=payload.exclude_flags,
        years_available=years_available,
        diurnal=[DiurnalProfilePointResponse(**row) for row in diurnal],
        monthly=[MonthlyProfilePointResponse(**row) for row in monthly],
        heatmap=[MonthlyDiurnalHeatmapCellResponse(**row) for row in heatmap],
        diurnal_by_year=[DiurnalProfileYearResponse(**row) for row in diurnal_by_year],
        monthly_by_year=[MonthlyProfileYearResponse(**row) for row in monthly_by_year],
    )