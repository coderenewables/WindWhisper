from __future__ import annotations

import re

import pandas as pd

from app.schemas import ColumnInfo


MEASUREMENT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("speed_sd", re.compile(r"(?:speed|ws|vel).*(?:sd|std|sigma)|(?:sd|std).*(?:speed|ws|vel)", re.IGNORECASE)),
    ("direction_sd", re.compile(r"(?:dir|wd|direction).*(?:sd|std|sigma)|(?:sd|std).*(?:dir|wd|direction)", re.IGNORECASE)),
    ("turbulence_intensity", re.compile(r"(?:\bti\b|turbulence\s*intensity)", re.IGNORECASE)),
    ("gust", re.compile(r"gust|(?:speed|ws|vel).*max|max.*(?:speed|ws|vel)", re.IGNORECASE)),
    ("minimum", re.compile(r"(?:speed|ws|vel|temp|temperature).*min|min.*(?:speed|ws|vel|temp|temperature)", re.IGNORECASE)),
    ("humidity", re.compile(r"\brh\b|relative\s*humidity|humidity", re.IGNORECASE)),
    ("solar", re.compile(r"solar|irradiance|radiation", re.IGNORECASE)),
    ("speed", re.compile(r"(?:^|[_\s])(speed|ws|vel)(?:$|[_\s\d])", re.IGNORECASE)),
    ("direction", re.compile(r"(?:^|[_\s])(dir|wd|direction)(?:$|[_\s\d])", re.IGNORECASE)),
    ("temperature", re.compile(r"temp|temperature|airtc|tc", re.IGNORECASE)),
    ("pressure", re.compile(r"press|pressure|baro|bp", re.IGNORECASE)),
)

HEIGHT_PATTERNS: dict[str, re.Pattern[str]] = {
    "speed": re.compile(r"(?:speed|ws|vel).*?(\d+(?:\.\d+)?)\s*m?", re.IGNORECASE),
    "speed_sd": re.compile(r"(?:speed|ws|vel).*?(\d+(?:\.\d+)?)\s*m?", re.IGNORECASE),
    "direction": re.compile(r"(?:dir|wd|direction).*?(\d+(?:\.\d+)?)\s*m?", re.IGNORECASE),
    "direction_sd": re.compile(r"(?:dir|wd|direction).*?(\d+(?:\.\d+)?)\s*m?", re.IGNORECASE),
    "turbulence_intensity": re.compile(r"(?:ti|turbulence).*?(\d+(?:\.\d+)?)\s*m?", re.IGNORECASE),
    "gust": re.compile(r"(?:gust|max|speed|ws|vel).*?(\d+(?:\.\d+)?)\s*m?", re.IGNORECASE),
    "temperature": re.compile(r"(?:temp|temperature|airtc|tc).*?(\d+(?:\.\d+)?)\s*m?", re.IGNORECASE),
    "pressure": re.compile(r"(?:press|pressure|baro|bp).*?(\d+(?:\.\d+)?)\s*m?", re.IGNORECASE),
    "humidity": re.compile(r"(?:rh|humidity).*?(\d+(?:\.\d+)?)\s*m?", re.IGNORECASE),
    "solar": re.compile(r"(?:solar|radiation|irradiance).*?(\d+(?:\.\d+)?)\s*m?", re.IGNORECASE),
}

DEFAULT_UNITS = {
    "speed": "m/s",
    "speed_sd": "m/s",
    "direction": "deg",
    "direction_sd": "deg",
    "turbulence_intensity": "%",
    "gust": "m/s",
    "minimum": "m/s",
    "temperature": "C",
    "pressure": "hPa",
    "humidity": "%",
    "solar": "W/m2",
}

UNIT_HINTS = {
    "m/s": re.compile(r"m\s*/\s*s", re.IGNORECASE),
    "deg": re.compile(r"deg|°", re.IGNORECASE),
    "C": re.compile(r"\b[°]?c\b", re.IGNORECASE),
    "hPa": re.compile(r"hpa|mbar", re.IGNORECASE),
    "%": re.compile(r"%|percent", re.IGNORECASE),
    "W/m2": re.compile(r"w\s*/\s*m2|w/m\^?2", re.IGNORECASE),
}


def _extract_height(column_name: str, measurement_type: str | None) -> float | None:
    if measurement_type is None:
        return None
    pattern = HEIGHT_PATTERNS.get(measurement_type)
    if pattern is None:
        return None

    match = pattern.search(column_name)
    return float(match.group(1)) if match else None


def _unit_from_name(column_name: str) -> str | None:
    for unit, pattern in UNIT_HINTS.items():
        if pattern.search(column_name):
            return unit
    return None


def _infer_measurement_type(column_name: str, values: pd.Series) -> tuple[str | None, float]:
    for measurement_type, pattern in MEASUREMENT_PATTERNS:
        if pattern.search(column_name):
            return measurement_type, 0.95

    numeric_values = values.dropna()
    if numeric_values.empty:
        return None, 0.0

    min_value = float(numeric_values.min())
    max_value = float(numeric_values.max())
    if 0 <= min_value and max_value <= 100 and "ti" in column_name.lower():
        return "turbulence_intensity", 0.70
    if 0 <= min_value and max_value <= 100 and ("rh" in column_name.lower() or "humid" in column_name.lower()):
        return "humidity", 0.70
    if 0 <= min_value and max_value <= 1500 and "solar" in column_name.lower():
        return "solar", 0.70
    if 0 <= min_value and max_value <= 360:
        return "direction", 0.55
    if -50 <= min_value and max_value <= 60:
        return "temperature", 0.45
    if 850 <= min_value and max_value <= 1100:
        return "pressure", 0.60
    if 0 <= min_value and max_value <= 80:
        return "speed", 0.40
    return None, 0.0


def _infer_unit(column_name: str, measurement_type: str | None, values: pd.Series) -> str | None:
    lowered = column_name.lower()
    named_unit = _unit_from_name(column_name)
    if named_unit is not None:
        return named_unit
    if "hpa" in lowered:
        return "hPa"
    if "deg" in lowered:
        return "deg"
    if "c" in lowered and measurement_type == "temperature":
        return "C"

    if measurement_type in DEFAULT_UNITS:
        return DEFAULT_UNITS[measurement_type]

    numeric_values = values.dropna()
    if numeric_values.empty:
        return None
    if float(numeric_values.max()) > 850:
        return "hPa"
    return None


def infer_time_step_seconds(index: pd.Index) -> int | None:
    if len(index) < 2:
        return None
    timestamps = pd.Series(index)
    deltas = timestamps.diff().dropna().dt.total_seconds()
    if deltas.empty:
        return None
    return int(deltas.median())


def detect_columns(df: pd.DataFrame) -> list[ColumnInfo]:
    detected_columns: list[ColumnInfo] = []
    for column_name in df.columns:
        series = pd.to_numeric(df[column_name], errors="coerce")
        measurement_type, confidence = _infer_measurement_type(column_name, series)
        detected_columns.append(
            ColumnInfo(
                name=str(column_name),
                measurement_type=measurement_type,
                height_m=_extract_height(str(column_name), measurement_type),
                unit=_infer_unit(str(column_name), measurement_type, series),
                confidence=confidence,
            ),
        )

    return detected_columns