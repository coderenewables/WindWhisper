from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd


def calculate_power_law_alpha(
    speed_lower: np.ndarray,
    speed_upper: np.ndarray,
    height_lower: float,
    height_upper: float,
) -> np.ndarray:
    lower = np.asarray(speed_lower, dtype=float)
    upper = np.asarray(speed_upper, dtype=float)
    alpha = np.full(lower.shape, np.nan, dtype=float)

    if height_lower <= 0 or height_upper <= 0 or math.isclose(height_lower, height_upper):
        return alpha

    valid = np.isfinite(lower) & np.isfinite(upper) & (lower > 0) & (upper > 0)
    if not np.any(valid):
        return alpha

    denominator = math.log(height_upper / height_lower)
    alpha[valid] = np.log(upper[valid] / lower[valid]) / denominator
    return alpha


def calculate_log_law_roughness(
    speed_lower: np.ndarray,
    speed_upper: np.ndarray,
    height_lower: float,
    height_upper: float,
) -> np.ndarray:
    lower = np.asarray(speed_lower, dtype=float)
    upper = np.asarray(speed_upper, dtype=float)
    roughness = np.full(lower.shape, np.nan, dtype=float)

    if height_lower <= 0 or height_upper <= 0 or math.isclose(height_lower, height_upper):
        return roughness

    valid = np.isfinite(lower) & np.isfinite(upper) & ~np.isclose(lower, upper)
    if not np.any(valid):
        return roughness

    numerator = lower[valid] * math.log(height_upper) - upper[valid] * math.log(height_lower)
    denominator = lower[valid] - upper[valid]
    candidate = np.exp(numerator / denominator)
    candidate_valid = np.isfinite(candidate) & (candidate > 0) & (candidate < min(height_lower, height_upper))
    roughness_indices = np.where(valid)[0]
    roughness[roughness_indices[candidate_valid]] = candidate[candidate_valid]
    return roughness


def extrapolate_speed(
    speeds: np.ndarray,
    height_from: float,
    height_to: float,
    alpha_or_z0: np.ndarray,
    method: str = "power",
) -> np.ndarray:
    source = np.asarray(speeds, dtype=float)
    parameter = np.asarray(alpha_or_z0, dtype=float)
    result = np.full(source.shape, np.nan, dtype=float)

    if height_from <= 0 or height_to <= 0:
        return result

    valid = np.isfinite(source) & (source > 0) & np.isfinite(parameter)
    if not np.any(valid):
        return result

    if method == "log":
        valid &= (parameter > 0) & (parameter < min(height_from, height_to))
        if not np.any(valid):
            return result
        numerator = np.log(height_to / parameter[valid])
        denominator = np.log(height_from / parameter[valid])
        non_zero = ~np.isclose(denominator, 0.0)
        valid_indices = np.where(valid)[0]
        result_indices = valid_indices[non_zero]
        result[result_indices] = source[result_indices] * numerator[non_zero] / denominator[non_zero]
        return result

    result[valid] = source[valid] * np.power(height_to / height_from, parameter[valid])
    return result


def _summarize(values: np.ndarray) -> dict[str, float | int | None]:
    valid = values[np.isfinite(values)]
    if valid.size == 0:
        return {"mean_value": None, "median_value": None, "std_value": None, "count": 0}
    return {
        "mean_value": float(np.mean(valid)),
        "median_value": float(np.median(valid)),
        "std_value": float(np.std(valid, ddof=0)),
        "count": int(valid.size),
    }


def _select_representative_pair(pair_stats: list[dict[str, Any]], target_height: float | None) -> dict[str, Any] | None:
    if not pair_stats:
        return None
    if target_height is None:
        return max(pair_stats, key=lambda pair: (pair["count"], pair["upper_height_m"] - pair["lower_height_m"]))

    def score(pair: dict[str, Any]) -> tuple[int, float, int, float]:
        lower = pair["lower_height_m"]
        upper = pair["upper_height_m"]
        brackets = 1 if lower <= target_height <= upper else 0
        distance = min(abs(target_height - lower), abs(target_height - upper))
        span = upper - lower
        return (brackets, -distance, pair["count"], span)

    return max(pair_stats, key=score)


def shear_profile(
    speeds_by_height: dict[float, np.ndarray],
    *,
    column_ids_by_height: dict[float, uuid.UUID],
    timestamps: list[datetime] | None = None,
    directions: np.ndarray | None = None,
    method: str = "power",
    num_sectors: int = 12,
    target_height: float | None = None,
) -> dict[str, Any]:
    heights = sorted(height for height in speeds_by_height if height is not None)
    pair_stats: list[dict[str, Any]] = []

    for index, lower_height in enumerate(heights[:-1]):
        for upper_height in heights[index + 1 :]:
            lower_speed = np.asarray(speeds_by_height[lower_height], dtype=float)
            upper_speed = np.asarray(speeds_by_height[upper_height], dtype=float)
            values = (
                calculate_log_law_roughness(lower_speed, upper_speed, lower_height, upper_height)
                if method == "log"
                else calculate_power_law_alpha(lower_speed, upper_speed, lower_height, upper_height)
            )
            pair_stats.append(
                {
                    "lower_column_id": column_ids_by_height[lower_height],
                    "upper_column_id": column_ids_by_height[upper_height],
                    "lower_height_m": float(lower_height),
                    "upper_height_m": float(upper_height),
                    **_summarize(values),
                    "series": values,
                }
            )

    representative = _select_representative_pair(pair_stats, target_height)
    direction_bins: list[dict[str, Any]] = []
    time_of_day: list[dict[str, Any]] = []
    target_mean_speed: float | None = None
    profile_points = [
        {
            "height_m": float(height),
            "mean_speed": float(np.nanmean(np.asarray(speeds_by_height[height], dtype=float))) if np.isfinite(np.asarray(speeds_by_height[height], dtype=float)).any() else None,
            "source": "measured",
        }
        for height in heights
    ]

    if representative is not None:
        representative_values = np.asarray(representative["series"], dtype=float)
        if directions is not None and np.isfinite(directions).any():
            sector_width = 360.0 / num_sectors
            normalized_directions = np.mod(directions, 360.0)
            for sector_index in range(num_sectors):
                shifted = (normalized_directions + sector_width / 2.0) % 360.0
                mask = np.floor(shifted / sector_width).astype(int) == sector_index
                stats = _summarize(representative_values[mask])
                direction_bins.append(
                    {
                        "sector_index": sector_index,
                        "direction": float(sector_index * sector_width),
                        "start_angle": float((sector_index * sector_width - sector_width / 2.0) % 360.0),
                        "end_angle": float((sector_index * sector_width + sector_width / 2.0) % 360.0),
                        **stats,
                    }
                )

        if timestamps is not None and len(timestamps) == representative_values.shape[0]:
            for hour in range(24):
                mask = np.array([timestamp.hour == hour for timestamp in timestamps], dtype=bool)
                time_of_day.append({"hour": hour, **_summarize(representative_values[mask])})

        if target_height is not None:
            lower_height = representative["lower_height_m"]
            upper_height = representative["upper_height_m"]
            lower_speed = np.asarray(speeds_by_height[lower_height], dtype=float)
            upper_speed = np.asarray(speeds_by_height[upper_height], dtype=float)
            parameter = representative_values
            source_speed = lower_speed
            source_height = lower_height

            if target_height < lower_height:
                source_speed = upper_speed
                source_height = upper_height
            extrapolated = extrapolate_speed(source_speed, float(source_height), float(target_height), parameter, method=method)
            valid = extrapolated[np.isfinite(extrapolated)]
            target_mean_speed = float(np.mean(valid)) if valid.size else None
            profile_points.append({"height_m": float(target_height), "mean_speed": target_mean_speed, "source": "extrapolated"})

    return {
        "pair_stats": [
            {key: value for key, value in pair.items() if key != "series"}
            for pair in pair_stats
        ],
        "representative_pair": None if representative is None else {key: value for key, value in representative.items() if key != "series"},
        "profile_points": profile_points,
        "direction_bins": direction_bins,
        "time_of_day": time_of_day,
        "target_mean_speed": target_mean_speed,
    }


def extrapolate_to_height(
    speeds_by_height: dict[float, np.ndarray],
    *,
    column_ids_by_height: dict[float, uuid.UUID],
    target_height: float,
    method: str = "power",
) -> dict[str, Any]:
    profile = shear_profile(
        speeds_by_height,
        column_ids_by_height=column_ids_by_height,
        method=method,
        target_height=target_height,
    )
    representative = profile["representative_pair"]
    if representative is None:
        return {"representative_pair": None, "values": np.array([], dtype=float)}

    lower_height = float(representative["lower_height_m"])
    upper_height = float(representative["upper_height_m"])
    lower_speed = np.asarray(speeds_by_height[lower_height], dtype=float)
    upper_speed = np.asarray(speeds_by_height[upper_height], dtype=float)
    parameter = (
        calculate_log_law_roughness(lower_speed, upper_speed, lower_height, upper_height)
        if method == "log"
        else calculate_power_law_alpha(lower_speed, upper_speed, lower_height, upper_height)
    )
    source_speed = lower_speed
    source_height = lower_height
    if target_height < lower_height:
        source_speed = upper_speed
        source_height = upper_height

    values = extrapolate_speed(source_speed, source_height, target_height, parameter, method=method)
    return {"representative_pair": representative, "values": values}