from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any, cast

import numpy as np
import pandas as pd
from scipy import stats


DEFAULT_RETURN_PERIODS: tuple[float, ...] = (10.0, 20.0, 50.0, 100.0)


def annual_maxima(speeds: pd.Series) -> pd.Series:
    series = pd.to_numeric(speeds, errors="coerce").dropna().astype(float)
    if series.empty:
        return pd.Series(dtype=float)
    if not isinstance(series.index, pd.DatetimeIndex):
        raise ValueError("annual_maxima requires a DatetimeIndex")
    return series.groupby(series.index.year).max().sort_index()


def fit_gumbel(annual_max: np.ndarray) -> dict[str, float | None]:
    values = np.asarray(annual_max, dtype=float)
    valid = values[np.isfinite(values)]
    if valid.size < 2:
        return {"location": None, "scale": None}

    location, scale = stats.gumbel_r.fit(valid)
    if not np.isfinite(location) or not np.isfinite(scale) or scale <= 0:
        return {"location": None, "scale": None}

    return {"location": float(location), "scale": float(scale)}


def return_period_speed(gumbel_params: dict[str, float | None], return_period_years: float) -> float | None:
    location = gumbel_params.get("location")
    scale = gumbel_params.get("scale")
    if location is None or scale is None:
        return None

    return_period = float(return_period_years)
    if return_period <= 1:
        return None

    probability = 1.0 - (1.0 / return_period)
    if probability <= 0 or probability >= 1:
        return None

    value = stats.gumbel_r.ppf(probability, loc=location, scale=scale)
    if not np.isfinite(value):
        return None
    return float(value)


def _record_years(series: pd.Series) -> float:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.size < 2:
        return 0.0
    index = pd.DatetimeIndex(clean.index)
    total_seconds = (index.max() - index.min()).total_seconds()
    return max(0.0, total_seconds / (365.25 * 24 * 3600))


def _annual_maximum_rows(speed_series: pd.Series, gust_series: pd.Series | None, source: str) -> list[dict[str, Any]]:
    speed_index = pd.DatetimeIndex(speed_series.dropna().index)
    years: set[int] = set(speed_index.year.tolist())
    if gust_series is not None:
        years.update(pd.DatetimeIndex(gust_series.dropna().index).year.tolist())

    rows: list[dict[str, Any]] = []
    source_series = gust_series if source == "gust" and gust_series is not None else speed_series
    for year in sorted(years):
        speed_mask = pd.DatetimeIndex(speed_series.index).year == year
        speed_year = pd.to_numeric(speed_series.loc[speed_mask], errors="coerce").dropna()
        if gust_series is not None:
            gust_mask = pd.DatetimeIndex(gust_series.index).year == year
            gust_year = pd.to_numeric(gust_series.loc[gust_mask], errors="coerce").dropna()
        else:
            gust_year = pd.Series(dtype=float)
        source_mask = pd.DatetimeIndex(source_series.index).year == year
        source_year = pd.to_numeric(source_series.loc[source_mask], errors="coerce").dropna()
        source_timestamp = source_year.idxmax() if not source_year.empty else None
        rows.append(
            {
                "year": int(year),
                "timestamp": source_timestamp.to_pydatetime() if isinstance(source_timestamp, pd.Timestamp) else source_timestamp,
                "speed_max": float(speed_year.max()) if not speed_year.empty else None,
                "gust_max": float(gust_year.max()) if not gust_year.empty else None,
                "analysis_value": float(source_year.max()) if not source_year.empty else None,
            },
        )
    return rows


def _empirical_points(annual_max: pd.Series) -> list[dict[str, float | int]]:
    clean = annual_max.dropna().sort_values(ascending=False)
    if clean.empty:
        return []

    sample_count = len(clean)
    points: list[dict[str, float | int]] = []
    for rank, (year, value) in enumerate(clean.items(), start=1):
        points.append(
            {
                "year": int(cast(int, year)),
                "rank": rank,
                "return_period_years": float((sample_count + 1) / rank),
                "speed": float(value),
            },
        )
    return points


def _confidence_intervals(annual_max: np.ndarray, return_periods: Sequence[float], bootstrap_samples: int = 300) -> dict[float, tuple[float | None, float | None]]:
    valid = np.asarray(annual_max, dtype=float)
    valid = valid[np.isfinite(valid)]
    intervals: dict[float, tuple[float | None, float | None]] = {float(period): (None, None) for period in return_periods}
    if valid.size < 3:
        return intervals

    rng = np.random.default_rng(42)
    bootstrapped: dict[float, list[float]] = {float(period): [] for period in return_periods}
    for _ in range(bootstrap_samples):
        sampled = rng.choice(valid, size=valid.size, replace=True)
        params = fit_gumbel(sampled)
        if params["location"] is None or params["scale"] is None:
            continue
        for period in return_periods:
            return_value = return_period_speed(params, float(period))
            if return_value is not None and np.isfinite(return_value):
                bootstrapped[float(period)].append(float(return_value))

    for period, samples in bootstrapped.items():
        if not samples:
            continue
        intervals[period] = (float(np.percentile(samples, 2.5)), float(np.percentile(samples, 97.5)))
    return intervals


def extreme_wind_summary(
    speeds: pd.Series,
    gust_series: pd.Series | None = None,
    *,
    return_periods: Iterable[float] = DEFAULT_RETURN_PERIODS,
    max_curve_points: int = 80,
) -> dict[str, Any]:
    speed_series = pd.to_numeric(speeds, errors="coerce").dropna().astype(float)
    gust_clean = pd.to_numeric(gust_series, errors="coerce").dropna().astype(float) if gust_series is not None else None
    source = "gust" if gust_clean is not None and not gust_clean.empty else "speed"
    analysis_series = gust_clean if source == "gust" and gust_clean is not None else speed_series
    normalized_periods = [float(period) for period in return_periods if float(period) > 1]
    if not normalized_periods:
        normalized_periods = list(DEFAULT_RETURN_PERIODS)

    annual_series = annual_maxima(analysis_series)
    annual_speed = annual_maxima(speed_series)
    annual_gust = annual_maxima(gust_clean) if gust_clean is not None else pd.Series(dtype=float)
    record_years = _record_years(analysis_series)
    short_record_warning = record_years < 1.0
    params = fit_gumbel(annual_series.to_numpy(dtype=float))
    intervals = _confidence_intervals(annual_series.to_numpy(dtype=float), normalized_periods)

    return_period_rows: list[dict[str, Any]] = []
    for period in normalized_periods:
        lower_ci, upper_ci = intervals[period]
        return_period_rows.append(
            {
                "return_period_years": period,
                "speed": return_period_speed(params, period),
                "lower_ci": lower_ci,
                "upper_ci": upper_ci,
            },
        )

    curve_limit = max(max(normalized_periods), float(len(annual_series) + 2), 2.0)
    curve_periods = np.geomspace(1.01, curve_limit, max(24, max_curve_points))
    curve_points = [
        {"return_period_years": float(period), "speed": speed, "lower_ci": None, "upper_ci": None}
        for period in curve_periods
        if (speed := return_period_speed(params, float(period))) is not None
    ]

    gust_factor = None
    if not annual_gust.empty and not annual_speed.empty:
        common_years = annual_gust.index.intersection(annual_speed.index)
        if len(common_years) > 0:
            annual_speed_values = annual_speed.loc[common_years].to_numpy(dtype=float)
            annual_gust_values = annual_gust.loc[common_years].to_numpy(dtype=float)
            valid = annual_speed_values > 0
            if np.any(valid):
                gust_factor = float(np.mean(annual_gust_values[valid] / annual_speed_values[valid]))

    summary = {
        "data_source": source,
        "record_years": float(record_years),
        "annual_max_count": int(len(annual_series)),
        "ve10": next((row["speed"] for row in return_period_rows if row["return_period_years"] == 10.0), None),
        "ve20": next((row["speed"] for row in return_period_rows if row["return_period_years"] == 20.0), None),
        "ve50": next((row["speed"] for row in return_period_rows if row["return_period_years"] == 50.0), None),
        "ve100": next((row["speed"] for row in return_period_rows if row["return_period_years"] == 100.0), None),
        "gust_factor": gust_factor,
        "short_record_warning": short_record_warning,
        "warning_message": "Record shorter than one year. Extreme-wind estimates are indicative only." if short_record_warning else None,
    }

    return {
        "summary": summary,
        "gumbel_fit": {
            "location": params["location"],
            "scale": params["scale"],
            "sample_count": int(len(annual_series)),
        },
        "annual_maxima": _annual_maximum_rows(speed_series, gust_clean, source),
        "return_periods": return_period_rows,
        "return_period_curve": curve_points,
        "observed_points": _empirical_points(annual_series),
    }