from __future__ import annotations

import csv
from pathlib import Path

import pandas as pd


COMMON_DELIMITERS = (",", "\t", ";", "|")


def sniff_delimiter(file_path: str) -> str:
    sample = Path(file_path).read_text(encoding="utf-8-sig", errors="ignore")[:8192]
    if not sample:
        return ","

    try:
        dialect = csv.Sniffer().sniff(sample, delimiters="".join(COMMON_DELIMITERS))
        return dialect.delimiter
    except csv.Error:
        scores = {delimiter: sample.count(delimiter) for delimiter in COMMON_DELIMITERS}
        return max(scores, key=scores.get)


def _detect_timestamp_column(frame: pd.DataFrame) -> str:
    for column in frame.columns:
        parsed = pd.to_datetime(frame[column], errors="coerce", utc=True)
        if parsed.notna().mean() >= 0.8:
            return str(column)
    raise ValueError("No timestamp column could be detected in the uploaded file")


def parse_csv(file_path: str) -> pd.DataFrame:
    delimiter = sniff_delimiter(file_path)
    frame = pd.read_csv(
        file_path,
        sep=delimiter,
        engine="python",
        encoding="utf-8-sig",
        na_values=["", "NaN", "nan", "N/A", "null", "NULL"],
    )
    if frame.empty:
        raise ValueError("The uploaded file does not contain any rows")

    timestamp_column = _detect_timestamp_column(frame)
    parsed_timestamps = pd.to_datetime(frame[timestamp_column], errors="coerce", utc=True)
    valid_mask = parsed_timestamps.notna()
    if not valid_mask.any():
        raise ValueError("The uploaded file does not contain any valid timestamps")

    frame = frame.loc[valid_mask].copy()
    parsed_timestamps = parsed_timestamps.loc[valid_mask]
    frame.drop(columns=[timestamp_column], inplace=True)
    frame.index = parsed_timestamps
    frame.index.name = timestamp_column
    frame.sort_index(inplace=True)

    for column in frame.columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    return frame