"""Generate comprehensive sample data for all GoKaatru input types.

Creates realistic multi-year wind measurement datasets in every
supported format, plus a reanalysis reference file for MCP.

Run from repo root:
    python backend/scripts/generate_all_samples.py
"""
from __future__ import annotations

import csv
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

random.seed(42)
np.random.seed(42)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
START = datetime(2023, 1, 1, 0, 0, tzinfo=timezone.utc)
YEARS = 3  # 3 years → extreme‑wind Gumbel fitting works well
STEP_MINUTES = 10
N_ROWS = YEARS * 365 * 24 * 6  # ~157 680 for 3 years

HEIGHTS = [40, 60, 80]
SITE_LAT, SITE_LON, SITE_ELEV = 35.123, -101.456, 1420


# ---------------------------------------------------------------------------
# Physics helpers
# ---------------------------------------------------------------------------

def _wind_profile(base_speed: float, base_height: float, target_height: float, alpha: float = 0.14) -> float:
    return base_speed * (target_height / base_height) ** alpha


def _seasonal_base(hour: int, month: int) -> float:
    """Seasonal mean‑speed curve: higher in winter, lower at night."""
    seasonal = 7.5 + 2.0 * math.cos(2 * math.pi * (month - 1) / 12)  # peak in Jan
    diurnal = 0.6 * math.sin(2 * math.pi * (hour - 3) / 24)  # peak around 15:00
    return max(seasonal + diurnal, 0.3)


def _direction_with_persistence(prev: float, step_std: float = 12.0) -> float:
    return (prev + np.random.normal(0, step_std)) % 360


def _temperature(month: int, hour: int) -> float:
    seasonal = 15.0 - 12.0 * math.cos(2 * math.pi * (month - 7) / 12)  # peak Jul
    diurnal = 4.0 * math.sin(2 * math.pi * (hour - 6) / 24)
    return seasonal + diurnal + np.random.normal(0, 0.5)


def _pressure(elevation: float, temp_c: float) -> float:
    return 1013.25 * (1 - 0.0065 * elevation / (temp_c + 273.15 + 0.0065 * elevation)) ** 5.2561 + np.random.normal(0, 0.3)


def _humidity(month: int, hour: int) -> float:
    base = 55 + 15 * math.sin(2 * math.pi * (month - 7) / 12)
    diurnal = -8 * math.sin(2 * math.pi * (hour - 6) / 24)
    return max(20, min(100, base + diurnal + np.random.normal(0, 3)))


def _solar(month: int, hour: int, lat: float) -> float:
    if hour < 6 or hour > 20:
        return 0.0
    solar_noon_factor = math.sin(math.pi * (hour - 6) / 14)
    seasonal = 0.6 + 0.4 * math.sin(2 * math.pi * (month - 3) / 12)
    max_irradiance = 900 * seasonal * max(0, math.cos(math.radians(abs(lat) - 23.5 * math.sin(2 * math.pi * (month - 3) / 12))))
    return max(0.0, max_irradiance * solar_noon_factor + np.random.normal(0, 15))


# ---------------------------------------------------------------------------
# Main generation
# ---------------------------------------------------------------------------

def generate_met_tower_csv() -> Path:
    """3-year, 10‑min met tower CSV with all column types."""
    path = DATA_DIR / "sample_met_tower.csv"
    timestamps = [START + timedelta(minutes=i * STEP_MINUTES) for i in range(N_ROWS)]

    direction = 200.0
    rows: list[dict] = []

    # Introduce ~0.5 % NaN gaps randomly
    gap_mask = np.random.random(N_ROWS) < 0.005

    for idx, ts in enumerate(timestamps):
        hour, month = ts.hour, ts.month
        base = _seasonal_base(hour, month) + np.random.normal(0, 1.5)
        base = max(0.1, base)

        direction = _direction_with_persistence(direction)
        temp = _temperature(month, hour)
        press = _pressure(SITE_ELEV, temp)
        rh = _humidity(month, hour)
        solar = _solar(month, hour, SITE_LAT)

        speeds = {}
        speed_sds = {}
        for h in HEIGHTS:
            sp = _wind_profile(base, 80, h)
            speeds[h] = round(max(0, sp), 2)
            ti = 0.10 + 0.02 * np.random.randn()  # ~10% TI
            speed_sds[h] = round(max(0.01, sp * ti), 2)

        gust_80 = round(speeds[80] + abs(np.random.normal(0, 1.2)), 2)

        row = {
            "Timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.0000000Z"),
        }
        for h in HEIGHTS:
            row[f"Speed_{h}m"] = speeds[h]
        for h in HEIGHTS:
            row[f"Dir_{h}m"] = round(direction + np.random.normal(0, 3 * (80 / h) ** 0.2), 1) % 360
        row["Temp_2m"] = round(temp, 2)
        row["Pressure_hPa"] = round(press, 2)
        row["RH_pct"] = round(rh, 1)
        row["Solar_Wm2"] = round(solar, 1)
        row["Gust_80m"] = gust_80
        for h in HEIGHTS:
            row[f"Speed_SD_{h}m"] = speed_sds[h]

        # Apply NaN gaps
        if gap_mask[idx]:
            for key in list(row.keys()):
                if key != "Timestamp":
                    row[key] = ""

        rows.append(row)

    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  ✓ {path.name}: {len(rows)} rows, {len(fieldnames)} columns")
    return path


def generate_nrg_file() -> Path:
    """3-year NRG Systems logger file (10-min)."""
    path = DATA_DIR / "sample_nrg.txt"
    timestamps = [START + timedelta(minutes=i * STEP_MINUTES) for i in range(N_ROWS)]
    direction = 200.0

    lines: list[str] = []
    lines.append(f"Site Number: NRG-2045")
    lines.append(f"Latitude: {SITE_LAT}")
    lines.append(f"Longitude: {SITE_LON}")
    lines.append(f"Elevation: {SITE_ELEV}")
    lines.append("Channel 1: WS 60m Avg (m/s)")
    lines.append("Channel 2: WS 60m SD (m/s)")
    lines.append("Channel 3: WD 60m Avg (deg)")
    lines.append("Channel 4: Temp 2m Avg (C)")
    lines.append("Timestamp,Ch1Avg,Ch2SD,Ch3Avg,Ch4Avg")

    for idx, ts in enumerate(timestamps):
        hour, month = ts.hour, ts.month
        base = _seasonal_base(hour, month) + np.random.normal(0, 1.5)
        base = max(0.1, base)
        sp60 = _wind_profile(base, 80, 60)
        sd60 = round(max(0.01, sp60 * (0.10 + 0.02 * np.random.randn())), 2)
        direction = _direction_with_persistence(direction)
        temp = _temperature(month, hour)
        lines.append(f"{ts.strftime('%Y-%m-%d %H:%M')},{sp60:.2f},{sd60},{direction:.1f},{temp:.1f}")

    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ {path.name}: {N_ROWS} rows")
    return path


def generate_campbell_file() -> Path:
    """3-year Campbell Scientific TOA5 file (10-min)."""
    path = DATA_DIR / "sample_campbell.dat"
    timestamps = [START + timedelta(minutes=i * STEP_MINUTES) for i in range(N_ROWS)]
    direction = 200.0

    lines: list[str] = []
    lines.append('"TOA5","GoKaatruCampbell","CR1000X","12345","CPU:gokaatru.CR1X","12345","Campbell"')
    lines.append('"TIMESTAMP","RECORD","WS_80m","WS_80m","WD_80m","BP_2m","AirTC_2m"')
    lines.append('"TS","RN","m/s","m/s","deg","hPa","deg C"')
    lines.append('"","","Avg","Std","Avg","Avg","Avg"')

    for idx, ts in enumerate(timestamps):
        hour, month = ts.hour, ts.month
        base = _seasonal_base(hour, month) + np.random.normal(0, 1.5)
        base = max(0.1, base)
        sp80 = round(base, 2)
        sd80 = round(max(0.01, sp80 * (0.10 + 0.02 * np.random.randn())), 2)
        direction = _direction_with_persistence(direction)
        temp = _temperature(month, hour)
        press = _pressure(SITE_ELEV, temp)
        lines.append(f'"{ts.strftime("%Y-%m-%d %H:%M:%S")}",{idx + 1},{sp80},{sd80},{direction:.1f},{press:.1f},{temp:.1f}')

    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ {path.name}: {N_ROWS} rows")
    return path


def generate_excel_workbook(csv_path: Path) -> Path:
    """Excel workbook derived from the CSV with multi-row headers and two sheets."""
    path = DATA_DIR / "sample_met_tower.xlsx"
    frame = pd.read_csv(csv_path)
    frame["Timestamp"] = pd.to_datetime(frame["Timestamp"], utc=True)
    frame["Timestamp"] = frame["Timestamp"].dt.tz_convert(None)
    frame = frame.head(2000).copy()

    met_data = pd.DataFrame({
        "Timestamp UTC": frame["Timestamp"],
        "Speed (m/s) 80m": frame["Speed_80m"],
        "Speed SD (m/s) 80m": frame["Speed_SD_80m"],
        "TI (%) 80m": ((frame["Speed_SD_80m"] / frame["Speed_80m"]).replace([np.inf, -np.inf], np.nan) * 100).round(2),
        "Gust Max (m/s) 80m": frame["Gust_80m"],
        "BP (hPa) 2m": frame["Pressure_hPa"],
        "RH (%) 2m": frame["RH_pct"],
        "Solar (W/m2)": frame["Solar_Wm2"],
    })

    header_row_1 = ["Timestamp", "Speed", "Speed SD", "TI", "Gust Max", "BP", "RH", "Solar"]
    header_row_2 = ["UTC", "(m/s) 80m", "(m/s) 80m", "(%) 80m", "(m/s) 80m", "(hPa) 2m", "(%) 2m", "(W/m2)"]

    summary = pd.DataFrame({
        "Metric": ["Rows", "Start", "End", "Primary Height"],
        "Value": [len(met_data), str(met_data.iloc[0, 0]), str(met_data.iloc[-1, 0]), "80m"],
    })

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        pd.DataFrame([header_row_1, header_row_2]).to_excel(writer, sheet_name="MetData", header=False, index=False)
        met_data.to_excel(writer, sheet_name="MetData", index=False, header=False, startrow=2)
        summary.to_excel(writer, sheet_name="Summary", index=False)

    print(f"  ✓ {path.name}: {len(met_data)} rows, 2 sheets")
    return path


def generate_reanalysis_reference() -> Path:
    """Multi-year hourly reanalysis reference CSV for MCP long-term correction.

    Covers 10 years (2016–2025) at hourly resolution to act as the
    long-term reference in MCP workflows.  The site measurement period
    (2023–2025) overlaps, enabling concurrent/full-reference splits.
    """
    path = DATA_DIR / "sample_reanalysis_era5.csv"
    ref_start = datetime(2016, 1, 1, 0, 0, tzinfo=timezone.utc)
    ref_years = 10
    n_hours = ref_years * 365 * 24  # ~87 600
    timestamps = [ref_start + timedelta(hours=i) for i in range(n_hours)]
    direction = 200.0

    rows: list[dict] = []
    for ts in timestamps:
        hour, month = ts.hour, ts.month
        base = _seasonal_base(hour, month) + np.random.normal(0, 1.8)
        base = max(0.1, base)
        sp100 = round(_wind_profile(base, 80, 100), 2)
        direction = _direction_with_persistence(direction, step_std=8.0)
        temp = _temperature(month, hour)
        press = _pressure(SITE_ELEV, temp)
        rows.append({
            "Timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "Ref_Speed_100m": sp100,
            "Ref_Dir_100m": round(direction, 1),
            "Ref_Temp_2m": round(temp, 2),
            "Ref_Pressure_hPa": round(press, 2),
        })

    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  ✓ {path.name}: {len(rows)} rows ({ref_years} years hourly)")
    return path


def generate_semicolon_csv() -> Path:
    """Small semicolon-delimited CSV for delimiter-detection tests."""
    path = DATA_DIR / "sample_semicolon.csv"
    timestamps = [START + timedelta(minutes=i * 10) for i in range(200)]
    direction = 210.0

    lines = ["Timestamp;Speed_40m;Dir_40m;Temp_2m"]
    for ts in timestamps:
        h, m = ts.hour, ts.month
        base = _seasonal_base(h, m) + np.random.normal(0, 1.0)
        sp = round(max(0.1, _wind_profile(base, 80, 40)), 2)
        direction = _direction_with_persistence(direction)
        temp = round(_temperature(m, h), 1)
        lines.append(f"{ts.strftime('%Y-%m-%dT%H:%M:%SZ')};{sp};{direction:.1f};{temp}")

    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ {path.name}: {len(timestamps)} rows (semicolon-delimited)")
    return path


def generate_tab_delimited() -> Path:
    """Small tab-delimited file for delimiter-detection tests."""
    path = DATA_DIR / "sample_tab_delimited.txt"
    timestamps = [START + timedelta(minutes=i * 10) for i in range(200)]
    direction = 190.0

    lines = ["Timestamp\tSpeed_40m\tDir_40m\tTemp_2m"]
    for ts in timestamps:
        h, m = ts.hour, ts.month
        base = _seasonal_base(h, m) + np.random.normal(0, 1.0)
        sp = round(max(0.1, _wind_profile(base, 80, 40)), 2)
        direction = _direction_with_persistence(direction)
        temp = round(_temperature(m, h), 1)
        lines.append(f"{ts.strftime('%Y-%m-%dT%H:%M:%SZ')}\t{sp}\t{direction:.1f}\t{temp}")

    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ {path.name}: {len(timestamps)} rows (tab-delimited)")
    return path


def generate_power_curve() -> Path:
    """Standard 3 MW IEC Class III power curve (0–25 m/s)."""
    path = DATA_DIR / "sample_power_curve.csv"
    speeds = np.arange(0.0, 25.5, 0.5)
    CUT_IN, RATED, CUT_OUT, RATED_POWER = 3.0, 12.5, 25.0, 3000.0

    powers = []
    for s in speeds:
        if s < CUT_IN:
            powers.append(0)
        elif s < RATED:
            fraction = (s - CUT_IN) / (RATED - CUT_IN)
            powers.append(int(round(RATED_POWER * fraction ** 2.5)))
        elif s <= CUT_OUT:
            powers.append(int(RATED_POWER))
        else:
            powers.append(0)

    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["wind_speed_ms", "power_kw"])
        for s, p in zip(speeds, powers):
            w.writerow([s, p])

    print(f"  ✓ {path.name}: {len(speeds)} entries, cut-in={CUT_IN}, rated={RATED}, cutout={CUT_OUT}")
    return path


def main() -> None:
    print("Generating GoKaatru sample data...\n")

    csv_path = generate_met_tower_csv()
    generate_nrg_file()
    generate_campbell_file()
    generate_excel_workbook(csv_path)
    generate_reanalysis_reference()
    generate_semicolon_csv()
    generate_tab_delimited()
    generate_power_curve()

    print(f"\nAll sample data written to {DATA_DIR}/")


if __name__ == "__main__":
    main()
