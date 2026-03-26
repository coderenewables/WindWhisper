from __future__ import annotations

import math
from typing import Any

import numpy as np


IEC_REFERENCE_INTENSITIES: dict[str, float] = {
    "A": 0.16,
    "B": 0.14,
    "C": 0.12,
}


def calculate_ti(speed_mean: np.ndarray, speed_sd: np.ndarray) -> np.ndarray:
    speed = np.asarray(speed_mean, dtype=float)
    sigma = np.asarray(speed_sd, dtype=float)
    ti = np.full(speed.shape, np.nan, dtype=float)

    valid = np.isfinite(speed) & np.isfinite(sigma) & (speed > 0) & (sigma >= 0)
    if not np.any(valid):
        return ti

    ti[valid] = sigma[valid] / speed[valid]
    return ti


def _clean_pairs(*arrays: np.ndarray) -> tuple[np.ndarray, ...]:
    converted = [np.asarray(array, dtype=float) for array in arrays]
    if not converted:
        return tuple()

    mask = np.ones(converted[0].shape, dtype=bool)
    for array in converted:
        mask &= np.isfinite(array)

    return tuple(array[mask] for array in converted)


def _iec_curve_value(speed: np.ndarray | float, reference_intensity: float) -> np.ndarray:
    speeds = np.asarray(speed, dtype=float)
    safe_speeds = np.maximum(speeds, 0.1)
    return reference_intensity * (0.75 + (5.6 / safe_speeds))


def _empty_summary() -> dict[str, Any]:
    return {
        "mean_ti": None,
        "median_ti": None,
        "p90_ti": None,
        "characteristic_ti_15": None,
        "iec_class": None,
        "sample_count": 0,
        "mean_speed": None,
    }


def _classify_iec(characteristic_ti_15: float | None) -> str | None:
    if characteristic_ti_15 is None or not math.isfinite(characteristic_ti_15):
        return None

    class_thresholds = {
        label: float(_iec_curve_value(15.0, reference))
        for label, reference in IEC_REFERENCE_INTENSITIES.items()
    }
    if characteristic_ti_15 <= class_thresholds["C"]:
        return "IEC Class C"
    if characteristic_ti_15 <= class_thresholds["B"]:
        return "IEC Class B"
    if characteristic_ti_15 <= class_thresholds["A"]:
        return "IEC Class A"
    return "Above IEC Class A"


def ti_by_speed_bin(speeds: np.ndarray, ti_values: np.ndarray, bin_width: float = 1.0) -> list[dict[str, Any]]:
    cleaned_speeds, cleaned_ti = _clean_pairs(speeds, ti_values)
    if cleaned_speeds.size == 0:
        return []

    positive_mask = (cleaned_speeds > 0) & (cleaned_ti >= 0)
    cleaned_speeds = cleaned_speeds[positive_mask]
    cleaned_ti = cleaned_ti[positive_mask]
    if cleaned_speeds.size == 0:
        return []

    lower_edge = math.floor(float(np.min(cleaned_speeds)) / bin_width) * bin_width
    upper_edge = math.ceil(float(np.max(cleaned_speeds)) / bin_width) * bin_width
    if math.isclose(lower_edge, upper_edge):
        upper_edge = lower_edge + bin_width

    edges = np.arange(lower_edge, upper_edge + bin_width, bin_width, dtype=float)
    if edges.size < 2:
        edges = np.array([lower_edge, lower_edge + bin_width], dtype=float)

    bins: list[dict[str, Any]] = []
    for lower, upper in zip(edges[:-1], edges[1:], strict=False):
        if math.isclose(upper, edges[-1]):
            mask = (cleaned_speeds >= lower) & (cleaned_speeds <= upper)
        else:
            mask = (cleaned_speeds >= lower) & (cleaned_speeds < upper)

        bin_ti = cleaned_ti[mask]
        count = int(bin_ti.size)
        std_ti = float(np.std(bin_ti, ddof=0)) if count else None
        mean_ti = float(np.mean(bin_ti)) if count else None
        representative_ti = (mean_ti + 1.28 * std_ti) if mean_ti is not None and std_ti is not None else None
        p90_ti = float(np.percentile(bin_ti, 90)) if count else None
        center = float((lower + upper) / 2.0)
        bins.append(
            {
                "lower": float(lower),
                "upper": float(upper),
                "center": center,
                "sample_count": count,
                "mean_ti": mean_ti,
                "representative_ti": representative_ti,
                "p90_ti": p90_ti,
                "iec_class_a": float(_iec_curve_value(center, IEC_REFERENCE_INTENSITIES["A"])),
                "iec_class_b": float(_iec_curve_value(center, IEC_REFERENCE_INTENSITIES["B"])),
                "iec_class_c": float(_iec_curve_value(center, IEC_REFERENCE_INTENSITIES["C"])),
            },
        )

    return bins


def ti_by_direction(directions: np.ndarray, ti_values: np.ndarray, num_sectors: int = 12) -> list[dict[str, Any]]:
    cleaned_directions, cleaned_ti = _clean_pairs(directions, ti_values)
    if cleaned_directions.size == 0:
        return []

    mask = cleaned_ti >= 0
    cleaned_directions = np.mod(cleaned_directions[mask], 360.0)
    cleaned_ti = cleaned_ti[mask]
    if cleaned_directions.size == 0:
        return []

    sector_width = 360.0 / float(num_sectors)
    shifted = (cleaned_directions + (sector_width / 2.0)) % 360.0
    sector_indices = np.floor(shifted / sector_width).astype(int)

    bins: list[dict[str, Any]] = []
    for sector_index in range(num_sectors):
        sector_ti = cleaned_ti[sector_indices == sector_index]
        count = int(sector_ti.size)
        bins.append(
            {
                "sector_index": sector_index,
                "direction": float(sector_index * sector_width),
                "start_angle": float((sector_index * sector_width - sector_width / 2.0) % 360.0),
                "end_angle": float((sector_index * sector_width + sector_width / 2.0) % 360.0),
                "mean_ti": float(np.mean(sector_ti)) if count else None,
                "representative_ti": float(np.mean(sector_ti) + 1.28 * np.std(sector_ti, ddof=0)) if count else None,
                "p90_ti": float(np.percentile(sector_ti, 90)) if count else None,
                "sample_count": count,
            },
        )

    return bins


def characteristic_ti_at_speed(speed_bins: list[dict[str, Any]], target_speed: float = 15.0) -> float | None:
    populated = [item for item in speed_bins if item.get("representative_ti") is not None]
    if not populated:
        return None

    for item in populated:
        lower = float(item["lower"])
        upper = float(item["upper"])
        if lower <= target_speed <= upper:
            return float(item["representative_ti"])

    centers = np.asarray([float(item["center"]) for item in populated], dtype=float)
    representative = np.asarray([float(item["representative_ti"]) for item in populated], dtype=float)
    if centers.size == 1:
        return float(representative[0])

    order = np.argsort(centers)
    return float(np.interp(target_speed, centers[order], representative[order]))


def ti_summary(speeds: np.ndarray, ti_values: np.ndarray, *, speed_bins: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    cleaned_speeds, cleaned_ti = _clean_pairs(speeds, ti_values)
    mask = (cleaned_speeds > 0) & (cleaned_ti >= 0)
    cleaned_speeds = cleaned_speeds[mask]
    cleaned_ti = cleaned_ti[mask]
    if cleaned_speeds.size == 0:
        return _empty_summary()

    calculated_bins = speed_bins if speed_bins is not None else ti_by_speed_bin(cleaned_speeds, cleaned_ti)
    characteristic = characteristic_ti_at_speed(calculated_bins, target_speed=15.0)
    return {
        "mean_ti": float(np.mean(cleaned_ti)),
        "median_ti": float(np.median(cleaned_ti)),
        "p90_ti": float(np.percentile(cleaned_ti, 90)),
        "characteristic_ti_15": characteristic,
        "iec_class": _classify_iec(characteristic),
        "sample_count": int(cleaned_ti.size),
        "mean_speed": float(np.mean(cleaned_speeds)),
    }


def iec_reference_curves(min_speed: float, max_speed: float, point_count: int = 60) -> list[dict[str, Any]]:
    lower = max(0.5, float(min_speed))
    upper = max(lower + 0.5, float(max_speed))
    speeds = np.linspace(lower, upper, point_count, dtype=float)
    curves: list[dict[str, Any]] = []
    for label, intensity in IEC_REFERENCE_INTENSITIES.items():
        values = _iec_curve_value(speeds, intensity)
        curves.append(
            {
                "label": f"IEC Class {label}",
                "reference_intensity": intensity,
                "points": [
                    {"speed": float(speed), "ti": float(value)}
                    for speed, value in zip(speeds, values, strict=False)
                ],
            },
        )
    return curves


def build_scatter_points(speeds: np.ndarray, ti_values: np.ndarray, max_points: int = 4000) -> list[dict[str, float]]:
    cleaned_speeds, cleaned_ti = _clean_pairs(speeds, ti_values)
    mask = (cleaned_speeds > 0) & (cleaned_ti >= 0)
    cleaned_speeds = cleaned_speeds[mask]
    cleaned_ti = cleaned_ti[mask]
    if cleaned_speeds.size == 0:
        return []

    if cleaned_speeds.size > max_points:
        indices = np.linspace(0, cleaned_speeds.size - 1, max_points, dtype=int)
        cleaned_speeds = cleaned_speeds[indices]
        cleaned_ti = cleaned_ti[indices]

    return [
        {"speed": float(speed), "ti": float(ti)}
        for speed, ti in zip(cleaned_speeds, cleaned_ti, strict=False)
    ]