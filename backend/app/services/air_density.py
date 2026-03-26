from __future__ import annotations

import calendar
from typing import Any

import numpy as np
import pandas as pd


DRY_AIR_GAS_CONSTANT = 287.05
STANDARD_PRESSURE_HPA = 1013.25


def calculate_air_density(temperature_C: np.ndarray, pressure_hPa: np.ndarray) -> np.ndarray:
    temperature = np.asarray(temperature_C, dtype=float)
    pressure = np.asarray(pressure_hPa, dtype=float)
    density = np.full(temperature.shape, np.nan, dtype=float)

    valid = np.isfinite(temperature) & np.isfinite(pressure)
    if not np.any(valid):
        return density

    kelvin = temperature[valid] + 273.15
    valid_kelvin = kelvin > 0
    if not np.any(valid_kelvin):
        return density

    valid_indices = np.where(valid)[0]
    density_indices = valid_indices[valid_kelvin]
    density[density_indices] = (pressure[valid][valid_kelvin] * 100.0) / (DRY_AIR_GAS_CONSTANT * kelvin[valid_kelvin])
    return density


def estimate_pressure_from_elevation(elevation_m: float) -> float:
    elevation = max(float(elevation_m), -500.0)
    return float(STANDARD_PRESSURE_HPA * np.power(1.0 - (2.25577e-5 * elevation), 5.25588))


def wind_power_density(speeds: np.ndarray, density: np.ndarray) -> np.ndarray:
    speed = np.asarray(speeds, dtype=float)
    rho = np.asarray(density, dtype=float)
    result = np.full(speed.shape, np.nan, dtype=float)

    valid = np.isfinite(speed) & np.isfinite(rho) & (speed >= 0)
    if not np.any(valid):
        return result

    result[valid] = 0.5 * rho[valid] * np.power(speed[valid], 3)
    return result


def _summary(values: np.ndarray) -> dict[str, float | int | None]:
    valid = values[np.isfinite(values)]
    if valid.size == 0:
        return {
            "mean": None,
            "median": None,
            "std": None,
            "min": None,
            "max": None,
            "count": 0,
        }

    return {
        "mean": float(np.mean(valid)),
        "median": float(np.median(valid)),
        "std": float(np.std(valid, ddof=0)),
        "min": float(np.min(valid)),
        "max": float(np.max(valid)),
        "count": int(valid.size),
    }


def air_density_summary(density: np.ndarray, wind_power_density_values: np.ndarray | None = None) -> dict[str, Any]:
    density_stats = _summary(np.asarray(density, dtype=float))
    wpd_stats = _summary(np.asarray(wind_power_density_values, dtype=float)) if wind_power_density_values is not None else _summary(np.array([], dtype=float))
    return {
        "mean_density": density_stats["mean"],
        "median_density": density_stats["median"],
        "std_density": density_stats["std"],
        "min_density": density_stats["min"],
        "max_density": density_stats["max"],
        "sample_count": density_stats["count"],
        "mean_wind_power_density": wpd_stats["mean"],
        "annual_wind_power_density": wpd_stats["mean"],
    }


def monthly_averages(
    timestamps: list[pd.Timestamp] | pd.DatetimeIndex,
    density: np.ndarray,
    wind_power_density_values: np.ndarray,
) -> list[dict[str, Any]]:
    index = pd.DatetimeIndex(timestamps)
    frame = pd.DataFrame(
        {
            "density": np.asarray(density, dtype=float),
            "wind_power_density": np.asarray(wind_power_density_values, dtype=float),
        },
        index=index,
    )
    if frame.empty:
        return []

    grouped = frame.groupby(frame.index.month)
    rows: list[dict[str, Any]] = []
    for month_number, month_frame in grouped:
        density_values = month_frame["density"].to_numpy(dtype=float)
        wpd_values = month_frame["wind_power_density"].to_numpy(dtype=float)
        density_stats = _summary(density_values)
        wpd_stats = _summary(wpd_values)
        rows.append(
            {
                "month": int(month_number),
                "label": calendar.month_abbr[int(month_number)],
                "mean_density": density_stats["mean"],
                "mean_wind_power_density": wpd_stats["mean"],
                "sample_count": density_stats["count"],
            },
        )
    return rows


def build_density_points(
    timestamps: list[pd.Timestamp] | pd.DatetimeIndex,
    density: np.ndarray,
    wind_power_density_values: np.ndarray,
    max_points: int = 240,
) -> list[dict[str, Any]]:
    index = pd.DatetimeIndex(timestamps)
    density_values = np.asarray(density, dtype=float)
    wpd_values = np.asarray(wind_power_density_values, dtype=float)
    if index.empty:
        return []

    if len(index) > max_points:
        sample_indices = np.linspace(0, len(index) - 1, max_points, dtype=int)
        index = index[sample_indices]
        density_values = density_values[sample_indices]
        wpd_values = wpd_values[sample_indices]

    return [
        {
            "timestamp": timestamp.to_pydatetime() if hasattr(timestamp, "to_pydatetime") else timestamp,
            "density": None if not np.isfinite(density_value) else float(density_value),
            "wind_power_density": None if not np.isfinite(wpd_value) else float(wpd_value),
        }
        for timestamp, density_value, wpd_value in zip(index, density_values, wpd_values, strict=False)
    ]