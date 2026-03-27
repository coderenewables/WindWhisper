from __future__ import annotations

import calendar
import io
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PowerCurve


STANDARD_AIR_DENSITY_KG_PER_M3 = 1.225
DEFAULT_SPEED_BIN_WIDTH = 1.0
POWER_CURVE_SPEED_ALIASES = ("wind_speed_ms", "wind_speed", "speed", "ws", "windspeed")
POWER_CURVE_POWER_ALIASES = ("power_kw", "power", "kw", "output_kw", "power_output_kw")
DEFAULT_SAMPLE_POWER_CURVE_NAME = "Sample 3 MW Turbine"
DEFAULT_SAMPLE_POWER_CURVE_FILE_NAME = "sample_power_curve.csv"


def get_sample_power_curve_path() -> Path:
    return Path(__file__).resolve().parents[3] / "data" / DEFAULT_SAMPLE_POWER_CURVE_FILE_NAME


def _select_column(frame: pd.DataFrame, aliases: tuple[str, ...]) -> str | None:
    normalized = {str(column).strip().lower(): str(column) for column in frame.columns}
    for alias in aliases:
        if alias in normalized:
            return normalized[alias]
    return None


def _normalize_power_curve_frame(frame: pd.DataFrame) -> pd.DataFrame:
    speed_column = _select_column(frame, POWER_CURVE_SPEED_ALIASES)
    power_column = _select_column(frame, POWER_CURVE_POWER_ALIASES)
    if speed_column is None or power_column is None:
        raise ValueError("Power curve must include wind speed and power columns")

    normalized = pd.DataFrame(
        {
            "wind_speed_ms": pd.to_numeric(frame[speed_column], errors="coerce"),
            "power_kw": pd.to_numeric(frame[power_column], errors="coerce"),
        },
    )
    normalized = normalized.dropna(subset=["wind_speed_ms", "power_kw"])
    normalized = normalized.loc[(normalized["wind_speed_ms"] >= 0) & (normalized["power_kw"] >= 0)]
    normalized = normalized.groupby("wind_speed_ms", as_index=False, sort=True)["power_kw"].mean()
    normalized = normalized.sort_values("wind_speed_ms", kind="mergesort").reset_index(drop=True)

    if normalized.shape[0] < 2:
        raise ValueError("Power curve must contain at least two valid points")

    if not normalized["wind_speed_ms"].is_monotonic_increasing:
        normalized = normalized.sort_values("wind_speed_ms", kind="mergesort").reset_index(drop=True)

    return normalized


def parse_power_curve_csv(csv_content: str) -> pd.DataFrame:
    return _normalize_power_curve_frame(pd.read_csv(io.StringIO(csv_content)))


async def ensure_seeded_default_power_curve(db: AsyncSession) -> PowerCurve | None:
    existing = (
        await db.execute(
            select(PowerCurve).where(
                or_(
                    PowerCurve.file_name == DEFAULT_SAMPLE_POWER_CURVE_FILE_NAME,
                    PowerCurve.name == DEFAULT_SAMPLE_POWER_CURVE_NAME,
                ),
            ),
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    sample_path = get_sample_power_curve_path()
    if not sample_path.exists():
        return None

    curve = load_power_curve(str(sample_path))
    record = PowerCurve(
        name=DEFAULT_SAMPLE_POWER_CURVE_NAME,
        file_name=DEFAULT_SAMPLE_POWER_CURVE_FILE_NAME,
        summary_json=summarize_power_curve(curve),
        points_json=curve.to_dict(orient="records"),
    )
    db.add(record)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return (
            await db.execute(
                select(PowerCurve).where(
                    or_(
                        PowerCurve.file_name == DEFAULT_SAMPLE_POWER_CURVE_FILE_NAME,
                        PowerCurve.name == DEFAULT_SAMPLE_POWER_CURVE_NAME,
                    ),
                ),
            )
        ).scalar_one_or_none()

    await db.refresh(record)
    return record


def load_power_curve(file_path_or_data: str | dict[str, Any] | list[dict[str, Any]] | pd.DataFrame) -> pd.DataFrame:
    if isinstance(file_path_or_data, pd.DataFrame):
        return _normalize_power_curve_frame(file_path_or_data)

    if isinstance(file_path_or_data, list):
        return _normalize_power_curve_frame(pd.DataFrame(file_path_or_data))

    if isinstance(file_path_or_data, dict):
        if "points" in file_path_or_data:
            return _normalize_power_curve_frame(pd.DataFrame(file_path_or_data["points"]))
        return _normalize_power_curve_frame(pd.DataFrame(file_path_or_data))

    return _normalize_power_curve_frame(pd.read_csv(file_path_or_data))


def summarize_power_curve(power_curve: pd.DataFrame) -> dict[str, float | int | None]:
    curve = load_power_curve(power_curve)
    rated_power = float(curve["power_kw"].max()) if not curve.empty else 0.0
    positive_rows = curve.loc[curve["power_kw"] > 0]
    rated_rows = curve.loc[curve["power_kw"] >= rated_power * 0.99] if rated_power > 0 else curve.iloc[0:0]
    return {
        "point_count": int(curve.shape[0]),
        "rated_power_kw": rated_power,
        "cut_in_speed_ms": float(positive_rows["wind_speed_ms"].min()) if not positive_rows.empty else None,
        "rated_speed_ms": float(rated_rows["wind_speed_ms"].min()) if not rated_rows.empty else None,
        "cut_out_speed_ms": float(curve["wind_speed_ms"].max()) if not curve.empty else None,
    }


def apply_power_curve(speeds: np.ndarray, power_curve: pd.DataFrame) -> np.ndarray:
    speed_values = np.asarray(speeds, dtype=float)
    result = np.full(speed_values.shape, np.nan, dtype=float)
    curve = load_power_curve(power_curve)

    valid = np.isfinite(speed_values) & (speed_values >= 0)
    if not np.any(valid):
        return result

    curve_speeds = curve["wind_speed_ms"].to_numpy(dtype=float)
    curve_power = curve["power_kw"].to_numpy(dtype=float)
    right_value = float(curve_power[-1]) if curve_speeds[-1] >= speed_values[valid].max(initial=0.0) else float(curve_power[-1])
    result[valid] = np.interp(speed_values[valid], curve_speeds, curve_power, left=0.0, right=right_value)
    return result


def infer_time_step_hours(timestamps: pd.DatetimeIndex | list[pd.Timestamp] | None) -> float | None:
    if timestamps is None:
        return None

    index = pd.DatetimeIndex(timestamps)
    if index.size < 2:
        return None

    deltas = index.to_series().diff().dropna()
    if deltas.empty:
        return None

    median_delta = deltas.median()
    hours = float(median_delta.total_seconds() / 3600.0)
    return hours if hours > 0 else None


def _energy_from_power(power_kw: np.ndarray, time_step_hours: float) -> np.ndarray:
    power = np.asarray(power_kw, dtype=float)
    energy = np.full(power.shape, np.nan, dtype=float)
    valid = np.isfinite(power)
    if not np.any(valid) or time_step_hours <= 0:
        return energy
    energy[valid] = power[valid] * time_step_hours / 1000.0
    return energy


def gross_energy_estimate(
    speeds: np.ndarray,
    power_curve: pd.DataFrame,
    *,
    density: np.ndarray | None = None,
    air_density_adjustment: bool = False,
    timestamps: pd.DatetimeIndex | list[pd.Timestamp] | None = None,
    density_reference: float = STANDARD_AIR_DENSITY_KG_PER_M3,
) -> dict[str, Any]:
    speed_values = np.asarray(speeds, dtype=float)
    curve = load_power_curve(power_curve)
    power_kw = apply_power_curve(speed_values, curve)

    density_adjusted = False
    if air_density_adjustment and density is not None:
        density_values = np.asarray(density, dtype=float)
        valid_density = np.isfinite(density_values) & (density_values > 0)
        valid_power = np.isfinite(power_kw)
        combined = valid_density & valid_power
        adjusted_power = np.full(power_kw.shape, np.nan, dtype=float)
        adjusted_power[valid_power & ~valid_density] = power_kw[valid_power & ~valid_density]
        adjusted_power[combined] = power_kw[combined] * (density_values[combined] / density_reference)
        power_kw = adjusted_power
        density_adjusted = bool(np.any(combined))

    time_step_hours = infer_time_step_hours(timestamps)
    if time_step_hours is None:
        raise ValueError("At least two timestamps are required to estimate energy")

    energy_mwh = _energy_from_power(power_kw, time_step_hours)
    valid_power = power_kw[np.isfinite(power_kw)]
    rated_power = float(curve["power_kw"].max()) if not curve.empty else 0.0
    mean_power = float(np.mean(valid_power)) if valid_power.size else 0.0
    annual_energy = mean_power * 8760.0 / 1000.0
    capacity_factor = (mean_power / rated_power * 100.0) if rated_power > 0 else 0.0
    equivalent_full_load_hours = (annual_energy * 1000.0 / rated_power) if rated_power > 0 else 0.0

    return {
        "power_kw": power_kw,
        "energy_mwh": energy_mwh,
        "time_step_hours": time_step_hours,
        "summary": {
            "rated_power_kw": rated_power,
            "mean_power_kw": mean_power,
            "annual_energy_mwh": annual_energy,
            "capacity_factor_pct": capacity_factor,
            "equivalent_full_load_hours": equivalent_full_load_hours,
            "sample_count": int(valid_power.size),
            "air_density_adjusted": density_adjusted,
        },
    }


def energy_by_month(
    timestamps: pd.DatetimeIndex | list[pd.Timestamp],
    power_kw: np.ndarray,
    *,
    time_step_hours: float,
) -> list[dict[str, Any]]:
    index = pd.DatetimeIndex(timestamps)
    if index.empty:
        return []

    frame = pd.DataFrame({"power_kw": np.asarray(power_kw, dtype=float)}, index=index)
    frame["energy_mwh"] = _energy_from_power(frame["power_kw"].to_numpy(dtype=float), time_step_hours)

    rows: list[dict[str, Any]] = []
    for month, month_frame in frame.groupby(frame.index.month):
        valid_power = month_frame["power_kw"].dropna()
        rows.append(
            {
                "month": int(month),
                "label": calendar.month_abbr[int(month)],
                "energy_mwh": float(month_frame["energy_mwh"].sum(skipna=True)),
                "mean_power_kw": float(valid_power.mean()) if not valid_power.empty else None,
                "sample_count": int(valid_power.shape[0]),
            },
        )
    return rows


def energy_by_speed_bin(
    speeds: np.ndarray,
    power_kw: np.ndarray,
    *,
    time_step_hours: float,
    bin_width: float = DEFAULT_SPEED_BIN_WIDTH,
) -> list[dict[str, Any]]:
    speed_values = np.asarray(speeds, dtype=float)
    power_values = np.asarray(power_kw, dtype=float)
    valid = np.isfinite(speed_values) & np.isfinite(power_values) & (speed_values >= 0)
    if not np.any(valid):
        return []

    finite_speeds = speed_values[valid]
    finite_power = power_values[valid]
    lower = float(np.floor(finite_speeds.min()))
    upper = float(np.ceil(finite_speeds.max()))
    if upper <= lower:
        upper = lower + bin_width
    edges = np.arange(lower, upper + bin_width, bin_width, dtype=float)
    if edges.size < 2:
        edges = np.array([lower, lower + bin_width], dtype=float)

    rows: list[dict[str, Any]] = []
    for lower_edge, upper_edge in zip(edges[:-1], edges[1:], strict=False):
        if np.isclose(upper_edge, edges[-1]):
            mask = valid & (speed_values >= lower_edge) & (speed_values <= upper_edge)
        else:
            mask = valid & (speed_values >= lower_edge) & (speed_values < upper_edge)
        if not np.any(mask):
            rows.append(
                {
                    "lower": float(lower_edge),
                    "upper": float(upper_edge),
                    "center": float((lower_edge + upper_edge) / 2.0),
                    "sample_count": 0,
                    "mean_power_kw": None,
                    "energy_mwh": 0.0,
                },
            )
            continue

        selected_power = power_values[mask]
        rows.append(
            {
                "lower": float(lower_edge),
                "upper": float(upper_edge),
                "center": float((lower_edge + upper_edge) / 2.0),
                "sample_count": int(selected_power.size),
                "mean_power_kw": float(np.mean(selected_power)),
                "energy_mwh": float(np.nansum(_energy_from_power(selected_power, time_step_hours))),
            },
        )

    return rows