from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pandas as pd


SITE_PATTERNS = {
    "site_number": re.compile(r"^Site Number\s*:\s*(.+)$", re.IGNORECASE),
    "latitude": re.compile(r"^Latitude\s*:\s*(.+)$", re.IGNORECASE),
    "longitude": re.compile(r"^Longitude\s*:\s*(.+)$", re.IGNORECASE),
    "elevation": re.compile(r"^Elevation\s*:\s*(.+)$", re.IGNORECASE),
}

CHANNEL_PATTERN = re.compile(r"^Channel\s+(\d+)\s*:\s*(.+)$", re.IGNORECASE)
CHANNEL_NAME_PATTERN = re.compile(r"^Ch(\d+)", re.IGNORECASE)
HEIGHT_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*m", re.IGNORECASE)
UNIT_PATTERN = re.compile(r"\(([^)]+)\)")


def is_nrg_content(text: str) -> bool:
    lowered = text.lower()
    return "site number" in lowered and "channel 1" in lowered


def _to_float(value: str) -> float | str:
    cleaned = value.strip().replace("ft", "")
    try:
        return float(cleaned)
    except ValueError:
        return value.strip()


def _descriptor_parts(descriptor: str) -> tuple[str | None, float | None, str | None]:
    lowered = descriptor.lower()
    unit_match = UNIT_PATTERN.search(descriptor)
    height_match = HEIGHT_PATTERN.search(descriptor)
    unit = unit_match.group(1).strip() if unit_match else None
    height = float(height_match.group(1)) if height_match else None

    if "sd" in lowered or "sigma" in lowered:
        if "wd" in lowered or "direction" in lowered:
            return "direction_sd", height, unit or "deg"
        return "speed_sd", height, unit or "m/s"
    if "max" in lowered or "gust" in lowered:
        return "gust", height, unit or "m/s"
    if "wd" in lowered or "direction" in lowered:
        return "direction", height, unit or "deg"
    if "temp" in lowered:
        return "temperature", height, unit or "C"
    if "press" in lowered or "baro" in lowered or "bp" in lowered:
        return "pressure", height, unit or "hPa"
    if "ws" in lowered or "speed" in lowered or "vel" in lowered:
        return "speed", height, unit or "m/s"
    return None, height, unit


def _column_name(measurement_type: str | None, height_m: float | None, source_channel: str) -> str:
    if measurement_type == "speed":
        return f"Speed_{int(height_m)}m" if height_m is not None else source_channel
    if measurement_type == "speed_sd":
        return f"Speed_SD_{int(height_m)}m" if height_m is not None else f"{source_channel}_SD"
    if measurement_type == "gust":
        return f"Gust_{int(height_m)}m" if height_m is not None else f"{source_channel}_Max"
    if measurement_type == "direction":
        return f"Dir_{int(height_m)}m" if height_m is not None else source_channel
    if measurement_type == "direction_sd":
        return f"Dir_SD_{int(height_m)}m" if height_m is not None else f"{source_channel}_SD"
    if measurement_type == "temperature":
        return f"Temp_{int(height_m)}m" if height_m is not None else source_channel
    if measurement_type == "pressure":
        return f"Pressure_{int(height_m)}m" if height_m is not None else "Pressure_hPa"
    return source_channel


def parse_nrg(file_path: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    lines = Path(file_path).read_text(encoding="utf-8-sig", errors="ignore").splitlines()
    metadata: dict[str, Any] = {"site_info": {}, "column_metadata": {}}
    channel_descriptors: dict[str, str] = {}
    header_row_index: int | None = None

    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue

        for key, pattern in SITE_PATTERNS.items():
            match = pattern.match(stripped)
            if match:
                metadata["site_info"][key] = _to_float(match.group(1))
                break

        channel_match = CHANNEL_PATTERN.match(stripped)
        if channel_match:
            channel_descriptors[f"Ch{channel_match.group(1)}"] = channel_match.group(2).strip()
            continue

        if stripped.lower().startswith("timestamp"):
            header_row_index = index
            break

    if header_row_index is None:
        raise ValueError("NRG file is missing a data header row")

    frame = pd.read_csv(file_path, skiprows=header_row_index)
    if frame.empty:
        raise ValueError("NRG file does not contain any data rows")

    timestamp_column = frame.columns[0]
    timestamps = pd.to_datetime(frame[timestamp_column], errors="coerce", utc=True)
    valid_mask = timestamps.notna()
    if not valid_mask.any():
        raise ValueError("NRG file does not contain valid timestamps")

    frame = frame.loc[valid_mask].copy()
    timestamps = timestamps.loc[valid_mask]
    frame.drop(columns=[timestamp_column], inplace=True)
    rename_map: dict[str, str] = {}

    for column in frame.columns:
        match = CHANNEL_NAME_PATTERN.match(str(column))
        source_channel = match.group(0) if match else str(column)
        descriptor = channel_descriptors.get(source_channel, str(column))
        measurement_type, height_m, unit = _descriptor_parts(descriptor)
        renamed = _column_name(measurement_type, height_m, source_channel)
        rename_map[str(column)] = renamed
        metadata["column_metadata"][renamed] = {
            "measurement_type": measurement_type,
            "height_m": height_m,
            "unit": unit,
            "source_channel": source_channel,
            "descriptor": descriptor,
        }

    frame.rename(columns=rename_map, inplace=True)
    frame.index = timestamps
    frame.index.name = str(timestamp_column)
    frame.sort_index(inplace=True)

    for column in frame.columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    return frame, metadata