from __future__ import annotations

from typing import Any

import pandas as pd


def list_excel_sheets(file_path: str) -> list[str]:
    with pd.ExcelFile(file_path, engine="openpyxl") as workbook:
        return list(workbook.sheet_names)


def _sanitize_header_value(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = str(value).strip()
    if not text or text.lower().startswith("unnamed"):
        return ""
    return text


def _detect_header_depth(raw_frame: pd.DataFrame) -> int:
    first_column = raw_frame.iloc[:, 0]
    parsed = first_column.apply(lambda value: pd.to_datetime(value, errors="coerce", utc=True))
    valid_rows = parsed[parsed.notna()]
    if valid_rows.empty:
        raise ValueError("No timestamp column could be detected in the uploaded workbook")
    return int(valid_rows.index[0])


def _build_column_names(raw_frame: pd.DataFrame, header_depth: int) -> list[str]:
    if header_depth <= 0:
        return [str(value).strip() for value in raw_frame.iloc[0].tolist()]

    header_rows = raw_frame.iloc[:header_depth]
    column_names: list[str] = []
    for column_index in range(raw_frame.shape[1]):
        parts = [_sanitize_header_value(value) for value in header_rows.iloc[:, column_index].tolist()]
        parts = [part for part in parts if part]
        column_names.append(" ".join(parts) if parts else f"column_{column_index}")
    return column_names


def parse_excel(file_path: str, sheet_name: str | int = 0) -> tuple[pd.DataFrame, list[str], str]:
    with pd.ExcelFile(file_path, engine="openpyxl") as workbook:
        sheet_names = list(workbook.sheet_names)
        selected_sheet = sheet_name if isinstance(sheet_name, str) else sheet_names[int(sheet_name)]
        raw_frame = pd.read_excel(workbook, sheet_name=selected_sheet, header=None)

    raw_frame.dropna(axis=1, how="all", inplace=True)
    raw_frame.dropna(axis=0, how="all", inplace=True)
    if raw_frame.empty:
        raise ValueError("The uploaded workbook does not contain any rows")

    header_depth = _detect_header_depth(raw_frame)
    column_names = _build_column_names(raw_frame, header_depth)
    frame = raw_frame.iloc[header_depth:].copy().reset_index(drop=True)
    frame.columns = column_names[: len(frame.columns)]

    timestamp_column = frame.columns[0]
    timestamps = pd.to_datetime(frame[timestamp_column], errors="coerce", utc=True)
    valid_mask = timestamps.notna()
    if not valid_mask.any():
        raise ValueError("The uploaded workbook does not contain any valid timestamps")

    frame = frame.loc[valid_mask].copy()
    timestamps = timestamps.loc[valid_mask]
    frame.drop(columns=[timestamp_column], inplace=True)
    frame.index = timestamps
    frame.index.name = str(timestamp_column)
    frame.sort_index(inplace=True)

    for column in frame.columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    return frame, sheet_names, str(selected_sheet)