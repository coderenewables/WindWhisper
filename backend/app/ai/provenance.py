"""Analysis provenance tracking – links every analysis result to its exact inputs."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Any
from uuid import UUID

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AnalysisProvenance
from app.models.analysis_result import AnalysisResult

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def record_provenance(
    db: AsyncSession,
    *,
    analysis_result_id: UUID,
    dataset_id: UUID,
    column_ids: list[UUID] | None = None,
    excluded_flag_ids: list[UUID] | None = None,
    parameters: dict[str, Any] | None = None,
    data_frame: pd.DataFrame | None = None,
    time_range_start: datetime | None = None,
    time_range_end: datetime | None = None,
) -> AnalysisProvenance:
    """Record provenance metadata for an analysis result.

    Parameters
    ----------
    analysis_result_id : UUID of the persisted AnalysisResult
    dataset_id : UUID of the source dataset
    column_ids : list of DataColumn UUIDs used
    excluded_flag_ids : list of Flag UUIDs that were excluded
    parameters : analysis parameters dict (for hashing)
    data_frame : the actual input DataFrame (for hashing & stats)
    time_range_start / time_range_end : explicit time boundaries
    """
    data_hash = _compute_data_hash(data_frame) if data_frame is not None else None
    parameters_hash = _compute_parameters_hash(parameters) if parameters else None

    record_count: int | None = None
    recovery_pct: float | None = None

    if data_frame is not None and not data_frame.empty:
        record_count = len(data_frame)
        total_cells = data_frame.size
        non_null = int(data_frame.notna().sum().sum()) if total_cells else 0
        recovery_pct = round(non_null / total_cells * 100, 2) if total_cells else None

        if time_range_start is None and hasattr(data_frame.index, 'min'):
            try:
                idx_min = data_frame.index.min()
                if isinstance(idx_min, pd.Timestamp):
                    time_range_start = idx_min.to_pydatetime()
            except Exception:
                pass
        if time_range_end is None and hasattr(data_frame.index, 'max'):
            try:
                idx_max = data_frame.index.max()
                if isinstance(idx_max, pd.Timestamp):
                    time_range_end = idx_max.to_pydatetime()
            except Exception:
                pass

    prov = AnalysisProvenance(
        analysis_result_id=analysis_result_id,
        dataset_id=dataset_id,
        column_ids=column_ids,
        excluded_flag_ids=excluded_flag_ids,
        data_hash=data_hash,
        parameters_hash=parameters_hash,
        time_range_start=time_range_start,
        time_range_end=time_range_end,
        record_count=record_count,
        data_recovery_pct=recovery_pct,
    )
    db.add(prov)
    await db.flush()
    logger.debug("Recorded provenance %s for analysis %s", prov.id, analysis_result_id)
    return prov


async def verify_provenance(
    db: AsyncSession,
    provenance_id: UUID,
) -> dict[str, Any]:
    """Re-load data and verify hashes match the provenance record.

    Returns ``{"valid": True/False, "reason": "..."}``
    """
    prov = await db.get(AnalysisProvenance, provenance_id)
    if prov is None:
        return {"valid": False, "reason": "Provenance record not found"}

    if prov.data_hash is None:
        return {"valid": True, "reason": "No data hash recorded — cannot verify data integrity"}

    # Re-load the data using the same columns and flags
    try:
        from app.services.qc_engine import get_clean_dataframe
        frame = await get_clean_dataframe(
            db,
            prov.dataset_id,
            column_ids=prov.column_ids,
            exclude_flag_ids=prov.excluded_flag_ids,
        )
    except Exception as exc:
        return {"valid": False, "reason": f"Failed to reload data: {exc}"}

    if frame is None or frame.empty:
        return {"valid": False, "reason": "Reloaded data is empty"}

    # Apply time range filter if recorded
    if prov.time_range_start and prov.time_range_end:
        try:
            frame = frame.loc[prov.time_range_start:prov.time_range_end]
        except Exception:
            pass

    current_hash = _compute_data_hash(frame)
    if current_hash == prov.data_hash:
        return {"valid": True, "reason": "Data hash matches — inputs are unchanged"}

    return {
        "valid": False,
        "reason": "Data hash mismatch — the underlying data has changed since this analysis was run",
        "original_hash": prov.data_hash,
        "current_hash": current_hash,
        "original_records": prov.record_count,
        "current_records": len(frame),
    }


async def diff_provenance(
    db: AsyncSession,
    provenance_id_a: UUID,
    provenance_id_b: UUID,
) -> dict[str, Any]:
    """Compare two provenance records and report what changed."""
    prov_a = await db.get(AnalysisProvenance, provenance_id_a)
    prov_b = await db.get(AnalysisProvenance, provenance_id_b)

    if prov_a is None or prov_b is None:
        missing = []
        if prov_a is None:
            missing.append(str(provenance_id_a))
        if prov_b is None:
            missing.append(str(provenance_id_b))
        return {"error": f"Provenance record(s) not found: {', '.join(missing)}"}

    changes: list[dict[str, Any]] = []

    # Dataset
    if prov_a.dataset_id != prov_b.dataset_id:
        changes.append({"field": "dataset_id", "a": str(prov_a.dataset_id), "b": str(prov_b.dataset_id)})

    # Columns
    cols_a = set(prov_a.column_ids or [])
    cols_b = set(prov_b.column_ids or [])
    if cols_a != cols_b:
        changes.append({
            "field": "column_ids",
            "added": [str(c) for c in cols_b - cols_a],
            "removed": [str(c) for c in cols_a - cols_b],
        })

    # Flags
    flags_a = set(prov_a.excluded_flag_ids or [])
    flags_b = set(prov_b.excluded_flag_ids or [])
    if flags_a != flags_b:
        changes.append({
            "field": "excluded_flag_ids",
            "added": [str(f) for f in flags_b - flags_a],
            "removed": [str(f) for f in flags_a - flags_b],
        })

    # Time range
    if prov_a.time_range_start != prov_b.time_range_start or prov_a.time_range_end != prov_b.time_range_end:
        changes.append({
            "field": "time_range",
            "a": {"start": str(prov_a.time_range_start), "end": str(prov_a.time_range_end)},
            "b": {"start": str(prov_b.time_range_start), "end": str(prov_b.time_range_end)},
        })

    # Data hash
    if prov_a.data_hash != prov_b.data_hash:
        changes.append({"field": "data_hash", "a": prov_a.data_hash, "b": prov_b.data_hash})

    # Parameters hash
    if prov_a.parameters_hash != prov_b.parameters_hash:
        changes.append({"field": "parameters_hash", "a": prov_a.parameters_hash, "b": prov_b.parameters_hash})

    # Record count
    if prov_a.record_count != prov_b.record_count:
        changes.append({"field": "record_count", "a": prov_a.record_count, "b": prov_b.record_count})

    # Recovery
    if prov_a.data_recovery_pct != prov_b.data_recovery_pct:
        changes.append({"field": "data_recovery_pct", "a": prov_a.data_recovery_pct, "b": prov_b.data_recovery_pct})

    return {
        "provenance_a": str(provenance_id_a),
        "provenance_b": str(provenance_id_b),
        "same_dataset": prov_a.dataset_id == prov_b.dataset_id,
        "data_unchanged": prov_a.data_hash == prov_b.data_hash,
        "parameters_unchanged": prov_a.parameters_hash == prov_b.parameters_hash,
        "changes": changes,
        "change_count": len(changes),
    }


async def get_provenance_for_result(
    db: AsyncSession,
    analysis_result_id: UUID,
) -> AnalysisProvenance | None:
    """Look up the provenance record for a given analysis result."""
    q = select(AnalysisProvenance).where(
        AnalysisProvenance.analysis_result_id == analysis_result_id
    ).order_by(AnalysisProvenance.created_at.desc()).limit(1)
    return (await db.execute(q)).scalars().first()


# ---------------------------------------------------------------------------
# Helper: persist AnalysisResult + provenance in one call
# ---------------------------------------------------------------------------


async def store_result_with_provenance(
    db: AsyncSession,
    *,
    dataset_id: UUID,
    analysis_type: str,
    parameters: dict[str, Any],
    results: dict[str, Any],
    column_ids: list[UUID] | None = None,
    excluded_flag_ids: list[UUID] | None = None,
    data_frame: pd.DataFrame | None = None,
) -> tuple[AnalysisResult, AnalysisProvenance]:
    """Store an AnalysisResult and its provenance record atomically.

    This is the primary integration point for analysis endpoints.
    """
    ar = AnalysisResult(
        dataset_id=dataset_id,
        analysis_type=analysis_type,
        parameters=parameters,
        results=results,
    )
    db.add(ar)
    await db.flush()  # get ar.id

    prov = await record_provenance(
        db,
        analysis_result_id=ar.id,
        dataset_id=dataset_id,
        column_ids=column_ids,
        excluded_flag_ids=excluded_flag_ids,
        parameters=parameters,
        data_frame=data_frame,
    )
    return ar, prov


# ---------------------------------------------------------------------------
# Hashing utilities
# ---------------------------------------------------------------------------


def _compute_data_hash(df: pd.DataFrame) -> str:
    """Compute a SHA-256 hash of a DataFrame's numeric values.

    Uses a deterministic representation: sorted columns, float64 values
    converted to a byte buffer.
    """
    if df is None or df.empty:
        return hashlib.sha256(b"empty").hexdigest()

    try:
        # Sort columns for determinism
        sorted_cols = sorted(df.columns)
        numeric = df[sorted_cols].select_dtypes(include=[np.number])
        if numeric.empty:
            # Fall back to string hash of all values
            content = df[sorted_cols].to_csv(index=True).encode("utf-8")
            return hashlib.sha256(content).hexdigest()

        # Use raw bytes for speed — NaN values are included as-is
        buf = numeric.to_numpy(dtype=np.float64, na_value=np.nan).tobytes()
        return hashlib.sha256(buf).hexdigest()
    except Exception:
        # Fallback: CSV representation
        content = df.to_csv(index=True).encode("utf-8")
        return hashlib.sha256(content).hexdigest()


def _compute_parameters_hash(params: dict[str, Any]) -> str:
    """Compute a SHA-256 hash of analysis parameters.

    Serialises to sorted JSON for determinism. UUID and datetime
    values are converted to strings.
    """
    serialised = json.dumps(params, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(serialised).hexdigest()
