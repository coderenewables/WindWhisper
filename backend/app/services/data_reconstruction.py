from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sklearn.linear_model import LinearRegression
from sklearn.neighbors import KNeighborsRegressor
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, TimeseriesData
from app.schemas.qc import ReconstructionMethod, ReconstructionSaveMode
from app.services.history import RECONSTRUCTION_ACTION_TYPE, record_change
from app.services.qc_engine import get_dataset_or_404, load_dataset_frame


MAX_PREVIEW_POINTS = 600


@dataclass(slots=True)
class GapSegment:
    start_time: datetime
    end_time: datetime
    duration_hours: float
    num_missing: int


@dataclass(slots=True)
class ReconstructionResult:
    original: pd.Series
    reconstructed: pd.Series
    gaps: list[GapSegment]
    expected_step_seconds: int
    filled_count: int


def _coerce_numeric_series(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    numeric = numeric.sort_index()
    numeric = numeric[~numeric.index.duplicated(keep="last")]
    return numeric.astype(float)


def infer_expected_step_seconds(dataset: Dataset, index: pd.DatetimeIndex) -> int:
    if dataset.time_step_seconds and dataset.time_step_seconds > 0:
        return int(dataset.time_step_seconds)

    if len(index) > 1:
        deltas = index.to_series().diff().dropna()
        if not deltas.empty:
            median_delta = deltas.median()
            step_seconds = int(max(1, round(median_delta.total_seconds())))
            return step_seconds

    return 600


def _reindex_series(series: pd.Series, expected_step: timedelta) -> pd.Series:
    normalized = _coerce_numeric_series(series)
    if normalized.empty:
        return normalized

    full_index = pd.date_range(
        start=normalized.index.min(),
        end=normalized.index.max(),
        freq=expected_step,
        tz=normalized.index.tz,
        name=normalized.index.name,
    )
    return normalized.reindex(full_index)


def _extract_gap_segments(missing_mask: pd.Series, expected_step: timedelta) -> list[GapSegment]:
    if missing_mask.empty or not bool(missing_mask.any()):
        return []

    segments: list[GapSegment] = []
    current_start: datetime | None = None
    current_end: datetime | None = None
    current_count = 0

    for timestamp, is_missing in missing_mask.items():
        ts = timestamp.to_pydatetime()
        if bool(is_missing):
            if current_start is None:
                current_start = ts
            current_end = ts
            current_count += 1
            continue

        if current_start is not None and current_end is not None:
            segments.append(
                GapSegment(
                    start_time=current_start,
                    end_time=current_end,
                    duration_hours=(current_count * expected_step.total_seconds()) / 3600.0,
                    num_missing=current_count,
                ),
            )
            current_start = None
            current_end = None
            current_count = 0

    if current_start is not None and current_end is not None:
        segments.append(
            GapSegment(
                start_time=current_start,
                end_time=current_end,
                duration_hours=(current_count * expected_step.total_seconds()) / 3600.0,
                num_missing=current_count,
            ),
        )

    return segments


def identify_gaps(series: pd.Series, expected_step: timedelta) -> list[GapSegment]:
    full_series = _reindex_series(series, expected_step)
    return _extract_gap_segments(full_series.isna(), expected_step)


def fill_linear_interpolation(series: pd.Series, expected_step: timedelta, max_gap_hours: int = 6) -> pd.Series:
    full_series = _reindex_series(series, expected_step)
    if full_series.empty:
        return full_series

    interpolated = full_series.interpolate(method="time", limit_area="inside")
    max_steps = max(1, int(math.floor((max_gap_hours * 3600) / expected_step.total_seconds())))
    reconstructed = full_series.copy()

    for segment in _extract_gap_segments(full_series.isna(), expected_step):
        if segment.num_missing > max_steps:
            continue
        mask = (reconstructed.index >= segment.start_time) & (reconstructed.index <= segment.end_time)
        reconstructed.loc[mask] = interpolated.loc[mask]

    return reconstructed


def _build_time_features(index: pd.DatetimeIndex) -> pd.DataFrame:
    hour_fraction = index.hour + (index.minute / 60.0)
    day_of_year = index.dayofyear.astype(float)
    month = index.month.astype(float)
    return pd.DataFrame(
        {
            "hour_sin": np.sin(2.0 * np.pi * hour_fraction / 24.0),
            "hour_cos": np.cos(2.0 * np.pi * hour_fraction / 24.0),
            "doy_sin": np.sin(2.0 * np.pi * day_of_year / 366.0),
            "doy_cos": np.cos(2.0 * np.pi * day_of_year / 366.0),
            "month_sin": np.sin(2.0 * np.pi * month / 12.0),
            "month_cos": np.cos(2.0 * np.pi * month / 12.0),
        },
        index=index,
    )


def fill_knn(
    target_series: pd.Series,
    predictor_df: pd.DataFrame,
    expected_step: timedelta,
    n_neighbors: int = 5,
) -> pd.Series:
    target = _reindex_series(target_series, expected_step)
    if target.empty:
        return target

    predictors = predictor_df.reindex(target.index).apply(pd.to_numeric, errors="coerce")
    if not predictors.empty:
        predictors = predictors.interpolate(method="time", limit_direction="both").ffill().bfill()

    feature_frame = pd.concat([predictors, _build_time_features(target.index)], axis=1)
    feature_frame = feature_frame.dropna(axis=1, how="all")
    if feature_frame.empty:
        return target

    valid_features = feature_frame.notna().all(axis=1)
    train_mask = target.notna() & valid_features
    predict_mask = target.isna() & valid_features

    if int(train_mask.sum()) < 2 or not bool(predict_mask.any()):
        return target

    neighbors = min(max(1, int(n_neighbors)), int(train_mask.sum()))
    model = KNeighborsRegressor(n_neighbors=neighbors, weights="distance")
    model.fit(feature_frame.loc[train_mask], target.loc[train_mask])

    reconstructed = target.copy()
    reconstructed.loc[predict_mask] = model.predict(feature_frame.loc[predict_mask])
    return reconstructed


def fill_correlation(target_series: pd.Series, reference_series: pd.Series, expected_step: timedelta) -> pd.Series:
    target = _reindex_series(target_series, expected_step)
    if target.empty:
        return target

    reference = _coerce_numeric_series(reference_series).reindex(target.index)
    reference = reference.interpolate(method="time", limit_direction="both")

    train_mask = target.notna() & reference.notna()
    predict_mask = target.isna() & reference.notna()
    if int(train_mask.sum()) < 2 or not bool(predict_mask.any()):
        return target

    model = LinearRegression()
    model.fit(reference.loc[train_mask].to_numpy().reshape(-1, 1), target.loc[train_mask].to_numpy())
    reconstructed = target.copy()
    reconstructed.loc[predict_mask] = model.predict(reference.loc[predict_mask].to_numpy().reshape(-1, 1))
    return reconstructed


def reconstruction_report(original: pd.Series, reconstructed: pd.Series, expected_step_seconds: int) -> dict[str, float | int | None]:
    original_missing = int(original.isna().sum())
    remaining_missing = int(reconstructed.isna().sum())
    filled_count = int((original.isna() & reconstructed.notna()).sum())
    total_count = int(len(reconstructed.index))

    original_valid = original.dropna()
    reconstructed_valid = reconstructed.dropna()
    return {
        "expected_step_seconds": expected_step_seconds,
        "original_missing_count": original_missing,
        "filled_count": filled_count,
        "remaining_missing_count": remaining_missing,
        "fill_ratio_pct": (filled_count / original_missing * 100.0) if original_missing else 0.0,
        "recovery_before_pct": (original_valid.count() / total_count * 100.0) if total_count else 0.0,
        "recovery_after_pct": (reconstructed_valid.count() / total_count * 100.0) if total_count else 0.0,
        "original_mean": float(original_valid.mean()) if not original_valid.empty else None,
        "reconstructed_mean": float(reconstructed_valid.mean()) if not reconstructed_valid.empty else None,
        "original_std": float(original_valid.std(ddof=0)) if not original_valid.empty else None,
        "reconstructed_std": float(reconstructed_valid.std(ddof=0)) if not reconstructed_valid.empty else None,
    }


def _sample_series_for_preview(
    original: pd.Series,
    reconstructed: pd.Series,
    *,
    max_points: int = MAX_PREVIEW_POINTS,
) -> dict[str, list[datetime | float | bool | None]]:
    if original.empty:
        return {
            "timestamps": [],
            "original_values": [],
            "reconstructed_values": [],
            "filled_mask": [],
        }

    if len(original.index) > max_points:
        sample_positions = np.linspace(0, len(original.index) - 1, num=max_points, dtype=int)
        sampled_index = original.index[sample_positions]
        original = original.loc[sampled_index]
        reconstructed = reconstructed.loc[sampled_index]

    original_values = [None if pd.isna(value) else float(value) for value in original.tolist()]
    reconstructed_values = [None if pd.isna(value) else float(value) for value in reconstructed.tolist()]
    filled_mask = [bool(pd.isna(before) and not pd.isna(after)) for before, after in zip(original.tolist(), reconstructed.tolist(), strict=False)]
    return {
        "timestamps": list(original.index.to_pydatetime()),
        "original_values": original_values,
        "reconstructed_values": reconstructed_values,
        "filled_mask": filled_mask,
    }


async def run_reconstruction(
    db: AsyncSession,
    dataset: Dataset,
    target_column: DataColumn,
    *,
    method: ReconstructionMethod,
    predictor_column_ids: list[uuid.UUID],
    reference_dataset_id: uuid.UUID | None,
    reference_column_id: uuid.UUID | None,
    max_gap_hours: int,
    n_neighbors: int,
) -> ReconstructionResult:
    same_dataset_ids = [target_column.id, *[column_id for column_id in predictor_column_ids if column_id != target_column.id]]
    loaded = await load_dataset_frame(db, dataset.id, column_ids=same_dataset_ids)
    original = _coerce_numeric_series(loaded.frame[target_column.name]) if target_column.name in loaded.frame.columns else pd.Series(dtype=float)
    expected_step_seconds = infer_expected_step_seconds(dataset, original.index)
    expected_step = timedelta(seconds=expected_step_seconds)

    if original.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected column has no time-series data")

    reconstructed: pd.Series
    if method == ReconstructionMethod.interpolation:
        reconstructed = fill_linear_interpolation(original, expected_step, max_gap_hours=max_gap_hours)
    elif method == ReconstructionMethod.knn:
        predictor_names = [
            loaded.columns_by_id[column_id].name
            for column_id in predictor_column_ids
            if column_id in loaded.columns_by_id and column_id != target_column.id
        ]
        predictor_frame = loaded.frame[predictor_names] if predictor_names else pd.DataFrame(index=loaded.frame.index)
        reconstructed = fill_knn(original, predictor_frame, expected_step, n_neighbors=n_neighbors)
    else:
        if reference_column_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="reference_column_id is required for correlation reconstruction")

        reference_dataset = dataset
        if reference_dataset_id and reference_dataset_id != dataset.id:
            reference_dataset = await get_dataset_or_404(db, reference_dataset_id)
        reference_column = next((column for column in reference_dataset.columns if column.id == reference_column_id), None)
        if reference_column is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="reference_column_id does not belong to the reference dataset")

        reference_loaded = await load_dataset_frame(db, reference_dataset.id, column_ids=[reference_column.id])
        reference_series = _coerce_numeric_series(reference_loaded.frame[reference_column.name]) if reference_column.name in reference_loaded.frame.columns else pd.Series(dtype=float)
        reconstructed = fill_correlation(original, reference_series, expected_step)

    full_original = _reindex_series(original, expected_step)
    gaps = identify_gaps(original, expected_step)
    filled_count = int((full_original.isna() & reconstructed.notna()).sum())

    return ReconstructionResult(
        original=full_original,
        reconstructed=reconstructed,
        gaps=gaps,
        expected_step_seconds=expected_step_seconds,
        filled_count=filled_count,
    )


def build_reconstruction_payload(result: ReconstructionResult) -> dict[str, object]:
    summary = reconstruction_report(result.original, result.reconstructed, result.expected_step_seconds)
    summary["gap_count"] = len(result.gaps)
    return {
        "gaps": [
            {
                "start_time": gap.start_time,
                "end_time": gap.end_time,
                "duration_hours": gap.duration_hours,
                "num_missing": gap.num_missing,
            }
            for gap in result.gaps
        ],
        "preview": _sample_series_for_preview(result.original, result.reconstructed),
        "summary": summary,
    }


def _next_column_name(existing_names: set[str], requested_name: str) -> str:
    if requested_name not in existing_names:
        return requested_name

    suffix = 2
    while f"{requested_name}_{suffix}" in existing_names:
        suffix += 1
    return f"{requested_name}_{suffix}"


async def persist_reconstruction(
    db: AsyncSession,
    dataset: Dataset,
    source_column: DataColumn,
    result: ReconstructionResult,
    *,
    method: ReconstructionMethod,
    save_mode: ReconstructionSaveMode,
    new_column_name: str | None,
) -> DataColumn:
    fill_mask = result.original.isna() & result.reconstructed.notna()
    if not bool(fill_mask.any()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fillable gaps were produced by the selected reconstruction method")

    if save_mode == ReconstructionSaveMode.overwrite:
        target_column = source_column
    else:
        existing_names = {column.name for column in dataset.columns}
        proposed_name = new_column_name or f"{source_column.name}_filled_{method.value}"
        target_column = DataColumn(
            dataset_id=dataset.id,
            name=_next_column_name(existing_names, proposed_name),
            unit=source_column.unit,
            measurement_type=source_column.measurement_type,
            height_m=source_column.height_m,
            sensor_info={
                "reconstructed_from": str(source_column.id),
                "reconstruction_method": method.value,
            },
        )
        db.add(target_column)
        await db.flush()

    rows = (
        await db.execute(
            select(TimeseriesData).where(TimeseriesData.dataset_id == dataset.id).order_by(TimeseriesData.timestamp.asc()),
        )
    ).scalars().all()
    rows_by_timestamp = {row.timestamp: row for row in rows}
    change_entries: list[dict[str, object]] = []

    for timestamp, value in result.reconstructed.loc[fill_mask].items():
        safe_value = float(value)
        row = rows_by_timestamp.get(timestamp.to_pydatetime())
        previous_had_key = row is not None and target_column.name in row.values_json
        previous_value = row.values_json.get(target_column.name) if row is not None else None
        change_entries.append(
            {
                "timestamp": timestamp.isoformat(),
                "row_existed": row is not None,
                "previous_had_key": previous_had_key,
                "previous_value": previous_value,
                "new_value": safe_value,
            },
        )
        if row is None:
            db.add(
                TimeseriesData(
                    dataset_id=dataset.id,
                    timestamp=timestamp.to_pydatetime(),
                    values_json={target_column.name: safe_value},
                ),
            )
            continue

        updated = dict(row.values_json)
        updated[target_column.name] = safe_value
        row.values_json = updated

    if save_mode == ReconstructionSaveMode.overwrite and change_entries:
        await record_change(
            db,
            dataset.id,
            action_type=RECONSTRUCTION_ACTION_TYPE,
            description=f"Reconstructed missing values for {source_column.name} using {method.value} overwrite.",
            before_state={
                "save_mode": save_mode.value,
                "column_id": str(source_column.id),
                "column_name": source_column.name,
                "method": method.value,
                "changes": change_entries,
            },
            after_state={
                "save_mode": save_mode.value,
                "column_id": str(source_column.id),
                "column_name": source_column.name,
                "method": method.value,
                "changes": [
                    {
                        "timestamp": entry["timestamp"],
                        "new_value": entry["new_value"],
                    }
                    for entry in change_entries
                ],
            },
        )
    elif save_mode == ReconstructionSaveMode.new_column and change_entries:
        await record_change(
            db,
            dataset.id,
            action_type=RECONSTRUCTION_ACTION_TYPE,
            description=f"Created reconstructed column {target_column.name} from {source_column.name} using {method.value}.",
            before_state={
                "save_mode": save_mode.value,
                "source_column_id": str(source_column.id),
                "source_column_name": source_column.name,
                "created_column": {
                    "id": str(target_column.id),
                    "dataset_id": str(target_column.dataset_id),
                    "name": target_column.name,
                    "unit": target_column.unit,
                    "measurement_type": target_column.measurement_type,
                    "height_m": target_column.height_m,
                    "sensor_info": target_column.sensor_info,
                },
                "method": method.value,
                "changes": change_entries,
            },
            after_state={
                "save_mode": save_mode.value,
                "created_column_id": str(target_column.id),
                "created_column_name": target_column.name,
                "method": method.value,
                "changes": [
                    {
                        "timestamp": entry["timestamp"],
                        "new_value": entry["new_value"],
                    }
                    for entry in change_entries
                ],
            },
        )

    await db.commit()
    await db.refresh(target_column)
    return target_column