from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Project, TimeseriesData


async def _seed_mcp_datasets(db_session: AsyncSession) -> tuple[Dataset, DataColumn, Dataset, DataColumn, np.ndarray]:
    project = Project(name="MCP Project")
    db_session.add(project)
    await db_session.flush()

    start_time = datetime(2025, 1, 31, 0, 0, tzinfo=UTC)
    reference_values = np.linspace(4.0, 12.0, 72, dtype=float)
    concurrent_reference = reference_values[:48]
    site_values = (1.2 * concurrent_reference) + 0.5

    site_dataset = Dataset(
        project_id=project.id,
        name="Site Mast",
        source_type="mast",
        time_step_seconds=3600,
        start_time=start_time,
        end_time=start_time + timedelta(hours=47),
    )
    reference_dataset = Dataset(
        project_id=project.id,
        name="Reference Reanalysis",
        source_type="reanalysis",
        time_step_seconds=3600,
        start_time=start_time,
        end_time=start_time + timedelta(hours=71),
    )
    db_session.add_all([site_dataset, reference_dataset])
    await db_session.flush()

    site_column = DataColumn(dataset_id=site_dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    reference_column = DataColumn(dataset_id=reference_dataset.id, name="Ref_100m", measurement_type="speed", height_m=100)
    db_session.add_all([site_column, reference_column])
    await db_session.flush()

    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=site_dataset.id,
                timestamp=start_time + timedelta(hours=index),
                values_json={"Speed_80m": float(value)},
            )
            for index, value in enumerate(site_values)
        ],
    )
    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=reference_dataset.id,
                timestamp=start_time + timedelta(hours=index),
                values_json={"Ref_100m": float(value)},
            )
            for index, value in enumerate(reference_values)
        ],
    )
    await db_session.commit()

    return site_dataset, site_column, reference_dataset, reference_column, reference_values


async def _seed_matrix_mcp_datasets(
    db_session: AsyncSession,
) -> tuple[Dataset, dict[str, DataColumn], Dataset, dict[str, DataColumn], np.ndarray, np.ndarray]:
    project = Project(name="Matrix MCP Project")
    db_session.add(project)
    await db_session.flush()

    start_time = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
    sample_count = 120
    index = np.arange(sample_count, dtype=float)
    ref_primary_values = 6.0 + (0.04 * index) + np.sin(index / 4.0)
    ref_secondary_values = 2.5 + (0.03 * index) + np.cos(index / 5.0)

    concurrent_ref_primary = ref_primary_values[:90]
    concurrent_ref_secondary = ref_secondary_values[:90]
    site_primary_values = (0.7 * concurrent_ref_primary) + (0.3 * concurrent_ref_secondary) + 0.4
    site_secondary_values = (0.5 * concurrent_ref_primary) + (0.5 * concurrent_ref_secondary) + 0.2

    site_dataset = Dataset(
        project_id=project.id,
        name="Matrix Site Mast",
        source_type="mast",
        time_step_seconds=86400,
        start_time=start_time,
        end_time=start_time + timedelta(days=89),
    )
    reference_dataset = Dataset(
        project_id=project.id,
        name="Matrix Reference Dataset",
        source_type="reanalysis",
        time_step_seconds=86400,
        start_time=start_time,
        end_time=start_time + timedelta(days=119),
    )
    db_session.add_all([site_dataset, reference_dataset])
    await db_session.flush()

    site_columns = {
        "Speed_80m": DataColumn(dataset_id=site_dataset.id, name="Speed_80m", measurement_type="speed", height_m=80),
        "Speed_100m": DataColumn(dataset_id=site_dataset.id, name="Speed_100m", measurement_type="speed", height_m=100),
    }
    ref_columns = {
        "Ref_100m": DataColumn(dataset_id=reference_dataset.id, name="Ref_100m", measurement_type="speed", height_m=100),
        "Ref_120m": DataColumn(dataset_id=reference_dataset.id, name="Ref_120m", measurement_type="speed", height_m=120),
    }
    db_session.add_all([*site_columns.values(), *ref_columns.values()])
    await db_session.flush()

    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=site_dataset.id,
                timestamp=start_time + timedelta(days=day_index),
                values_json={
                    "Speed_80m": float(site_primary_values[day_index]),
                    "Speed_100m": float(site_secondary_values[day_index]),
                },
            )
            for day_index in range(90)
        ],
    )
    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=reference_dataset.id,
                timestamp=start_time + timedelta(days=day_index),
                values_json={
                    "Ref_100m": float(ref_primary_values[day_index]),
                    "Ref_120m": float(ref_secondary_values[day_index]),
                },
            )
            for day_index in range(sample_count)
        ],
    )
    await db_session.commit()

    return site_dataset, site_columns, reference_dataset, ref_columns, ref_primary_values, ref_secondary_values


async def test_mcp_correlate_returns_regression_statistics_and_scatter_data(client: AsyncClient, db_session: AsyncSession) -> None:
    site_dataset, site_column, reference_dataset, reference_column, _ = await _seed_mcp_datasets(db_session)

    response = await client.post(
        "/api/mcp/correlate",
        json={
            "site_dataset_id": str(site_dataset.id),
            "site_column_id": str(site_column.id),
            "ref_dataset_id": str(reference_dataset.id),
            "ref_column_id": str(reference_column.id),
            "max_points": 20,
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["stats"]["sample_count"] == 48
    assert abs(payload["stats"]["slope"] - 1.2) < 1e-9
    assert abs(payload["stats"]["intercept"] - 0.5) < 1e-9
    assert payload["stats"]["r_squared"] > 0.999999
    assert len(payload["scatter_points"]) <= 20
    assert payload["scatter_points"][0]["month"] in {1, 2}


async def test_mcp_predict_returns_long_term_prediction_summary(client: AsyncClient, db_session: AsyncSession) -> None:
    site_dataset, site_column, reference_dataset, reference_column, reference_values = await _seed_mcp_datasets(db_session)

    response = await client.post(
        "/api/mcp/predict",
        json={
            "site_dataset_id": str(site_dataset.id),
            "site_column_id": str(site_column.id),
            "ref_dataset_id": str(reference_dataset.id),
            "ref_column_id": str(reference_column.id),
            "method": "linear",
            "max_prediction_points": 100,
        },
    )

    assert response.status_code == 200
    payload = response.json()

    expected_prediction = (1.2 * reference_values) + 0.5
    assert payload["method"] == "linear"
    assert abs(payload["params"]["slope"] - 1.2) < 1e-9
    assert abs(payload["params"]["intercept"] - 0.5) < 1e-9
    assert payload["stats"]["rmse"] < 1e-9
    assert len(payload["predicted_points"]) == 72
    assert abs(payload["predicted_points"][0]["value"] - float(expected_prediction[0])) < 1e-9
    assert abs(payload["predicted_points"][-1]["value"] - float(expected_prediction[-1])) < 1e-9
    assert abs(payload["summary"]["long_term_mean_speed"] - float(np.mean(expected_prediction))) < 1e-9
    assert len(payload["summary"]["monthly_means"]) == 2
    assert len(payload["summary"]["annual_means"]) == 1
    assert payload["summary"]["weibull"] is not None


async def test_mcp_compare_ranks_available_methods(client: AsyncClient, db_session: AsyncSession) -> None:
    site_dataset, site_column, reference_dataset, reference_column, reference_values = await _seed_mcp_datasets(db_session)

    response = await client.post(
        "/api/mcp/compare",
        json={
            "site_dataset_id": str(site_dataset.id),
            "site_column_id": str(site_column.id),
            "ref_dataset_id": str(reference_dataset.id),
            "ref_column_id": str(reference_column.id),
            "methods": ["linear", "variance_ratio"],
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["recommended_method"] in {"linear", "variance_ratio"}
    assert len(payload["results"]) == 2
    assert payload["results"][0]["stats"]["rmse"] <= payload["results"][1]["stats"]["rmse"]
    assert payload["recommended_method"] == payload["results"][0]["method"]

    linear_row = next(row for row in payload["results"] if row["method"] == "linear")
    variance_row = next(row for row in payload["results"] if row["method"] == "variance_ratio")

    assert linear_row["stats"]["rmse"] < 1e-9
    assert variance_row["stats"]["rmse"] < 1e-9
    assert abs(linear_row["summary"]["long_term_mean_speed"] - float(np.mean((1.2 * reference_values) + 0.5))) < 1e-9
    assert abs(variance_row["params"]["std_ratio"] - 1.2) < 1e-9


async def test_mcp_predict_matrix_returns_outputs_for_multiple_site_columns(client: AsyncClient, db_session: AsyncSession) -> None:
    site_dataset, site_columns, reference_dataset, ref_columns, ref_primary_values, ref_secondary_values = await _seed_matrix_mcp_datasets(db_session)

    response = await client.post(
        "/api/mcp/predict",
        json={
            "site_dataset_id": str(site_dataset.id),
            "site_column_id": str(site_columns["Speed_80m"].id),
            "site_column_ids": [str(site_columns["Speed_100m"].id)],
            "ref_dataset_id": str(reference_dataset.id),
            "ref_column_id": str(ref_columns["Ref_100m"].id),
            "ref_column_ids": [str(ref_columns["Ref_120m"].id)],
            "method": "matrix",
            "max_prediction_points": 200,
        },
    )

    assert response.status_code == 200
    payload = response.json()

    expected_primary = (0.7 * ref_primary_values) + (0.3 * ref_secondary_values) + 0.4
    expected_secondary = (0.5 * ref_primary_values) + (0.5 * ref_secondary_values) + 0.2

    assert payload["method"] == "matrix"
    assert len(payload["matrix_outputs"]) == 2
    assert abs(payload["params"]["coefficient_Ref_100m"] - 0.7) < 1e-9
    assert abs(payload["params"]["coefficient_Ref_120m"] - 0.3) < 1e-9
    assert abs(payload["params"]["intercept"] - 0.4) < 1e-9
    assert payload["stats"]["rmse"] < 1e-9
    assert len(payload["predicted_points"]) == 120
    assert abs(payload["predicted_points"][-1]["value"] - float(expected_primary[-1])) < 1e-9

    secondary_output = next(item for item in payload["matrix_outputs"] if item["site_column_id"] == str(site_columns["Speed_100m"].id))
    assert abs(secondary_output["params"]["coefficient_Ref_100m"] - 0.5) < 1e-9
    assert abs(secondary_output["params"]["coefficient_Ref_120m"] - 0.5) < 1e-9
    assert abs(secondary_output["params"]["intercept"] - 0.2) < 1e-9
    assert len(secondary_output["predicted_points"]) == 120
    assert abs(secondary_output["predicted_points"][-1]["value"] - float(expected_secondary[-1])) < 1e-9


async def test_mcp_compare_uses_cross_validation_and_recommends_matrix_when_predictor_set_is_richer(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    site_dataset, site_columns, reference_dataset, ref_columns, _, _ = await _seed_matrix_mcp_datasets(db_session)

    response = await client.post(
        "/api/mcp/compare",
        json={
            "site_dataset_id": str(site_dataset.id),
            "site_column_id": str(site_columns["Speed_80m"].id),
            "site_column_ids": [str(site_columns["Speed_100m"].id)],
            "ref_dataset_id": str(reference_dataset.id),
            "ref_column_id": str(ref_columns["Ref_100m"].id),
            "ref_column_ids": [str(ref_columns["Ref_120m"].id)],
            "methods": ["linear", "variance_ratio", "matrix"],
        },
    )

    assert response.status_code == 200
    payload = response.json()

    matrix_row = next(row for row in payload["results"] if row["method"] == "matrix")
    linear_row = next(row for row in payload["results"] if row["method"] == "linear")
    variance_row = next(row for row in payload["results"] if row["method"] == "variance_ratio")

    assert payload["recommended_method"] == "matrix"
    assert payload["results"][0]["method"] == "matrix"
    assert matrix_row["cross_validation"]["fold_count"] >= 3
    assert matrix_row["cross_validation"]["uncertainty"] < 1e-9
    assert matrix_row["uncertainty"] < linear_row["uncertainty"]
    assert matrix_row["uncertainty"] < variance_row["uncertainty"]
    assert linear_row["cross_validation"]["fold_count"] >= 3
    assert variance_row["cross_validation"]["fold_count"] >= 3