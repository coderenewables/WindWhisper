from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from app.services.energy_estimate import (
    apply_power_curve,
    energy_by_month,
    energy_by_speed_bin,
    gross_energy_estimate,
    infer_time_step_hours,
    load_power_curve,
    parse_power_curve_csv,
    summarize_power_curve,
)


# ---------------------------------------------------------------------------
# Power curve parsing and summarisation
# ---------------------------------------------------------------------------


def test_parse_power_curve_csv_produces_sorted_frame() -> None:
    csv = "wind_speed_ms,power_kw\n0,0\n4,120\n8,1350\n12,3000\n25,0\n"
    curve = parse_power_curve_csv(csv)

    assert list(curve.columns) == ["wind_speed_ms", "power_kw"]
    assert curve.shape[0] == 5
    assert curve["wind_speed_ms"].is_monotonic_increasing


def test_parse_power_curve_csv_rejects_single_point() -> None:
    csv = "wind_speed_ms,power_kw\n5,100\n"
    with pytest.raises(ValueError, match="at least two"):
        parse_power_curve_csv(csv)


def test_summarize_power_curve_extracts_key_metrics() -> None:
    curve = pd.DataFrame(
        {
            "wind_speed_ms": [0.0, 3.0, 8.0, 12.0, 25.0],
            "power_kw": [0.0, 50.0, 1200.0, 3000.0, 0.0],
        },
    )
    summary = summarize_power_curve(curve)
    assert summary["rated_power_kw"] == 3000.0
    assert summary["cut_in_speed_ms"] == 3.0
    assert summary["point_count"] == 5


def test_load_power_curve_from_list_of_dicts() -> None:
    points = [
        {"wind_speed_ms": 0, "power_kw": 0},
        {"wind_speed_ms": 10, "power_kw": 1500},
        {"wind_speed_ms": 25, "power_kw": 0},
    ]
    curve = load_power_curve(points)
    assert curve.shape[0] == 3


# ---------------------------------------------------------------------------
# apply_power_curve
# ---------------------------------------------------------------------------


def test_apply_power_curve_interpolates_between_points() -> None:
    curve = pd.DataFrame(
        {
            "wind_speed_ms": [0.0, 5.0, 10.0, 15.0, 25.0],
            "power_kw": [0.0, 250.0, 1500.0, 3000.0, 0.0],
        },
    )
    speeds = np.array([0.0, 5.0, 7.5, 10.0, 15.0, 25.0])
    power = apply_power_curve(speeds, curve)

    assert power[0] == 0.0
    assert power[1] == 250.0
    assert power[2] == pytest.approx(875.0, abs=1.0)
    assert power[3] == 1500.0
    assert power[4] == 3000.0
    assert power[5] == 0.0


def test_apply_power_curve_handles_nan_and_negative() -> None:
    curve = pd.DataFrame(
        {"wind_speed_ms": [0.0, 10.0, 25.0], "power_kw": [0.0, 1500.0, 0.0]},
    )
    speeds = np.array([np.nan, -1.0, 5.0])
    power = apply_power_curve(speeds, curve)

    assert np.isnan(power[0])
    assert np.isnan(power[1])
    assert np.isfinite(power[2])


# ---------------------------------------------------------------------------
# infer_time_step_hours
# ---------------------------------------------------------------------------


def test_infer_time_step_from_10_minute_data() -> None:
    index = pd.date_range("2025-01-01", periods=10, freq="10min")
    result = infer_time_step_hours(index)
    assert result == pytest.approx(10.0 / 60.0, abs=1e-6)


def test_infer_time_step_returns_none_for_single_timestamp() -> None:
    index = pd.date_range("2025-01-01", periods=1, freq="h")
    assert infer_time_step_hours(index) is None


# ---------------------------------------------------------------------------
# gross_energy_estimate
# ---------------------------------------------------------------------------


def test_gross_energy_estimate_basic_calculation() -> None:
    curve = pd.DataFrame(
        {
            "wind_speed_ms": [0.0, 5.0, 10.0, 15.0, 25.0],
            "power_kw": [0.0, 250.0, 1500.0, 3000.0, 0.0],
        },
    )
    speeds = np.array([5.0, 10.0, 10.0, 10.0])
    timestamps = pd.date_range("2025-01-01", periods=4, freq="h")

    result = gross_energy_estimate(speeds, curve, timestamps=timestamps)
    expected_mean_power = (250.0 + 1500.0 * 3) / 4.0
    assert result["summary"]["mean_power_kw"] == pytest.approx(expected_mean_power, abs=0.1)
    assert result["summary"]["annual_energy_mwh"] == pytest.approx(expected_mean_power * 8760.0 / 1000.0, rel=1e-6)
    assert result["summary"]["air_density_adjusted"] is False


def test_gross_energy_estimate_with_density_adjustment() -> None:
    curve = pd.DataFrame(
        {
            "wind_speed_ms": [0.0, 5.0, 10.0, 25.0],
            "power_kw": [0.0, 250.0, 1500.0, 0.0],
        },
    )
    speeds = np.array([10.0, 10.0])
    timestamps = pd.date_range("2025-01-01", periods=2, freq="h")
    density = np.array([1.3, 1.3])

    result = gross_energy_estimate(
        speeds,
        curve,
        timestamps=timestamps,
        density=density,
        air_density_adjustment=True,
    )
    assert result["summary"]["air_density_adjusted"] is True
    adjusted_power = 1500.0 * (1.3 / 1.225)
    assert result["summary"]["mean_power_kw"] == pytest.approx(adjusted_power, abs=1e-3)


def test_gross_energy_raises_with_single_timestamp() -> None:
    curve = pd.DataFrame(
        {"wind_speed_ms": [0.0, 10.0, 25.0], "power_kw": [0.0, 1500.0, 0.0]},
    )
    speeds = np.array([10.0])
    timestamps = pd.date_range("2025-01-01", periods=1, freq="h")

    with pytest.raises(ValueError, match="two timestamps"):
        gross_energy_estimate(speeds, curve, timestamps=timestamps)


# ---------------------------------------------------------------------------
# energy_by_month
# ---------------------------------------------------------------------------


def test_energy_by_month_groups_correctly() -> None:
    timestamps = pd.date_range("2025-01-01", periods=4, freq="h")
    power = np.array([1000.0, 2000.0, 1500.0, 1000.0])

    months = energy_by_month(timestamps, power, time_step_hours=1.0)
    assert len(months) == 1
    assert months[0]["month"] == 1
    assert months[0]["energy_mwh"] == pytest.approx(5.5, abs=0.01)


def test_energy_by_month_handles_multi_month() -> None:
    timestamps = pd.date_range("2025-01-31 22:00", periods=2, freq="h")
    ts_feb = pd.date_range("2025-02-01 00:00", periods=2, freq="h")
    timestamps = timestamps.append(ts_feb)
    power = np.array([1000.0, 2000.0, 3000.0, 4000.0])

    months = energy_by_month(timestamps, power, time_step_hours=1.0)
    labels = {m["month"] for m in months}
    assert 1 in labels
    assert 2 in labels


# ---------------------------------------------------------------------------
# energy_by_speed_bin
# ---------------------------------------------------------------------------


def test_energy_by_speed_bin_fills_bins_correctly() -> None:
    speeds = np.array([3.0, 4.0, 5.0, 6.0, 7.0, 8.0])
    power = np.array([50.0, 120.0, 250.0, 500.0, 800.0, 1200.0])

    bins = energy_by_speed_bin(speeds, power, time_step_hours=1.0, bin_width=2.0)
    assert len(bins) >= 3
    total_energy = sum(b["energy_mwh"] for b in bins)
    assert total_energy > 0


def test_energy_by_speed_bin_handles_all_nan() -> None:
    speeds = np.array([np.nan, np.nan])
    power = np.array([np.nan, np.nan])
    bins = energy_by_speed_bin(speeds, power, time_step_hours=1.0)
    assert bins == []
