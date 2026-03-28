from __future__ import annotations

import math
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import DataColumn, Dataset, Flag, FlaggedRange, Project, TimeseriesData, Workflow
from app.schemas.mcp import MCPMethod
from app.schemas.qc import ReconstructionMethod, ReconstructionSaveMode
from app.schemas.report import ReportColumnSelection, ReportGenerateRequest
from app.schemas.workflow import WorkflowExecutionLogEntry, WorkflowStepDefinition
from app.services.data_reconstruction import build_reconstruction_payload, persist_reconstruction, run_reconstruction
from app.services.export_engine import export_csv, export_iea_json, export_openwind, export_wasp_tab
from app.services.file_parsers import (
    detect_columns,
    is_campbell_content,
    is_nrg_content,
    parse_campbell,
    parse_csv,
    parse_excel,
    parse_nrg,
    sniff_delimiter,
)
from app.services.history import (
    COLUMN_ADDED_ACTION_TYPE,
    FLAG_APPLIED_ACTION_TYPE,
    record_change,
    serialize_column_snapshot,
    serialize_flagged_range_snapshot,
)
from app.services.mcp_engine import (
    compare_mcp_methods,
    correlation_stats,
    mcp_linear_least_squares,
    mcp_matrix_method,
    mcp_summary,
    mcp_variance_ratio,
)
from app.services.qc_engine import apply_rules, filter_flagged_data, get_clean_dataframe, get_dataset_or_404, load_dataset_frame
from app.services.report_generator import generate_report
from app.services.wind_shear import extrapolate_to_height


TEXT_SUFFIXES = {".csv", ".txt", ".tsv"}
EXCEL_SUFFIXES = {".xls", ".xlsx"}
LOGGER_SUFFIXES = {".dat"}
SUPPORTED_IMPORT_SUFFIXES = TEXT_SUFFIXES | EXCEL_SUFFIXES | LOGGER_SUFFIXES
ARTIFACT_DIR = Path(tempfile.gettempdir()) / "gokaatru_workflow_artifacts"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _artifact_dir() -> Path:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    return ARTIFACT_DIR


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, np.ndarray):
        return [_json_safe(item) for item in value.tolist()]
    if isinstance(value, np.generic):
        return _json_safe(value.item())
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def normalize_steps(steps: list[WorkflowStepDefinition]) -> list[WorkflowStepDefinition]:
    ordered = sorted(steps, key=lambda item: (item.order, item.step_type))
    normalized: list[WorkflowStepDefinition] = []
    for index, step in enumerate(ordered, start=1):
        normalized.append(step.model_copy(update={"order": index}))
    return normalized


def serialize_workflow(workflow: Workflow) -> dict[str, Any]:
    normalized_steps = normalize_steps([WorkflowStepDefinition.model_validate(step) for step in (workflow.steps or [])])
    last_run_log = [WorkflowExecutionLogEntry.model_validate(item) for item in (workflow.last_run_log or [])]
    return {
        "id": workflow.id,
        "project_id": workflow.project_id,
        "name": workflow.name,
        "steps": normalized_steps,
        "status": workflow.status,
        "last_run": workflow.last_run,
        "last_run_log": last_run_log,
        "created_at": workflow.created_at,
        "updated_at": workflow.updated_at,
    }


async def get_project_or_404(db: AsyncSession, project_id: uuid.UUID) -> Project:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def get_workflow_or_404(db: AsyncSession, workflow_id: uuid.UUID) -> Workflow:
    statement = (
        select(Workflow)
        .options(selectinload(Workflow.project))
        .where(Workflow.id == workflow_id)
        .execution_options(populate_existing=True)
    )
    workflow = (await db.execute(statement)).scalar_one_or_none()
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


async def list_project_workflows(db: AsyncSession, project_id: uuid.UUID) -> list[Workflow]:
    await get_project_or_404(db, project_id)
    rows = (
        await db.execute(
            select(Workflow)
            .where(Workflow.project_id == project_id)
            .order_by(Workflow.created_at.desc(), Workflow.id.desc())
            .execution_options(populate_existing=True),
        )
    ).scalars().all()
    return list(rows)


def _normalize_scalar(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def _select_text_parser(file_path: Path, suffix: str) -> str:
    if suffix in {".csv", ".tsv"}:
        return "csv"
    text = file_path.read_text(encoding="utf-8-sig", errors="ignore")[:4096]
    if suffix == ".dat":
        return "campbell" if is_campbell_content(text) else "csv"
    if suffix == ".txt":
        return "nrg" if is_nrg_content(text) else "csv"
    return "csv"


def _merge_column_metadata(columns: list[Any], parser_metadata: dict[str, Any]) -> list[Any]:
    overrides = parser_metadata.get("column_metadata", {})
    merged_columns: list[Any] = []
    for column in columns:
        override = overrides.get(column.name, {})
        merged_columns.append(
            column.model_copy(
                update={
                    "measurement_type": override.get("measurement_type", column.measurement_type),
                    "height_m": override.get("height_m", column.height_m),
                    "unit": override.get("unit", column.unit),
                },
            )
        )
    return merged_columns


def _parse_uuid(value: Any, field_name: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a valid UUID") from exc


def _parse_uuid_list(value: Any, field_name: str) -> list[uuid.UUID]:
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be a list of UUID values")
    return [_parse_uuid(item, field_name) for item in value]


def _parse_str_list(value: Any, field_name: str) -> list[str]:
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be a list of strings")
    return [str(item) for item in value if str(item).strip()]


def _parse_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _column_height(column: DataColumn) -> float:
    if column.height_m is None:
        raise ValueError(f"Column {column.name} is missing a measurement height")
    return float(column.height_m)


def _resolve_dataset_column(dataset: Dataset, column_id: uuid.UUID, label: str) -> DataColumn:
    for column in dataset.columns:
        if column.id == column_id:
            return column
    raise ValueError(f"{label} does not belong to dataset {dataset.id}")


async def _load_numeric_series(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    column_id: uuid.UUID,
    exclude_flag_ids: list[uuid.UUID],
) -> tuple[DataColumn, pd.Series]:
    dataset = await get_dataset_or_404(db, dataset_id)
    column = _resolve_dataset_column(dataset, column_id, "column_id")
    frame = await get_clean_dataframe(db, dataset_id, column_ids=[column.id], exclude_flag_ids=exclude_flag_ids)
    if column.name not in frame.columns:
        return column, pd.Series(dtype=float)
    series = pd.to_numeric(frame[column.name], errors="coerce").astype(float)
    return column, series.replace([np.inf, -np.inf], np.nan).dropna().sort_index()


async def _load_numeric_series_map(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    column_ids: list[uuid.UUID],
    exclude_flag_ids: list[uuid.UUID],
) -> tuple[dict[uuid.UUID, DataColumn], dict[str, pd.Series]]:
    dataset = await get_dataset_or_404(db, dataset_id)
    resolved = [_resolve_dataset_column(dataset, column_id, "column_ids") for column_id in column_ids]
    frame = await get_clean_dataframe(db, dataset_id, column_ids=[column.id for column in resolved], exclude_flag_ids=exclude_flag_ids)
    columns_by_id = {column.id: column for column in resolved}
    series_by_name: dict[str, pd.Series] = {}
    for column in resolved:
        if column.name not in frame.columns:
            series_by_name[column.name] = pd.Series(dtype=float)
            continue
        series = pd.to_numeric(frame[column.name], errors="coerce").astype(float)
        series_by_name[column.name] = series.replace([np.inf, -np.inf], np.nan).sort_index()
    return columns_by_id, series_by_name


def _write_artifact(prefix: str, file_name: str, content: bytes) -> Path:
    target = _artifact_dir() / f"{prefix}-{uuid.uuid4()}-{file_name}"
    target.write_bytes(content)
    return target


async def _execute_import_file(db: AsyncSession, workflow: Workflow, params: dict[str, Any]) -> dict[str, Any]:
    raw_path = params.get("file_path")
    if not raw_path:
        raise ValueError("import_file requires file_path")

    file_path = Path(str(raw_path))
    if not file_path.exists() or not file_path.is_file():
        raise ValueError(f"File not found: {file_path}")

    suffix = file_path.suffix.lower()
    if suffix not in SUPPORTED_IMPORT_SUFFIXES:
        raise ValueError("Unsupported import file type")

    parser_type: str
    parser_metadata: dict[str, Any] = {}
    if suffix in TEXT_SUFFIXES:
        parser_type = _select_text_parser(file_path, suffix)
        if parser_type == "nrg":
            frame, parser_metadata = parse_nrg(str(file_path))
        else:
            frame = parse_csv(str(file_path))
            parser_type = "csv"
    elif suffix in LOGGER_SUFFIXES:
        parser_type = _select_text_parser(file_path, suffix)
        if parser_type == "campbell":
            frame, parser_metadata = parse_campbell(str(file_path))
        else:
            frame = parse_csv(str(file_path))
            parser_type = "csv"
    else:
        sheet_name = params.get("sheet_name", 0)
        frame, _, _ = parse_excel(str(file_path), sheet_name=sheet_name)
        parser_type = "excel"

    columns = _merge_column_metadata(detect_columns(frame), parser_metadata)
    dataset_name = str(params.get("dataset_name") or file_path.stem)
    time_step_seconds = params.get("time_step_seconds") or None
    if time_step_seconds is not None:
        time_step_seconds = int(time_step_seconds)
    else:
        diffs = frame.index.to_series().diff().dropna() if len(frame.index) > 1 else pd.Series(dtype="timedelta64[ns]")
        time_step_seconds = int(max(1, round(diffs.median().total_seconds()))) if not diffs.empty else None

    dataset = Dataset(
        project_id=workflow.project_id,
        name=dataset_name,
        source_type=str(params.get("source_type") or "file_upload"),
        file_name=file_path.name,
        time_step_seconds=time_step_seconds,
        start_time=frame.index.min().to_pydatetime() if len(frame.index) else None,
        end_time=frame.index.max().to_pydatetime() if len(frame.index) else None,
        metadata_json={
            "parser_type": parser_type,
            "delimiter": sniff_delimiter(str(file_path)) if parser_type == "csv" else None,
            "source_metadata": parser_metadata,
            "workflow_id": str(workflow.id),
        },
    )
    db.add(dataset)
    await db.flush()

    db.add_all(
        [
            DataColumn(
                dataset_id=dataset.id,
                name=column.name,
                unit=column.unit,
                measurement_type=column.measurement_type,
                height_m=column.height_m,
                sensor_info={"confidence": column.confidence},
            )
            for column in columns
        ]
    )

    rows_to_insert = [
        {
            "dataset_id": dataset.id,
            "timestamp": timestamp.to_pydatetime(),
            "values_json": {column_name: _normalize_scalar(value) for column_name, value in row.items()},
        }
        for timestamp, row in frame.iterrows()
    ]
    if rows_to_insert:
        await db.execute(insert(TimeseriesData), rows_to_insert)
    await db.commit()

    return {
        "dataset_id": dataset.id,
        "dataset_name": dataset.name,
        "row_count": len(frame),
        "column_count": len(columns),
        "parser_type": parser_type,
        "source_path": str(file_path),
    }


async def _execute_apply_qc_rules(db: AsyncSession, params: dict[str, Any]) -> dict[str, Any]:
    dataset_id = _parse_uuid(params.get("dataset_id"), "dataset_id")
    dataset = await get_dataset_or_404(db, dataset_id)
    flag_ids = _parse_uuid_list(params.get("flag_ids"), "flag_ids")
    flag_names = set(_parse_str_list(params.get("flag_names"), "flag_names"))

    selected_flags: list[Flag] = list(dataset.flags)
    if flag_ids:
        selected_flag_ids = set(flag_ids)
        selected_flags = [flag for flag in selected_flags if flag.id in selected_flag_ids]
    if flag_names:
        selected_flags = [flag for flag in selected_flags if flag.name in flag_names]

    if not selected_flags:
        raise ValueError("No matching flags were found for apply_qc_rules")

    results: list[dict[str, Any]] = []
    for flag in selected_flags:
        previous_auto_ranges = [serialize_flagged_range_snapshot(flagged_range) for flagged_range in flag.ranges if flagged_range.applied_by == "auto"]
        flagged_ranges = await apply_rules(db, dataset.id, flag.id)
        await record_change(
            db,
            dataset.id,
            action_type=FLAG_APPLIED_ACTION_TYPE,
            description=f"Applied automatic QC rules for {flag.name}.",
            before_state={"mode": "auto_ranges_replace", "flag_id": str(flag.id), "ranges": previous_auto_ranges},
            after_state={
                "mode": "auto_ranges_replace",
                "flag_id": str(flag.id),
                "ranges": [serialize_flagged_range_snapshot(flagged_range) for flagged_range in flagged_ranges],
            },
        )
        results.append({"flag_id": flag.id, "flag_name": flag.name, "range_count": len(flagged_ranges)})

    await db.commit()
    return {"dataset_id": dataset.id, "flags_processed": results, "flag_count": len(results)}


async def _execute_reconstruct_gaps(db: AsyncSession, params: dict[str, Any]) -> dict[str, Any]:
    dataset_id = _parse_uuid(params.get("dataset_id"), "dataset_id")
    column_id = _parse_uuid(params.get("column_id"), "column_id")
    dataset = await get_dataset_or_404(db, dataset_id)
    source_column = _resolve_dataset_column(dataset, column_id, "column_id")
    method = ReconstructionMethod(str(params.get("method") or ReconstructionMethod.interpolation.value))
    save_mode = ReconstructionSaveMode(str(params.get("save_mode") or ReconstructionSaveMode.preview.value))
    predictor_column_ids = _parse_uuid_list(params.get("predictor_column_ids"), "predictor_column_ids")
    reference_dataset_id = params.get("reference_dataset_id")
    reference_column_id = params.get("reference_column_id")
    result = await run_reconstruction(
        db,
        dataset,
        source_column,
        method=method,
        predictor_column_ids=predictor_column_ids,
        reference_dataset_id=_parse_uuid(reference_dataset_id, "reference_dataset_id") if reference_dataset_id else None,
        reference_column_id=_parse_uuid(reference_column_id, "reference_column_id") if reference_column_id else None,
        max_gap_hours=int(params.get("max_gap_hours", 6)),
        n_neighbors=int(params.get("n_neighbors", 5)),
    )
    payload = build_reconstruction_payload(result)
    saved_column = None
    if save_mode != ReconstructionSaveMode.preview:
        saved_column = await persist_reconstruction(
            db,
            dataset,
            source_column,
            result,
            method=method,
            save_mode=save_mode,
            new_column_name=str(params.get("new_column_name")) if params.get("new_column_name") else None,
        )
        await db.commit()

    return {
        "dataset_id": dataset.id,
        "column_id": source_column.id,
        "method": method.value,
        "save_mode": save_mode.value,
        "summary": _json_safe(payload["summary"]),
        "saved_column": None if saved_column is None else {"id": saved_column.id, "name": saved_column.name},
    }


async def _execute_calculate_shear(db: AsyncSession, params: dict[str, Any]) -> dict[str, Any]:
    dataset_id = _parse_uuid(params.get("dataset_id"), "dataset_id")
    dataset = await get_dataset_or_404(db, dataset_id)
    requested_speed_ids = _parse_uuid_list(params.get("speed_column_ids"), "speed_column_ids")
    exclude_flags = _parse_uuid_list(params.get("exclude_flags"), "exclude_flags")
    target_height = float(params.get("target_height"))
    method = str(params.get("method") or "power")
    create_column = _parse_bool(params.get("create_column"), default=False)

    speed_columns = [column for column in dataset.columns if column.measurement_type == "speed" and column.height_m is not None]
    if requested_speed_ids:
        requested_set = set(requested_speed_ids)
        speed_columns = [column for column in speed_columns if column.id in requested_set]
    unique_heights = {_column_height(column) for column in speed_columns}
    if len(unique_heights) < 2:
        raise ValueError("calculate_shear requires at least two speed columns with distinct heights")

    loaded = await load_dataset_frame(db, dataset.id, column_ids=[column.id for column in speed_columns])
    filtered = await filter_flagged_data(db, loaded.frame, dataset.id, loaded.columns_by_id, exclude_flags)
    speeds_by_height = {
        _column_height(column): pd.to_numeric(filtered[column.name], errors="coerce").to_numpy(dtype=float)
        for column in speed_columns
    }
    extrapolated = extrapolate_to_height(
        speeds_by_height,
        column_ids_by_height={_column_height(column): column.id for column in speed_columns},
        target_height=target_height,
        method=method,
    )
    values = np.asarray(extrapolated["values"], dtype=float)
    created_column = None

    if create_column:
        representative = extrapolated.get("representative_pair")
        if representative is None:
            raise ValueError("Unable to create extrapolated column without a representative shear pair")
        column_name = str(params.get("column_name") or f"Speed_{target_height:g}m_{method}")
        if any(column.name == column_name for column in dataset.columns):
            raise ValueError("A column with this name already exists in the dataset")

        column = DataColumn(
            dataset_id=dataset.id,
            name=column_name,
            unit=speed_columns[0].unit,
            measurement_type="speed",
            height_m=target_height,
            sensor_info={
                "derived": True,
                "method": method,
                "source": "workflow_wind_shear_extrapolation",
                "representative_pair": _json_safe(representative),
            },
        )
        db.add(column)
        await db.flush()

        rows = (
            await db.execute(
                select(TimeseriesData)
                .where(TimeseriesData.dataset_id == dataset.id)
                .order_by(TimeseriesData.timestamp.asc(), TimeseriesData.id.asc()),
            )
        ).scalars().all()
        if len(rows) != len(values):
            raise ValueError("Extrapolated values do not align with dataset rows")

        change_entries: list[dict[str, Any]] = []
        for row, value in zip(rows, values, strict=False):
            stored_value = None if not np.isfinite(value) else float(value)
            previous_had_key = column_name in row.values_json
            change_entries.append(
                {
                    "timestamp": row.timestamp.isoformat(),
                    "row_existed": True,
                    "previous_had_key": previous_had_key,
                    "previous_value": row.values_json.get(column_name) if previous_had_key else None,
                    "new_value": stored_value,
                }
            )
            row.values_json = {**row.values_json, column_name: stored_value}

        await record_change(
            db,
            dataset.id,
            action_type=COLUMN_ADDED_ACTION_TYPE,
            description=f"Created extrapolated wind shear column {column.name} at {target_height:g} m using the {method} method.",
            before_state={
                "mode": "timeseries_column_create",
                "source": "workflow_wind_shear_extrapolation",
                "method": method,
                "target_height": target_height,
                "created_column": serialize_column_snapshot(column),
                "changes": change_entries,
            },
            after_state={
                "mode": "timeseries_column_create",
                "source": "workflow_wind_shear_extrapolation",
                "method": method,
                "target_height": target_height,
                "created_column_id": str(column.id),
                "created_column_name": column.name,
                "changes": [{"timestamp": entry["timestamp"], "new_value": entry["new_value"]} for entry in change_entries],
            },
        )
        await db.commit()
        created_column = {"id": column.id, "name": column.name}

    valid = values[np.isfinite(values)]
    return {
        "dataset_id": dataset.id,
        "method": method,
        "target_height": target_height,
        "representative_pair": _json_safe(extrapolated.get("representative_pair")),
        "summary": {
            "count": int(valid.size),
            "mean_speed": float(np.mean(valid)) if valid.size else None,
            "median_speed": float(np.median(valid)) if valid.size else None,
        },
        "created_column": _json_safe(created_column),
    }


async def _execute_run_mcp(db: AsyncSession, params: dict[str, Any]) -> dict[str, Any]:
    site_dataset_id = _parse_uuid(params.get("site_dataset_id"), "site_dataset_id")
    site_column_id = _parse_uuid(params.get("site_column_id"), "site_column_id")
    ref_dataset_id = _parse_uuid(params.get("ref_dataset_id"), "ref_dataset_id")
    ref_column_id = _parse_uuid(params.get("ref_column_id"), "ref_column_id")
    method = str(params.get("method") or "linear")
    if method not in ("linear", "variance_ratio", "matrix"):
        raise ValueError(f"Unsupported MCP method: {method}")
    site_exclude_flags = _parse_uuid_list(params.get("site_exclude_flags"), "site_exclude_flags")
    ref_exclude_flags = _parse_uuid_list(params.get("ref_exclude_flags"), "ref_exclude_flags")
    site_column_ids = [site_column_id, *_parse_uuid_list(params.get("site_column_ids"), "site_column_ids")]
    ref_column_ids = [ref_column_id, *_parse_uuid_list(params.get("ref_column_ids"), "ref_column_ids")]

    _, site_series = await _load_numeric_series(db, site_dataset_id, site_column_id, site_exclude_flags)
    _, ref_series = await _load_numeric_series(db, ref_dataset_id, ref_column_id, ref_exclude_flags)
    _, ref_full_series = await _load_numeric_series(db, ref_dataset_id, ref_column_id, ref_exclude_flags)

    if method == "matrix":
        site_columns_by_id, site_series_map = await _load_numeric_series_map(db, site_dataset_id, list(dict.fromkeys(site_column_ids)), site_exclude_flags)
        _, ref_series_map = await _load_numeric_series_map(db, ref_dataset_id, list(dict.fromkeys(ref_column_ids)), ref_exclude_flags)
        result = mcp_matrix_method(site_series_map, ref_series_map, ref_series_map)
        primary_name = site_columns_by_id[site_column_id].name
        primary_output = result["outputs"][primary_name]
        summary = mcp_summary(primary_output["predicted_series"], method)
        stats = primary_output["stats"]
        details = {
            "method": method,
            "summary": _json_safe(summary),
            "stats": _json_safe(stats),
            "output_count": len(result["outputs"]),
        }
    else:
        stats = correlation_stats(site_series, ref_series)
        result = mcp_linear_least_squares(site_series, ref_series, ref_full_series) if method == "linear" else mcp_variance_ratio(site_series, ref_series, ref_full_series)
        summary = mcp_summary(result["predicted_series"], method)
        details = {
            "method": method,
            "stats": _json_safe(stats),
            "params": _json_safe(result["params"]),
            "summary": _json_safe(summary),
        }

    if _parse_bool(params.get("compare_methods"), default=False):
        comparison = compare_mcp_methods(site_series, ref_series, ref_full_series, methods=list(dict.fromkeys([method, "linear", "variance_ratio"])))
        details["comparison"] = _json_safe(comparison)

    return details


async def _execute_generate_report(db: AsyncSession, workflow: Workflow, params: dict[str, Any]) -> dict[str, Any]:
    dataset_id = _parse_uuid(params.get("dataset_id"), "dataset_id")
    sections = _parse_str_list(params.get("sections"), "sections")
    exclude_flags = _parse_uuid_list(params.get("exclude_flags"), "exclude_flags")
    payload = ReportGenerateRequest(
        dataset_id=dataset_id,
        sections=sections,
        exclude_flags=exclude_flags,
        format=str(params.get("format") or "pdf"),
        title=str(params.get("title")) if params.get("title") else None,
        power_curve_id=_parse_uuid(params.get("power_curve_id"), "power_curve_id") if params.get("power_curve_id") else None,
        column_selection=ReportColumnSelection.model_validate(params.get("column_selection") or {}),
    )
    artifact = await generate_report(
        db,
        workflow.project_id,
        dataset_id=payload.dataset_id,
        sections=payload.sections,
        report_format=payload.format,
        exclude_flag_ids=payload.exclude_flags,
        title=payload.title,
        column_selection=payload.column_selection,
        power_curve_id=payload.power_curve_id,
    )
    artifact_path = _write_artifact("report", artifact.file_name, artifact.content)
    return {
        "dataset_id": dataset_id,
        "file_name": artifact.file_name,
        "media_type": artifact.media_type,
        "size_bytes": len(artifact.content),
        "artifact_path": str(artifact_path),
    }


async def _execute_export_data(db: AsyncSession, params: dict[str, Any]) -> dict[str, Any]:
    dataset_id = _parse_uuid(params.get("dataset_id"), "dataset_id")
    export_format = str(params.get("format") or "csv")
    column_ids = _parse_uuid_list(params.get("column_ids"), "column_ids")
    exclude_flags = _parse_uuid_list(params.get("exclude_flags"), "exclude_flags")
    resample = str(params.get("resample")) if params.get("resample") else None

    if export_format == "csv":
        artifact = await export_csv(db, dataset_id, column_ids=column_ids, exclude_flag_ids=exclude_flags, resample=resample)
    elif export_format == "iea_json":
        artifact = await export_iea_json(db, dataset_id, column_ids=column_ids, exclude_flag_ids=exclude_flags, resample=resample)
    elif export_format == "openwind":
        artifact = await export_openwind(db, dataset_id, column_ids=column_ids, exclude_flag_ids=exclude_flags, resample=resample)
    elif export_format == "wasp_tab":
        artifact = await export_wasp_tab(
            db,
            dataset_id,
            speed_column_id=_parse_uuid(params.get("speed_column_id"), "speed_column_id"),
            direction_column_id=_parse_uuid(params.get("direction_column_id"), "direction_column_id"),
            exclude_flag_ids=exclude_flags,
            num_sectors=int(params.get("num_sectors", 12)),
            speed_bin_width=float(params.get("speed_bin_width", 1.0)),
        )
    else:
        raise ValueError(f"Unsupported export format: {export_format}")

    artifact_path = _write_artifact("export", artifact.file_name, artifact.content)
    return {
        "dataset_id": dataset_id,
        "format": export_format,
        "file_name": artifact.file_name,
        "media_type": artifact.media_type,
        "size_bytes": len(artifact.content),
        "artifact_path": str(artifact_path),
    }


async def execute_workflow_step(db: AsyncSession, workflow: Workflow, step: WorkflowStepDefinition) -> dict[str, Any]:
    if step.step_type == "import_file":
        return await _execute_import_file(db, workflow, step.params)
    if step.step_type == "apply_qc_rules":
        return await _execute_apply_qc_rules(db, step.params)
    if step.step_type == "reconstruct_gaps":
        return await _execute_reconstruct_gaps(db, step.params)
    if step.step_type == "calculate_shear":
        return await _execute_calculate_shear(db, step.params)
    if step.step_type == "run_mcp":
        return await _execute_run_mcp(db, step.params)
    if step.step_type == "generate_report":
        return await _execute_generate_report(db, workflow, step.params)
    if step.step_type == "export_data":
        return await _execute_export_data(db, step.params)
    raise ValueError(f"Unsupported workflow step type: {step.step_type}")


async def run_workflow(db: AsyncSession, workflow_id: uuid.UUID) -> dict[str, Any]:
    workflow = await get_workflow_or_404(db, workflow_id)
    steps = normalize_steps([WorkflowStepDefinition.model_validate(step) for step in (workflow.steps or [])])
    started_at = _utcnow()

    workflow.status = "running"
    workflow.last_run = started_at
    workflow.last_run_log = []
    await db.commit()

    results: list[dict[str, Any]] = []
    error_message: str | None = None

    for step in steps:
        step_started_at = _utcnow()
        try:
            details = await execute_workflow_step(db, workflow, step)
            step_result = WorkflowExecutionLogEntry(
                order=step.order,
                step_type=step.step_type,
                status="completed",
                started_at=step_started_at,
                finished_at=_utcnow(),
                message=f"Completed {step.step_type}",
                details=_json_safe(details) or {},
            )
            results.append(step_result.model_dump(mode="json"))
            workflow = await get_workflow_or_404(db, workflow_id)
            workflow.last_run_log = results
            await db.commit()
        except Exception as exc:
            await db.rollback()
            error_message = str(exc)
            failed_result = WorkflowExecutionLogEntry(
                order=step.order,
                step_type=step.step_type,
                status="failed",
                started_at=step_started_at,
                finished_at=_utcnow(),
                message=f"Failed {step.step_type}",
                details={"error": error_message},
            )
            results.append(failed_result.model_dump(mode="json"))
            workflow = await get_workflow_or_404(db, workflow_id)
            workflow.status = "failed"
            workflow.last_run = started_at
            workflow.last_run_log = results
            await db.commit()
            break

    if error_message is None:
        workflow = await get_workflow_or_404(db, workflow_id)
        workflow.status = "completed"
        workflow.last_run = started_at
        workflow.last_run_log = results
        await db.commit()

    workflow = await get_workflow_or_404(db, workflow_id)
    finished_at = _utcnow()
    return {
        "workflow": serialize_workflow(workflow),
        "started_at": started_at,
        "finished_at": finished_at,
        "status": workflow.status,
        "step_results": [WorkflowExecutionLogEntry.model_validate(item) for item in results],
        "error": error_message,
    }