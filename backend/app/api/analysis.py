from __future__ import annotations

import math
import uuid
from datetime import datetime

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DataColumn, Project, TimeseriesData
from app.schemas.analysis import (
    AirDensityMonthlyResponse,
    AirDensityPointResponse,
    AirDensityRequest,
    AirDensityResponse,
    AirDensitySummaryResponse,
    ExtrapolatedColumnResponse,
    ExtrapolateRequest,
    ExtrapolateResponse,
    ExtrapolateSummaryResponse,
    HistogramBinResponse,
    HistogramRequest,
    HistogramResponse,
    HistogramStatsResponse,
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

    unique_heights = {float(column.height_m) for column in selected}
    if len(unique_heights) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least two wind speed columns with distinct heights are required for shear analysis",
        )

    return sorted(selected, key=lambda column: (float(column.height_m or 0.0), column.name))


def _serialize_shear_response(
    dataset_id: uuid.UUID,
    payload: ShearRequest,
    profile: dict[str, object],
) -> ShearResponse:
    return ShearResponse(
        dataset_id=dataset_id,
        method=payload.method,
        excluded_flag_ids=payload.exclude_flags,
        direction_column_id=payload.direction_column_id,
        target_height=payload.target_height,
        target_mean_speed=profile.get("target_mean_speed"),
        representative_pair=ShearPairResponse(**profile["representative_pair"]) if profile.get("representative_pair") else None,
        pair_stats=[ShearPairResponse(**pair) for pair in profile.get("pair_stats", [])],
        profile_points=[ShearProfilePointResponse(**point) for point in profile.get("profile_points", [])],
        direction_bins=[ShearDirectionBinResponse(**sector) for sector in profile.get("direction_bins", [])],
        time_of_day=[ShearTimeOfDayResponse(**item) for item in profile.get("time_of_day", [])],
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