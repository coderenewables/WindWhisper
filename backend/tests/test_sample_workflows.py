"""Comprehensive end-to-end workflow tests.

Each test uses the actual sample data files in data/ and exercises
the workflow engine by chaining multiple steps through the API.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Flag, FlaggedRange, Project, TimeseriesData, Workflow

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
SAMPLE_CSV = DATA_DIR / "sample_met_tower.csv"
SAMPLE_NRG = DATA_DIR / "sample_nrg.txt"
SAMPLE_CAMPBELL = DATA_DIR / "sample_campbell.dat"
SAMPLE_REANALYSIS = DATA_DIR / "sample_reanalysis_era5.csv"
SAMPLE_SEMICOLON = DATA_DIR / "sample_semicolon.csv"
SAMPLE_TAB = DATA_DIR / "sample_tab_delimited.txt"
SAMPLE_POWER_CURVE = DATA_DIR / "sample_power_curve.csv"


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


async def _create_project(client: AsyncClient, name: str = "Test Site") -> str:
    resp = await client.post("/api/projects", json={"name": name, "latitude": 35.123, "longitude": -101.456, "elevation": 1420.0})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _import_via_workflow(client: AsyncClient, project_id: str, file_path: Path, dataset_name: str) -> dict:
    """Import a file through the workflow engine and return the run result."""
    create = await client.post(
        f"/api/workflows/projects/{project_id}",
        json={
            "name": f"Import {dataset_name}",
            "steps": [{"order": 1, "step_type": "import_file", "params": {"file_path": str(file_path), "dataset_name": dataset_name}}],
        },
    )
    assert create.status_code == 201
    run = await client.post(f"/api/workflows/{create.json()['id']}/run")
    assert run.status_code == 200
    payload = run.json()
    assert payload["status"] == "completed", payload
    return payload


async def _import_csv_dataset(client: AsyncClient, project_id: str) -> str:
    """Import the main CSV and return dataset_id."""
    result = await _import_via_workflow(client, project_id, SAMPLE_CSV, "Met Tower CSV")
    return result["step_results"][0]["details"]["dataset_id"]


async def _import_reanalysis_dataset(client: AsyncClient, project_id: str) -> str:
    """Import the reanalysis reference CSV and return dataset_id."""
    result = await _import_via_workflow(client, project_id, SAMPLE_REANALYSIS, "ERA5 Reference")
    return result["step_results"][0]["details"]["dataset_id"]


async def _get_columns(client: AsyncClient, dataset_id: str) -> dict[str, dict]:
    """Fetch dataset columns keyed by name via dataset detail."""
    resp = await client.get(f"/api/datasets/{dataset_id}")
    assert resp.status_code == 200
    return {c["name"]: c for c in resp.json()["columns"]}


async def _upload_power_curve(client: AsyncClient) -> str:
    """Upload the sample power curve and return its id."""
    resp = await client.post(
        "/api/analysis/power-curve/upload",
        files={"file": (SAMPLE_POWER_CURVE.name, SAMPLE_POWER_CURVE.read_bytes(), "text/csv")},
    )
    assert resp.status_code == 200
    return resp.json()["id"]


# ------------------------------------------------------------------
# 1. Multi-format import workflows
# ------------------------------------------------------------------


async def test_import_csv_workflow(client: AsyncClient, db_session: AsyncSession) -> None:
    """Import the 3-year met tower CSV via workflow and verify dataset."""
    project_id = await _create_project(client, "CSV Import Site")
    result = await _import_via_workflow(client, project_id, SAMPLE_CSV, "Met Tower CSV")

    details = result["step_results"][0]["details"]
    assert details["parser_type"] == "csv"
    assert details["row_count"] >= 100_000
    assert details["column_count"] >= 12

    dataset_count = await db_session.scalar(select(func.count(Dataset.id)).where(Dataset.project_id == project_id))
    assert dataset_count == 1


async def test_import_nrg_workflow(client: AsyncClient, db_session: AsyncSession) -> None:
    """Import the NRG logger file via workflow."""
    project_id = await _create_project(client, "NRG Import Site")
    result = await _import_via_workflow(client, project_id, SAMPLE_NRG, "NRG Tower")

    details = result["step_results"][0]["details"]
    assert details["parser_type"] == "nrg"
    assert details["row_count"] >= 100_000


async def test_import_campbell_workflow(client: AsyncClient, db_session: AsyncSession) -> None:
    """Import the Campbell Scientific file via workflow."""
    project_id = await _create_project(client, "Campbell Import Site")
    result = await _import_via_workflow(client, project_id, SAMPLE_CAMPBELL, "Campbell Tower")

    details = result["step_results"][0]["details"]
    assert details["parser_type"] == "campbell"
    assert details["row_count"] >= 100_000


async def test_import_reanalysis_workflow(client: AsyncClient, db_session: AsyncSession) -> None:
    """Import the 10-year ERA5 reanalysis reference CSV via workflow."""
    project_id = await _create_project(client, "Reanalysis Import Site")
    result = await _import_via_workflow(client, project_id, SAMPLE_REANALYSIS, "ERA5 Reference")

    details = result["step_results"][0]["details"]
    assert details["parser_type"] == "csv"
    assert details["row_count"] >= 80_000


async def test_import_semicolon_csv_workflow(client: AsyncClient) -> None:
    """Import semicolon-delimited CSV."""
    project_id = await _create_project(client, "Semicolon Site")
    result = await _import_via_workflow(client, project_id, SAMPLE_SEMICOLON, "Semicolon Data")
    assert result["step_results"][0]["details"]["row_count"] == 200


async def test_import_tab_delimited_workflow(client: AsyncClient) -> None:
    """Import tab-delimited text."""
    project_id = await _create_project(client, "Tab Site")
    result = await _import_via_workflow(client, project_id, SAMPLE_TAB, "Tab Data")
    assert result["step_results"][0]["details"]["row_count"] == 200


# ------------------------------------------------------------------
# 2. Import → QC → Analysis chain
# ------------------------------------------------------------------


async def test_import_then_qc_rules_workflow(client: AsyncClient, db_session: AsyncSession) -> None:
    """Import data, create a QC flag with a rule, apply via workflow."""
    project_id = await _create_project(client, "QC Chain Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)
    speed_col_id = columns["Speed_80m"]["id"]

    # Create a flag + rule via API
    flag_resp = await client.post(f"/api/qc/flags/{dataset_id}", json={"name": "High wind", "color": "#ef4444"})
    assert flag_resp.status_code == 201
    flag_id = flag_resp.json()["id"]

    rule_resp = await client.post(
        f"/api/qc/flags/{flag_id}/rules",
        json={"column_id": speed_col_id, "operator": ">", "value": 15.0},
    )
    assert rule_resp.status_code == 201

    # Apply rules via workflow
    create = await client.post(
        f"/api/workflows/projects/{project_id}",
        json={
            "name": "Apply QC",
            "steps": [{"order": 1, "step_type": "apply_qc_rules", "params": {"dataset_id": dataset_id, "flag_ids": [flag_id]}}],
        },
    )
    assert create.status_code == 201
    run = await client.post(f"/api/workflows/{create.json()['id']}/run")
    assert run.status_code == 200
    payload = run.json()
    assert payload["status"] == "completed"
    details = payload["step_results"][0]["details"]
    assert details["flag_count"] == 1

    # Verify flagged ranges exist
    ranges_resp = await client.get(f"/api/qc/datasets/{dataset_id}/flagged-ranges")
    assert ranges_resp.status_code == 200
    assert len(ranges_resp.json()) >= 1


async def test_wind_rose_analysis_on_imported_data(client: AsyncClient) -> None:
    """Import data then run a wind rose analysis."""
    project_id = await _create_project(client, "Wind Rose Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/analysis/wind-rose/{dataset_id}",
        json={
            "direction_column_id": columns["Dir_80m"]["id"],
            "value_column_id": columns["Speed_80m"]["id"],
            "num_sectors": 12,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["sectors"]) == 12
    assert data["total_count"] > 100_000


async def test_histogram_analysis_on_imported_data(client: AsyncClient) -> None:
    """Import data then run a histogram analysis."""
    project_id = await _create_project(client, "Histogram Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/analysis/histogram/{dataset_id}",
        json={"column_id": columns["Speed_80m"]["id"], "bin_width": 1.0},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["bins"]) >= 10
    assert data["stats"]["count"] > 100_000


async def test_weibull_mle_and_moments_on_imported_data(client: AsyncClient) -> None:
    """Weibull fit with both MLE and moments method."""
    project_id = await _create_project(client, "Weibull Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    for method in ("mle", "moments"):
        resp = await client.post(
            f"/api/analysis/weibull/{dataset_id}",
            json={"column_id": columns["Speed_80m"]["id"], "method": method, "bin_width": 1.0},
        )
        assert resp.status_code == 200
        data = resp.json()
        fit = data["fit"]
        assert 1.0 < fit["k"] < 5.0  # shape parameter
        assert 3.0 < fit["A"] < 20.0  # scale parameter
        assert fit["r_squared"] > 0.85


# ------------------------------------------------------------------
# 3. Wind shear & extrapolation
# ------------------------------------------------------------------


async def test_shear_power_and_log_on_imported_data(client: AsyncClient) -> None:
    """Wind shear calculation using both power and log law."""
    project_id = await _create_project(client, "Shear Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)
    speed_ids = [columns[f"Speed_{h}m"]["id"] for h in (40, 60, 80)]

    for method in ("power", "log"):
        resp = await client.post(
            f"/api/analysis/shear/{dataset_id}",
            json={"speed_column_ids": speed_ids, "method": method, "target_height": 100.0},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["pair_stats"]) >= 3  # C(3,2) = 3 pairs


async def test_extrapolate_to_hub_height_and_create_column(client: AsyncClient, db_session: AsyncSession) -> None:
    """Extrapolate to 100m hub height and persist a new column in the dataset."""
    project_id = await _create_project(client, "Extrapolation Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)
    speed_ids = [columns[f"Speed_{h}m"]["id"] for h in (40, 60, 80)]

    resp = await client.post(
        f"/api/analysis/extrapolate/{dataset_id}",
        json={
            "speed_column_ids": speed_ids,
            "method": "power",
            "target_height": 100.0,
            "create_column": True,
            "column_name": "Speed_100m_power",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created_column"] is not None
    assert data["created_column"]["name"] == "Speed_100m_power"


async def test_shear_extrapolation_via_workflow(client: AsyncClient) -> None:
    """Calculate shear via workflow step and create an extrapolated column."""
    project_id = await _create_project(client, "Workflow Shear Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)
    speed_ids = [columns[f"Speed_{h}m"]["id"] for h in (40, 60, 80)]

    create = await client.post(
        f"/api/workflows/projects/{project_id}",
        json={
            "name": "Shear workflow",
            "steps": [
                {
                    "order": 1,
                    "step_type": "calculate_shear",
                    "params": {
                        "dataset_id": dataset_id,
                        "speed_column_ids": speed_ids,
                        "target_height": 100.0,
                        "method": "power",
                        "create_column": True,
                        "column_name": "Speed_100m_wf",
                    },
                },
            ],
        },
    )
    assert create.status_code == 201
    run = await client.post(f"/api/workflows/{create.json()['id']}/run")
    assert run.status_code == 200
    payload = run.json()
    assert payload["status"] == "completed"
    details = payload["step_results"][0]["details"]
    assert details["created_column"] is not None
    assert details["summary"]["count"] > 100_000


# ------------------------------------------------------------------
# 4. Turbulence intensity
# ------------------------------------------------------------------


async def test_turbulence_analysis_on_imported_data(client: AsyncClient) -> None:
    """Turbulence intensity analysis with IEC classification."""
    project_id = await _create_project(client, "Turbulence Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/analysis/turbulence/{dataset_id}",
        json={
            "speed_column_id": columns["Speed_80m"]["id"],
            "sd_column_id": columns["Speed_SD_80m"]["id"],
            "direction_column_id": columns["Dir_80m"]["id"],
            "bin_width": 1.0,
            "num_sectors": 12,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert 0.0 < data["summary"]["mean_ti"] < 0.5
    assert data["summary"]["iec_class"] is not None
    assert "IEC" in data["summary"]["iec_class"] or data["summary"]["iec_class"] in ("A", "B", "C", "A+")
    assert len(data["speed_bins"]) >= 10
    assert len(data["direction_bins"]) == 12


# ------------------------------------------------------------------
# 5. Air density
# ------------------------------------------------------------------


async def test_air_density_measured_pressure(client: AsyncClient) -> None:
    """Air density with measured temperature and pressure."""
    project_id = await _create_project(client, "Air Density Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/analysis/air-density/{dataset_id}",
        json={
            "temperature_column_id": columns["Temp_2m"]["id"],
            "speed_column_id": columns["Speed_80m"]["id"],
            "pressure_column_id": columns["Pressure_hPa"]["id"],
            "pressure_source": "measured",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert 0.9 < data["summary"]["mean_density"] < 1.4
    assert data["summary"]["mean_wind_power_density"] is not None
    assert data["summary"]["mean_wind_power_density"] > 0


async def test_air_density_estimated_pressure(client: AsyncClient) -> None:
    """Air density with elevation-based pressure estimation."""
    project_id = await _create_project(client, "Air Density Estimated Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/analysis/air-density/{dataset_id}",
        json={
            "temperature_column_id": columns["Temp_2m"]["id"],
            "speed_column_id": columns["Speed_80m"]["id"],
            "pressure_source": "estimated",
            "elevation_m": 1420.0,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert 0.8 < data["summary"]["mean_density"] < 1.3


# ------------------------------------------------------------------
# 6. Extreme wind analysis (needs multi-year data)
# ------------------------------------------------------------------


async def test_extreme_wind_with_gust_column(client: AsyncClient) -> None:
    """Extreme wind Gumbel analysis on 3-year data with gust column."""
    project_id = await _create_project(client, "Extreme Wind Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/analysis/extreme-wind/{dataset_id}",
        json={
            "speed_column_id": columns["Speed_80m"]["id"],
            "gust_column_id": columns["Gust_80m"]["id"],
            "return_periods": [10, 20, 50, 100],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["return_periods"]) == 4
    assert data["return_periods"][0]["return_period_years"] == 10
    assert data["return_periods"][0]["speed"] > 0
    # Ve50 should be larger than Ve10
    assert data["return_periods"][2]["speed"] > data["return_periods"][0]["speed"]
    assert data["summary"]["gust_factor"] is not None
    assert data["summary"]["gust_factor"] > 1.0
    assert len(data["annual_maxima"]) >= 2  # 3 years of data


# ------------------------------------------------------------------
# 7. Energy estimate
# ------------------------------------------------------------------


async def test_energy_estimate_basic(client: AsyncClient) -> None:
    """Gross energy estimate using uploaded power curve."""
    project_id = await _create_project(client, "Energy Estimate Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    # Read power curve points
    import csv as csv_mod

    pc_points = []
    with open(SAMPLE_POWER_CURVE) as f:
        for row in csv_mod.DictReader(f):
            pc_points.append({"wind_speed_ms": float(row["wind_speed_ms"]), "power_kw": float(row["power_kw"])})

    resp = await client.post(
        f"/api/analysis/energy-estimate/{dataset_id}",
        json={
            "speed_column_id": columns["Speed_80m"]["id"],
            "power_curve_points": pc_points,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["annual_energy_mwh"] > 0
    assert data["summary"]["capacity_factor_pct"] > 0
    assert data["summary"]["equivalent_full_load_hours"] > 0
    assert len(data["monthly"]) == 12
    assert len(data["speed_bins"]) >= 10


async def test_energy_estimate_density_adjusted(client: AsyncClient) -> None:
    """Energy estimate with air density adjustment."""
    project_id = await _create_project(client, "Energy Density Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    import csv as csv_mod

    pc_points = []
    with open(SAMPLE_POWER_CURVE) as f:
        for row in csv_mod.DictReader(f):
            pc_points.append({"wind_speed_ms": float(row["wind_speed_ms"]), "power_kw": float(row["power_kw"])})

    resp = await client.post(
        f"/api/analysis/energy-estimate/{dataset_id}",
        json={
            "speed_column_id": columns["Speed_80m"]["id"],
            "power_curve_points": pc_points,
            "air_density_adjustment": True,
            "temperature_column_id": columns["Temp_2m"]["id"],
            "pressure_column_id": columns["Pressure_hPa"]["id"],
            "pressure_source": "measured",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["annual_energy_mwh"] > 0


# ------------------------------------------------------------------
# 8. Profiles (diurnal, monthly, heatmap, yearly overlays)
# ------------------------------------------------------------------


async def test_profiles_analysis(client: AsyncClient) -> None:
    """Profiles with yearly overlays on multi-year data."""
    project_id = await _create_project(client, "Profiles Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/analysis/profiles/{dataset_id}",
        json={
            "column_id": columns["Speed_80m"]["id"],
            "include_yearly_overlays": True,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["diurnal"]) == 24
    assert len(data["monthly"]) == 12
    assert len(data["heatmap"]) == 12 * 24  # 12 months × 24 hours
    assert len(data["diurnal_by_year"]) >= 2  # at least 2 years
    assert len(data["years_available"]) >= 2


# ------------------------------------------------------------------
# 9. MCP (import site + reference then correlate/predict)
# ------------------------------------------------------------------


async def test_mcp_correlate_with_sample_data(client: AsyncClient) -> None:
    """Import site + reanalysis and run MCP correlation."""
    project_id = await _create_project(client, "MCP Correlate Site")
    site_dataset_id = await _import_csv_dataset(client, project_id)
    ref_dataset_id = await _import_reanalysis_dataset(client, project_id)

    site_cols = await _get_columns(client, site_dataset_id)
    ref_cols = await _get_columns(client, ref_dataset_id)

    resp = await client.post(
        "/api/mcp/correlate",
        json={
            "site_dataset_id": site_dataset_id,
            "site_column_id": site_cols["Speed_80m"]["id"],
            "ref_dataset_id": ref_dataset_id,
            "ref_column_id": ref_cols["Ref_Speed_100m"]["id"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "r_squared" in data["stats"]
    assert data["stats"]["r_squared"] > 0.0
    assert data["stats"]["sample_count"] > 1000


async def test_mcp_predict_linear(client: AsyncClient) -> None:
    """MCP prediction using linear method."""
    project_id = await _create_project(client, "MCP Predict Site")
    site_dataset_id = await _import_csv_dataset(client, project_id)
    ref_dataset_id = await _import_reanalysis_dataset(client, project_id)

    site_cols = await _get_columns(client, site_dataset_id)
    ref_cols = await _get_columns(client, ref_dataset_id)

    resp = await client.post(
        "/api/mcp/predict",
        json={
            "site_dataset_id": site_dataset_id,
            "site_column_id": site_cols["Speed_80m"]["id"],
            "ref_dataset_id": ref_dataset_id,
            "ref_column_id": ref_cols["Ref_Speed_100m"]["id"],
            "method": "linear",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "summary" in data
    assert data["summary"]["long_term_mean_speed"] > 0


async def test_mcp_predict_variance_ratio(client: AsyncClient) -> None:
    """MCP prediction using variance ratio method."""
    project_id = await _create_project(client, "MCP VR Site")
    site_dataset_id = await _import_csv_dataset(client, project_id)
    ref_dataset_id = await _import_reanalysis_dataset(client, project_id)

    site_cols = await _get_columns(client, site_dataset_id)
    ref_cols = await _get_columns(client, ref_dataset_id)

    resp = await client.post(
        "/api/mcp/predict",
        json={
            "site_dataset_id": site_dataset_id,
            "site_column_id": site_cols["Speed_80m"]["id"],
            "ref_dataset_id": ref_dataset_id,
            "ref_column_id": ref_cols["Ref_Speed_100m"]["id"],
            "method": "variance_ratio",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["long_term_mean_speed"] > 0


async def test_mcp_compare_methods(client: AsyncClient) -> None:
    """Compare MCP methods."""
    project_id = await _create_project(client, "MCP Compare Site")
    site_dataset_id = await _import_csv_dataset(client, project_id)
    ref_dataset_id = await _import_reanalysis_dataset(client, project_id)

    site_cols = await _get_columns(client, site_dataset_id)
    ref_cols = await _get_columns(client, ref_dataset_id)

    resp = await client.post(
        "/api/mcp/compare",
        json={
            "site_dataset_id": site_dataset_id,
            "site_column_id": site_cols["Speed_80m"]["id"],
            "ref_dataset_id": ref_dataset_id,
            "ref_column_id": ref_cols["Ref_Speed_100m"]["id"],
            "methods": ["linear", "variance_ratio"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["results"]) == 2


async def test_mcp_via_workflow(client: AsyncClient) -> None:
    """Run MCP prediction as a workflow step."""
    project_id = await _create_project(client, "MCP Workflow Site")
    site_dataset_id = await _import_csv_dataset(client, project_id)
    ref_dataset_id = await _import_reanalysis_dataset(client, project_id)

    site_cols = await _get_columns(client, site_dataset_id)
    ref_cols = await _get_columns(client, ref_dataset_id)

    create = await client.post(
        f"/api/workflows/projects/{project_id}",
        json={
            "name": "MCP workflow",
            "steps": [
                {
                    "order": 1,
                    "step_type": "run_mcp",
                    "params": {
                        "site_dataset_id": site_dataset_id,
                        "site_column_id": site_cols["Speed_80m"]["id"],
                        "ref_dataset_id": ref_dataset_id,
                        "ref_column_id": ref_cols["Ref_Speed_100m"]["id"],
                        "method": "linear",
                    },
                },
            ],
        },
    )
    assert create.status_code == 201
    run = await client.post(f"/api/workflows/{create.json()['id']}/run")
    assert run.status_code == 200
    payload = run.json()
    assert payload["status"] == "completed"
    details = payload["step_results"][0]["details"]
    assert details["method"] == "linear"
    assert details["summary"]["long_term_mean_speed"] > 0


# ------------------------------------------------------------------
# 10. Gap reconstruction
# ------------------------------------------------------------------


async def test_gap_reconstruction_interpolation(client: AsyncClient) -> None:
    """Reconstruct gaps using linear interpolation."""
    project_id = await _create_project(client, "Reconstruction Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/qc/reconstruct/{dataset_id}",
        json={
            "column_id": columns["Speed_80m"]["id"],
            "method": "interpolation",
            "max_gap_hours": 6,
            "save_mode": "preview",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["gap_count"] >= 0
    assert data["summary"]["filled_count"] >= 0


async def test_gap_reconstruction_via_workflow(client: AsyncClient) -> None:
    """Reconstruct gaps via workflow step."""
    project_id = await _create_project(client, "Reconstruct WF Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    create = await client.post(
        f"/api/workflows/projects/{project_id}",
        json={
            "name": "Reconstruct workflow",
            "steps": [
                {
                    "order": 1,
                    "step_type": "reconstruct_gaps",
                    "params": {
                        "dataset_id": dataset_id,
                        "column_id": columns["Speed_80m"]["id"],
                        "method": "interpolation",
                        "max_gap_hours": 6,
                        "save_mode": "preview",
                    },
                },
            ],
        },
    )
    assert create.status_code == 201
    run = await client.post(f"/api/workflows/{create.json()['id']}/run")
    assert run.status_code == 200
    assert run.json()["status"] == "completed"


# ------------------------------------------------------------------
# 11. Export workflows
# ------------------------------------------------------------------


async def test_csv_export_on_imported_data(client: AsyncClient) -> None:
    """Export imported data to CSV."""
    project_id = await _create_project(client, "CSV Export Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/export/csv/{dataset_id}",
        json={
            "column_ids": [columns["Speed_80m"]["id"]],
            "resample": "1h",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    lines = resp.text.strip().splitlines()
    assert lines[0] == "timestamp,Speed_80m"
    assert len(lines) >= 1000


async def test_wasp_tab_export_on_imported_data(client: AsyncClient) -> None:
    """Export imported data to WAsP TAB format."""
    project_id = await _create_project(client, "WAsP Export Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/export/wasp-tab/{dataset_id}",
        json={
            "speed_column_id": columns["Speed_80m"]["id"],
            "direction_column_id": columns["Dir_80m"]["id"],
            "num_sectors": 12,
        },
    )
    assert resp.status_code == 200


async def test_export_via_workflow(client: AsyncClient) -> None:
    """Export via workflow step."""
    project_id = await _create_project(client, "Export WF Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    create = await client.post(
        f"/api/workflows/projects/{project_id}",
        json={
            "name": "Export workflow",
            "steps": [
                {
                    "order": 1,
                    "step_type": "export_data",
                    "params": {
                        "dataset_id": dataset_id,
                        "format": "csv",
                        "column_ids": [columns["Speed_80m"]["id"]],
                        "resample": "1h",
                    },
                },
            ],
        },
    )
    assert create.status_code == 201
    run = await client.post(f"/api/workflows/{create.json()['id']}/run")
    assert run.status_code == 200
    assert run.json()["status"] == "completed"


# ------------------------------------------------------------------
# 12. Report generation
# ------------------------------------------------------------------


async def test_report_generation_via_workflow(client: AsyncClient) -> None:
    """Generate a PDF report via workflow."""
    project_id = await _create_project(client, "Report WF Site")
    dataset_id = await _import_csv_dataset(client, project_id)

    create = await client.post(
        f"/api/workflows/projects/{project_id}",
        json={
            "name": "Report workflow",
            "steps": [
                {
                    "order": 1,
                    "step_type": "generate_report",
                    "params": {
                        "dataset_id": dataset_id,
                        "format": "pdf",
                        "sections": ["data_summary", "wind_rose", "frequency_distribution", "wind_shear"],
                    },
                },
            ],
        },
    )
    assert create.status_code == 201
    run = await client.post(f"/api/workflows/{create.json()['id']}/run")
    assert run.status_code == 200
    payload = run.json()
    assert payload["status"] == "completed"
    details = payload["step_results"][0]["details"]
    assert details["file_name"].endswith(".pdf")
    assert details["size_bytes"] > 0


# ------------------------------------------------------------------
# 13. Multi-step chained workflow: Import → QC → Shear → Export
# ------------------------------------------------------------------


async def test_full_chain_import_qc_shear_export_workflow(client: AsyncClient, db_session: AsyncSession) -> None:
    """Complete end-to-end multi-step workflow."""
    project_id = await _create_project(client, "Full Chain Site")

    # Step 1: import
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)
    speed_ids = [columns[f"Speed_{h}m"]["id"] for h in (40, 60, 80)]

    # Create a QC flag with rule
    flag_resp = await client.post(f"/api/qc/flags/{dataset_id}", json={"name": "Low wind", "color": "#3b82f6"})
    flag_id = flag_resp.json()["id"]
    await client.post(f"/api/qc/flags/{flag_id}/rules", json={"column_id": columns["Speed_80m"]["id"], "operator": "<", "value": 1.0})

    # Steps 2-4: QC → Shear → Export in one workflow
    create = await client.post(
        f"/api/workflows/projects/{project_id}",
        json={
            "name": "Full analysis chain",
            "steps": [
                {
                    "order": 1,
                    "step_type": "apply_qc_rules",
                    "params": {"dataset_id": dataset_id, "flag_ids": [flag_id]},
                },
                {
                    "order": 2,
                    "step_type": "calculate_shear",
                    "params": {
                        "dataset_id": dataset_id,
                        "speed_column_ids": speed_ids,
                        "target_height": 100.0,
                        "method": "power",
                        "create_column": True,
                        "column_name": "Speed_100m_chain",
                    },
                },
                {
                    "order": 3,
                    "step_type": "export_data",
                    "params": {
                        "dataset_id": dataset_id,
                        "format": "csv",
                        "column_ids": speed_ids,
                        "resample": "1h",
                    },
                },
            ],
        },
    )
    assert create.status_code == 201
    run = await client.post(f"/api/workflows/{create.json()['id']}/run")
    assert run.status_code == 200
    payload = run.json()
    assert payload["status"] == "completed"
    assert len(payload["step_results"]) == 3
    for step_result in payload["step_results"]:
        assert step_result["status"] == "completed"


# ------------------------------------------------------------------
# 14. Scatter analysis
# ------------------------------------------------------------------


async def test_scatter_analysis(client: AsyncClient) -> None:
    """Scatter plot of speed vs direction."""
    project_id = await _create_project(client, "Scatter Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    resp = await client.post(
        f"/api/analysis/scatter/{dataset_id}",
        json={
            "x_column_id": columns["Speed_80m"]["id"],
            "y_column_id": columns["Speed_40m"]["id"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["points"]) > 0
    assert data["total_count"] > 10_000


# ------------------------------------------------------------------
# 15. Power curve upload & library
# ------------------------------------------------------------------


async def test_power_curve_upload_and_energy_estimate(client: AsyncClient) -> None:
    """Upload a power curve file, then use it for energy estimation."""
    project_id = await _create_project(client, "Power Curve Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    # Upload power curve
    pc_resp = await client.post(
        "/api/analysis/power-curve/upload",
        files={"file": (SAMPLE_POWER_CURVE.name, SAMPLE_POWER_CURVE.read_bytes(), "text/csv")},
    )
    assert pc_resp.status_code == 200
    pc_data = pc_resp.json()
    assert len(pc_data["points"]) >= 40

    # Use those points for energy estimate
    resp = await client.post(
        f"/api/analysis/energy-estimate/{dataset_id}",
        json={
            "speed_column_id": columns["Speed_80m"]["id"],
            "power_curve_points": pc_data["points"],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["summary"]["annual_energy_mwh"] > 0


# ------------------------------------------------------------------
# 16. Workflow CRUD
# ------------------------------------------------------------------


async def test_workflow_crud(client: AsyncClient) -> None:
    """Create, get, list, update, delete workflows."""
    project_id = await _create_project(client, "CRUD Site")
    dataset_id = await _import_csv_dataset(client, project_id)
    columns = await _get_columns(client, dataset_id)

    # Create
    create_resp = await client.post(
        f"/api/workflows/projects/{project_id}",
        json={
            "name": "Test CRUD workflow",
            "steps": [
                {"order": 1, "step_type": "export_data", "params": {"dataset_id": dataset_id, "format": "csv", "column_ids": [columns["Speed_80m"]["id"]]}},
            ],
        },
    )
    assert create_resp.status_code == 201
    workflow_id = create_resp.json()["id"]

    # Get
    get_resp = await client.get(f"/api/workflows/{workflow_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Test CRUD workflow"

    # List
    list_resp = await client.get(f"/api/workflows/projects/{project_id}")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 2  # import workflow + this one

    # Update
    update_resp = await client.put(
        f"/api/workflows/{workflow_id}",
        json={"name": "Updated workflow"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Updated workflow"

    # Delete
    delete_resp = await client.delete(f"/api/workflows/{workflow_id}")
    assert delete_resp.status_code == 204


# ------------------------------------------------------------------
# 17. Workflow error handling
# ------------------------------------------------------------------


async def test_workflow_step_failure_halts_execution(client: AsyncClient) -> None:
    """A failing step should stop the workflow and mark it failed."""
    project_id = await _create_project(client, "Failure Site")

    create = await client.post(
        f"/api/workflows/projects/{project_id}",
        json={
            "name": "Failing workflow",
            "steps": [
                {
                    "order": 1,
                    "step_type": "import_file",
                    "params": {"file_path": "/nonexistent/path.csv", "dataset_name": "Ghost"},
                },
                {
                    "order": 2,
                    "step_type": "export_data",
                    "params": {"dataset_id": "00000000-0000-0000-0000-000000000001", "format": "csv", "column_ids": []},
                },
            ],
        },
    )
    assert create.status_code == 201
    run = await client.post(f"/api/workflows/{create.json()['id']}/run")
    assert run.status_code == 200
    payload = run.json()
    assert payload["status"] == "failed"
    assert len(payload["step_results"]) == 1  # stopped after first failure
    assert payload["step_results"][0]["status"] == "failed"
