"""Tests for analysis provenance tracking — hash computation, verification, diff."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from uuid import uuid4

import numpy as np
import pandas as pd
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AnalysisResult, DataColumn, Dataset, Project
from app.models.ai import AnalysisProvenance


# ── Fixtures ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def project(db_session: AsyncSession) -> Project:
    p = Project(name="Provenance Test")
    db_session.add(p)
    await db_session.flush()
    return p


@pytest_asyncio.fixture
async def dataset(db_session: AsyncSession, project: Project) -> Dataset:
    ds = Dataset(project_id=project.id, name="Prov DS", source_type="met_tower",
                 start_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
                 end_time=datetime(2024, 7, 1, tzinfo=timezone.utc))
    db_session.add(ds)
    await db_session.flush()
    return ds


@pytest_asyncio.fixture
async def analysis_result(db_session: AsyncSession, dataset: Dataset) -> AnalysisResult:
    ar = AnalysisResult(
        dataset_id=dataset.id, analysis_type="weibull",
        parameters={"column": "Speed_80m"}, results={"k": 2.1, "A": 7.8},
    )
    db_session.add(ar)
    await db_session.flush()
    return ar


def _sample_df() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    return pd.DataFrame({
        "Speed_80m": rng.normal(7.0, 2.0, 100),
        "Dir_80m": rng.uniform(0, 360, 100),
    })


# ── Hash utilities ──────────────────────────────────────────────────

def test_compute_data_hash_deterministic():
    from app.ai.provenance import _compute_data_hash
    df = _sample_df()
    h1 = _compute_data_hash(df)
    h2 = _compute_data_hash(df)
    assert h1 == h2
    assert len(h1) == 64  # SHA-256


def test_compute_data_hash_different_data():
    from app.ai.provenance import _compute_data_hash
    df1 = _sample_df()
    df2 = _sample_df()
    df2.iloc[0, 0] = 999.0
    assert _compute_data_hash(df1) != _compute_data_hash(df2)


def test_compute_data_hash_empty():
    from app.ai.provenance import _compute_data_hash
    h = _compute_data_hash(pd.DataFrame())
    assert h == hashlib.sha256(b"empty").hexdigest()


def test_compute_parameters_hash_deterministic():
    from app.ai.provenance import _compute_parameters_hash
    params = {"column": "Speed_80m", "method": "power"}
    h1 = _compute_parameters_hash(params)
    h2 = _compute_parameters_hash(params)
    assert h1 == h2


def test_compute_parameters_hash_different_params():
    from app.ai.provenance import _compute_parameters_hash
    h1 = _compute_parameters_hash({"column": "Speed_80m"})
    h2 = _compute_parameters_hash({"column": "Speed_60m"})
    assert h1 != h2


def test_compute_parameters_hash_order_independent():
    from app.ai.provenance import _compute_parameters_hash
    h1 = _compute_parameters_hash({"a": 1, "b": 2})
    h2 = _compute_parameters_hash({"b": 2, "a": 1})
    assert h1 == h2


# ── record_provenance ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_record_provenance_basic(db_session, dataset, analysis_result):
    from app.ai.provenance import record_provenance
    prov = await record_provenance(
        db_session,
        analysis_result_id=analysis_result.id,
        dataset_id=dataset.id,
        parameters={"column": "Speed_80m"},
    )
    assert prov.id is not None
    assert prov.analysis_result_id == analysis_result.id
    assert prov.dataset_id == dataset.id


@pytest.mark.asyncio
async def test_record_provenance_with_dataframe(db_session, dataset, analysis_result):
    from app.ai.provenance import record_provenance
    df = _sample_df()
    prov = await record_provenance(
        db_session,
        analysis_result_id=analysis_result.id,
        dataset_id=dataset.id,
        data_frame=df,
    )
    assert prov.data_hash is not None
    assert len(prov.data_hash) == 64
    assert prov.record_count == 100
    assert prov.data_recovery_pct is not None


@pytest.mark.asyncio
async def test_record_provenance_with_column_ids(db_session, dataset, analysis_result):
    from app.ai.provenance import record_provenance
    col_ids = [uuid4(), uuid4()]
    prov = await record_provenance(
        db_session,
        analysis_result_id=analysis_result.id,
        dataset_id=dataset.id,
        column_ids=col_ids,
    )
    assert prov.column_ids == col_ids


# ── get_provenance_for_result ──────────────────────────────────────

@pytest.mark.asyncio
async def test_get_provenance_for_result(db_session, dataset, analysis_result):
    from app.ai.provenance import record_provenance, get_provenance_for_result
    await record_provenance(
        db_session,
        analysis_result_id=analysis_result.id,
        dataset_id=dataset.id,
    )
    found = await get_provenance_for_result(db_session, analysis_result.id)
    assert found is not None
    assert found.analysis_result_id == analysis_result.id


@pytest.mark.asyncio
async def test_get_provenance_for_result_not_found(db_session):
    from app.ai.provenance import get_provenance_for_result
    found = await get_provenance_for_result(db_session, uuid4())
    assert found is None


# ── verify_provenance ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_provenance_not_found(db_session):
    from app.ai.provenance import verify_provenance
    result = await verify_provenance(db_session, uuid4())
    assert result["valid"] is False
    assert "not found" in result["reason"].lower()


@pytest.mark.asyncio
async def test_verify_provenance_no_hash(db_session, dataset, analysis_result):
    from app.ai.provenance import record_provenance, verify_provenance
    prov = await record_provenance(
        db_session,
        analysis_result_id=analysis_result.id,
        dataset_id=dataset.id,
    )
    result = await verify_provenance(db_session, prov.id)
    assert result["valid"] is True
    assert "no data hash" in result["reason"].lower()


# ── diff_provenance ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_diff_identical_provenance(db_session, dataset, analysis_result):
    from app.ai.provenance import record_provenance, diff_provenance
    df = _sample_df()
    prov1 = await record_provenance(db_session, analysis_result_id=analysis_result.id, dataset_id=dataset.id, data_frame=df, parameters={"x": 1})

    ar2 = AnalysisResult(dataset_id=dataset.id, analysis_type="weibull", parameters={"x": 1}, results={"k": 2.1})
    db_session.add(ar2)
    await db_session.flush()

    prov2 = await record_provenance(db_session, analysis_result_id=ar2.id, dataset_id=dataset.id, data_frame=df, parameters={"x": 1})

    diff = await diff_provenance(db_session, prov1.id, prov2.id)
    assert diff["same_dataset"] is True
    assert diff["data_unchanged"] is True
    assert diff["parameters_unchanged"] is True
    assert diff["change_count"] == 0


@pytest.mark.asyncio
async def test_diff_different_data(db_session, dataset, analysis_result):
    from app.ai.provenance import record_provenance, diff_provenance
    df1 = _sample_df()
    df2 = _sample_df()
    df2.iloc[0, 0] = 999.0

    prov1 = await record_provenance(db_session, analysis_result_id=analysis_result.id, dataset_id=dataset.id, data_frame=df1)

    ar2 = AnalysisResult(dataset_id=dataset.id, analysis_type="weibull", parameters={}, results={})
    db_session.add(ar2)
    await db_session.flush()

    prov2 = await record_provenance(db_session, analysis_result_id=ar2.id, dataset_id=dataset.id, data_frame=df2)

    diff = await diff_provenance(db_session, prov1.id, prov2.id)
    assert diff["data_unchanged"] is False


@pytest.mark.asyncio
async def test_diff_not_found(db_session):
    from app.ai.provenance import diff_provenance
    diff = await diff_provenance(db_session, uuid4(), uuid4())
    assert "error" in diff


# ── store_result_with_provenance ────────────────────────────────────

@pytest.mark.asyncio
async def test_store_result_with_provenance(db_session, dataset):
    from app.ai.provenance import store_result_with_provenance
    df = _sample_df()
    ar, prov = await store_result_with_provenance(
        db_session,
        dataset_id=dataset.id,
        analysis_type="weibull",
        parameters={"column": "Speed_80m"},
        results={"k": 2.0, "A": 7.0},
        data_frame=df,
    )
    assert ar.id is not None
    assert prov.analysis_result_id == ar.id
    assert prov.data_hash is not None
