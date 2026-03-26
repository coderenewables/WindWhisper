from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import pandas as pd


def is_campbell_content(text: str) -> bool:
    return text.lstrip().startswith('"TOA5"') or text.lstrip().startswith("TOA5")


def _build_column_name(base_name: str, processing: str) -> str:
    if not processing:
        return base_name
    normalized = processing.strip().replace(" ", "_")
    return f"{base_name}_{normalized}"


def parse_campbell(file_path: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    lines = Path(file_path).read_text(encoding="utf-8-sig", errors="ignore").splitlines()
    if len(lines) < 5:
        raise ValueError("Campbell file is missing required TOA5 header rows")

    file_info = next(csv.reader([lines[0]]))
    column_names = next(csv.reader([lines[1]]))
    units = next(csv.reader([lines[2]]))
    processing = next(csv.reader([lines[3]]))

    if not column_names or column_names[0].strip().upper() != "TIMESTAMP":
        raise ValueError("Campbell file is missing a TIMESTAMP column")

    final_columns: list[str] = []
    metadata: dict[str, Any] = {
        "logger_info": {
            "format": file_info[0].strip('"') if file_info else "TOA5",
            "station_name": file_info[1].strip('"') if len(file_info) > 1 else None,
            "model": file_info[2].strip('"') if len(file_info) > 2 else None,
        },
        "column_metadata": {},
    }

    for index, base_name in enumerate(column_names):
        base_name = base_name.strip().strip('"')
        unit = units[index].strip().strip('"') if index < len(units) else ""
        process = processing[index].strip().strip('"') if index < len(processing) else ""
        if base_name == "TIMESTAMP":
            final_columns.append(base_name)
            continue
        if base_name == "RECORD":
            final_columns.append(base_name)
            continue

        final_name = _build_column_name(base_name, process)
        final_columns.append(final_name)
        metadata["column_metadata"][final_name] = {
            "unit": unit or None,
            "processing": process or None,
            "original_name": base_name,
        }

    frame = pd.read_csv(file_path, skiprows=4, names=final_columns)
    if frame.empty:
        raise ValueError("Campbell file does not contain any data rows")

    timestamps = pd.to_datetime(frame["TIMESTAMP"], format="%Y-%m-%d %H:%M:%S", errors="coerce", utc=True)
    valid_mask = timestamps.notna()
    if not valid_mask.any():
        raise ValueError("Campbell file does not contain valid timestamps")

    frame = frame.loc[valid_mask].copy()
    timestamps = timestamps.loc[valid_mask]
    drop_columns = [column for column in ["TIMESTAMP", "RECORD"] if column in frame.columns]
    frame.drop(columns=drop_columns, inplace=True)
    frame.index = timestamps
    frame.index.name = "TIMESTAMP"
    frame.sort_index(inplace=True)

    for column in frame.columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    return frame, metadata