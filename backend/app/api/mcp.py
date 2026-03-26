from __future__ import annotations

import math
import uuid

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DataColumn
from app.schemas.mcp import (
    CorrelationPointResponse,
    MCPAnnualMeanResponse,
    MCPComparisonRequest,
    MCPComparisonResponse,
    MCPComparisonRowResponse,
    MCPCrossValidationFoldResponse,
    MCPCrossValidationResponse,
    MCPCorrelationRequest,
    MCPCorrelationResponse,
    MCPCorrelationStatsResponse,
    MCPMatrixOutputResponse,
    MCPMethod,
    MCPMonthlyMeanResponse,
    MCPPredictedPointResponse,
    MCPPredictionRequest,
    MCPPredictionResponse,
    MCPSummaryResponse,
    MCPWeibullSummaryResponse,
)
from app.services.mcp_engine import compare_mcp_methods, correlation_stats, mcp_linear_least_squares, mcp_matrix_method, mcp_summary, mcp_variance_ratio
from app.services.qc_engine import get_clean_dataframe, get_dataset_or_404


router = APIRouter(prefix="/api/mcp", tags=["mcp"])


def _resolve_column(dataset_columns: list[DataColumn], column_id: uuid.UUID, label: str) -> DataColumn:
    for column in dataset_columns:
        if column.id == column_id:
            return column
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} does not belong to this dataset")


async def _load_numeric_series(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    column_id: uuid.UUID,
    exclude_flag_ids: list[uuid.UUID],
) -> tuple[DataColumn, pd.Series]:
    dataset = await get_dataset_or_404(db, dataset_id)
    column = _resolve_column(dataset.columns, column_id, "column_id")
    frame = await get_clean_dataframe(db, dataset_id, column_ids=[column.id], exclude_flag_ids=exclude_flag_ids)

    if column.name not in frame.columns:
        return column, pd.Series(dtype=float)

    series = pd.to_numeric(frame[column.name], errors="coerce").astype(float)
    series = series.replace([np.inf, -np.inf], np.nan).dropna().sort_index()
    return column, series


async def _load_numeric_series_map(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    column_ids: list[uuid.UUID],
    exclude_flag_ids: list[uuid.UUID],
) -> tuple[dict[uuid.UUID, DataColumn], dict[str, pd.Series]]:
    dataset = await get_dataset_or_404(db, dataset_id)
    resolved_columns = [_resolve_column(dataset.columns, column_id, "column_ids") for column_id in column_ids]
    frame = await get_clean_dataframe(db, dataset_id, column_ids=[column.id for column in resolved_columns], exclude_flag_ids=exclude_flag_ids)

    columns_by_id = {column.id: column for column in resolved_columns}
    series_by_name: dict[str, pd.Series] = {}
    for column in resolved_columns:
        if column.name not in frame.columns:
            series_by_name[column.name] = pd.Series(dtype=float)
            continue
        series = pd.to_numeric(frame[column.name], errors="coerce").astype(float)
        series_by_name[column.name] = series.replace([np.inf, -np.inf], np.nan).sort_index()

    return columns_by_id, series_by_name


def _downsample_points(frame: pd.DataFrame, max_points: int) -> pd.DataFrame:
    if len(frame.index) <= max_points:
        return frame
    step = max(1, math.ceil(len(frame.index) / max_points))
    return frame.iloc[::step].copy()


def _serialize_stats(payload: dict[str, object]) -> MCPCorrelationStatsResponse:
    return MCPCorrelationStatsResponse(
        sample_count=int(payload["sample_count"]),
        pearson_r=float(payload["pearson_r"]),
        r_squared=float(payload["r_squared"]),
        rmse=float(payload["rmse"]),
        bias=float(payload["bias"]),
        slope=float(payload["slope"]),
        intercept=float(payload["intercept"]),
        concurrent_start=pd.Timestamp(payload["concurrent_start"]).to_pydatetime(),
        concurrent_end=pd.Timestamp(payload["concurrent_end"]).to_pydatetime(),
    )


def _serialize_summary(payload: dict[str, object]) -> MCPSummaryResponse:
    weibull_payload = payload.get("weibull")
    return MCPSummaryResponse(
        method=payload["method"],
        sample_count=int(payload["sample_count"]),
        start_time=pd.Timestamp(payload["start_time"]).to_pydatetime(),
        end_time=pd.Timestamp(payload["end_time"]).to_pydatetime(),
        long_term_mean_speed=float(payload["long_term_mean_speed"]),
        monthly_means=[MCPMonthlyMeanResponse(**item) for item in payload.get("monthly_means", [])],
        annual_means=[MCPAnnualMeanResponse(**item) for item in payload.get("annual_means", [])],
        weibull=MCPWeibullSummaryResponse(**weibull_payload) if weibull_payload else None,
    )


def _serialize_cross_validation(payload: dict[str, object]) -> MCPCrossValidationResponse:
    return MCPCrossValidationResponse(
        fold_count=int(payload["fold_count"]),
        rmse=float(payload["rmse"]),
        bias=float(payload["bias"]),
        skill_score=float(payload["skill_score"]),
        uncertainty=float(payload["uncertainty"]),
        folds=[MCPCrossValidationFoldResponse(**item) for item in payload.get("folds", [])],
    )


def _serialize_predicted_points(series: pd.Series, max_points: int) -> list[MCPPredictedPointResponse]:
    frame = pd.DataFrame({"value": pd.to_numeric(series, errors="coerce")}).dropna()
    if frame.empty:
        return []
    reduced = _downsample_points(frame, max_points)
    return [
        MCPPredictedPointResponse(timestamp=timestamp.to_pydatetime(), value=float(row["value"]))
        for timestamp, row in reduced.iterrows()
    ]


def _serialize_scatter_points(site: pd.Series, ref: pd.Series, max_points: int) -> list[CorrelationPointResponse]:
    aligned = pd.concat([site.rename("site"), ref.rename("ref")], axis=1, join="inner").dropna()
    if aligned.empty:
        return []
    reduced = _downsample_points(aligned, max_points)
    return [
        CorrelationPointResponse(
            timestamp=timestamp.to_pydatetime(),
            site_value=float(row["site"]),
            ref_value=float(row["ref"]),
            month=int(timestamp.month),
        )
        for timestamp, row in reduced.iterrows()
    ]


def _run_method(method: MCPMethod, site: pd.Series, ref: pd.Series, ref_full: pd.Series) -> dict[str, object]:
    if method == "linear":
        return mcp_linear_least_squares(site, ref, ref_full)
    if method == "variance_ratio":
        return mcp_variance_ratio(site, ref, ref_full)
    if method == "matrix":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Matrix MCP requires multi-column inputs")
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported MCP method: {method}")


def _requested_column_ids(primary_id: uuid.UUID, extra_ids: list[uuid.UUID]) -> list[uuid.UUID]:
    ordered_ids = [primary_id]
    for column_id in extra_ids:
        if column_id not in ordered_ids:
            ordered_ids.append(column_id)
    return ordered_ids


def _serialize_matrix_outputs(
    outputs: dict[str, dict[str, object]],
    site_columns_by_id: dict[uuid.UUID, DataColumn],
    max_points: int,
) -> list[MCPMatrixOutputResponse]:
    outputs_by_name = {column.name: column.id for column in site_columns_by_id.values()}
    serialized: list[MCPMatrixOutputResponse] = []
    for site_name, output in outputs.items():
        site_column_id = outputs_by_name.get(site_name)
        if site_column_id is None:
            continue
        serialized.append(
            MCPMatrixOutputResponse(
                site_column_id=site_column_id,
                params={key: float(value) for key, value in output["params"].items()},
                stats=_serialize_stats(output["stats"]),
                summary=_serialize_summary(mcp_summary(output["predicted_series"], "matrix")),
                predicted_points=_serialize_predicted_points(output["predicted_series"], max_points),
            ),
        )
    return serialized


@router.post("/correlate", response_model=MCPCorrelationResponse)
async def correlate(payload: MCPCorrelationRequest, db: AsyncSession = Depends(get_db)) -> MCPCorrelationResponse:
    _, site_series = await _load_numeric_series(db, payload.site_dataset_id, payload.site_column_id, payload.site_exclude_flags)
    _, ref_series = await _load_numeric_series(db, payload.ref_dataset_id, payload.ref_column_id, payload.ref_exclude_flags)

    try:
        stats = correlation_stats(site_series, ref_series)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return MCPCorrelationResponse(
        site_dataset_id=payload.site_dataset_id,
        site_column_id=payload.site_column_id,
        ref_dataset_id=payload.ref_dataset_id,
        ref_column_id=payload.ref_column_id,
        site_column_ids=_requested_column_ids(payload.site_column_id, payload.site_column_ids),
        ref_column_ids=_requested_column_ids(payload.ref_column_id, payload.ref_column_ids),
        site_excluded_flag_ids=payload.site_exclude_flags,
        ref_excluded_flag_ids=payload.ref_exclude_flags,
        stats=_serialize_stats(stats),
        scatter_points=_serialize_scatter_points(site_series, ref_series, payload.max_points),
    )


@router.post("/predict", response_model=MCPPredictionResponse)
async def predict(payload: MCPPredictionRequest, db: AsyncSession = Depends(get_db)) -> MCPPredictionResponse:
    _, site_series = await _load_numeric_series(db, payload.site_dataset_id, payload.site_column_id, payload.site_exclude_flags)
    _, ref_series = await _load_numeric_series(db, payload.ref_dataset_id, payload.ref_column_id, payload.ref_exclude_flags)
    _, ref_full_series = await _load_numeric_series(db, payload.ref_dataset_id, payload.ref_column_id, payload.ref_exclude_flags)
    requested_site_ids = _requested_column_ids(payload.site_column_id, payload.site_column_ids)
    requested_ref_ids = _requested_column_ids(payload.ref_column_id, payload.ref_column_ids)

    try:
        matrix_outputs: list[MCPMatrixOutputResponse] = []
        if payload.method == "matrix":
            site_columns_by_id, site_series_map = await _load_numeric_series_map(
                db,
                payload.site_dataset_id,
                requested_site_ids,
                payload.site_exclude_flags,
            )
            _, ref_series_map = await _load_numeric_series_map(
                db,
                payload.ref_dataset_id,
                requested_ref_ids,
                payload.ref_exclude_flags,
            )
            result = mcp_matrix_method(site_series_map, ref_series_map, ref_series_map)
            primary_site_name = site_columns_by_id[payload.site_column_id].name
            primary_output = result["outputs"][primary_site_name]
            summary = mcp_summary(primary_output["predicted_series"], payload.method)
            matrix_outputs = _serialize_matrix_outputs(result["outputs"], site_columns_by_id, payload.max_prediction_points)
            params = {key: float(value) for key, value in primary_output["params"].items()}
            stats = _serialize_stats(primary_output["stats"])
            predicted_points = _serialize_predicted_points(primary_output["predicted_series"], payload.max_prediction_points)
        else:
            result = _run_method(payload.method, site_series, ref_series, ref_full_series)
            summary = mcp_summary(result["predicted_series"], payload.method)
            params = {key: float(value) for key, value in result["params"].items()}
            stats = _serialize_stats(result["stats"])
            predicted_points = _serialize_predicted_points(result["predicted_series"], payload.max_prediction_points)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return MCPPredictionResponse(
        site_dataset_id=payload.site_dataset_id,
        site_column_id=payload.site_column_id,
        ref_dataset_id=payload.ref_dataset_id,
        ref_column_id=payload.ref_column_id,
        site_column_ids=requested_site_ids,
        ref_column_ids=requested_ref_ids,
        method=payload.method,
        site_excluded_flag_ids=payload.site_exclude_flags,
        ref_excluded_flag_ids=payload.ref_exclude_flags,
        params=params,
        stats=stats,
        summary=_serialize_summary(summary),
        predicted_points=predicted_points,
        matrix_outputs=matrix_outputs,
    )


@router.post("/compare", response_model=MCPComparisonResponse)
async def compare(payload: MCPComparisonRequest, db: AsyncSession = Depends(get_db)) -> MCPComparisonResponse:
    _, site_series = await _load_numeric_series(db, payload.site_dataset_id, payload.site_column_id, payload.site_exclude_flags)
    _, ref_series = await _load_numeric_series(db, payload.ref_dataset_id, payload.ref_column_id, payload.ref_exclude_flags)
    _, ref_full_series = await _load_numeric_series(db, payload.ref_dataset_id, payload.ref_column_id, payload.ref_exclude_flags)
    requested_site_ids = _requested_column_ids(payload.site_column_id, payload.site_column_ids)
    requested_ref_ids = _requested_column_ids(payload.ref_column_id, payload.ref_column_ids)

    site_columns_by_id: dict[uuid.UUID, DataColumn] = {}
    site_series_map: dict[str, pd.Series] | None = None
    ref_series_map: dict[str, pd.Series] | None = None
    if "matrix" in payload.methods:
        site_columns_by_id, site_series_map = await _load_numeric_series_map(
            db,
            payload.site_dataset_id,
            requested_site_ids,
            payload.site_exclude_flags,
        )
        _, ref_series_map = await _load_numeric_series_map(
            db,
            payload.ref_dataset_id,
            requested_ref_ids,
            payload.ref_exclude_flags,
        )

    try:
        comparison_rows = compare_mcp_methods(
            site_series,
            ref_series,
            ref_full_series,
            methods=payload.methods,
            site_columns=site_series_map,
            ref_columns=ref_series_map,
            ref_full_columns=ref_series_map,
            target_site_name=site_columns_by_id[payload.site_column_id].name if site_columns_by_id else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    response_rows = [
        MCPComparisonRowResponse(
            method=row["method"],
            params={key: float(value) for key, value in row["params"].items()},
            stats=_serialize_stats(row["stats"]),
            summary=_serialize_summary(row["summary"]),
            cross_validation=_serialize_cross_validation(row["cross_validation"]),
            uncertainty=float(row["uncertainty"]),
        )
        for row in comparison_rows
    ]

    return MCPComparisonResponse(
        site_dataset_id=payload.site_dataset_id,
        site_column_id=payload.site_column_id,
        ref_dataset_id=payload.ref_dataset_id,
        ref_column_id=payload.ref_column_id,
        site_column_ids=requested_site_ids,
        ref_column_ids=requested_ref_ids,
        site_excluded_flag_ids=payload.site_exclude_flags,
        ref_excluded_flag_ids=payload.ref_exclude_flags,
        recommended_method=response_rows[0].method,
        results=response_rows,
    )