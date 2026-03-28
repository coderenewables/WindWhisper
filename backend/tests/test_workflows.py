from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Project, TimeseriesData, Workflow


async def _seed_export_dataset(db_session: AsyncSession) -> tuple[Project, Dataset, DataColumn, DataColumn]:
    project = Project(name="Workflow Export Site")
    db_session.add(project)
    await db_session.flush()

    dataset = Dataset(
        project_id=project.id,
        name="Workflow Mast",
        source_type="mast",
        time_step_seconds=600,
        start_time=datetime(2025, 1, 1, 0, 0, tzinfo=UTC),
        end_time=datetime(2025, 1, 1, 0, 20, tzinfo=UTC),
    )
    db_session.add(dataset)
    await db_session.flush()

    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80, unit="m/s")
    direction_column = DataColumn(dataset_id=dataset.id, name="Dir_80m", measurement_type="direction", height_m=80, unit="deg")
    db_session.add_all([speed_column, direction_column])
    await db_session.flush()

    base_time = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
    db_session.add_all(
        [
            TimeseriesData(
                dataset_id=dataset.id,
                timestamp=base_time + timedelta(minutes=index * 10),
                values_json={"Speed_80m": 6.0 + index, "Dir_80m": 30.0 + index * 10},
            )
            for index in range(3)
        ]
    )
    await db_session.commit()
    return project, dataset, speed_column, direction_column


async def test_create_and_run_export_workflow(client: AsyncClient, db_session: AsyncSession) -> None:
    project, dataset, speed_column, _ = await _seed_export_dataset(db_session)

    create_response = await client.post(
        f"/api/workflows/projects/{project.id}",
        json={
            "name": "Nightly CSV export",
            "steps": [
                {
                    "order": 1,
                    "step_type": "export_data",
                    "params": {
                        "dataset_id": str(dataset.id),
                        "format": "csv",
                        "column_ids": [str(speed_column.id)],
                        "resample": "10min",
                    },
                }
            ],
        },
    )

    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    run_response = await client.post(f"/api/workflows/{workflow_id}/run")

    assert run_response.status_code == 200
    payload = run_response.json()
    assert payload["status"] == "completed"
    assert payload["workflow"]["status"] == "completed"
    assert len(payload["step_results"]) == 1
    assert payload["step_results"][0]["status"] == "completed"
    assert payload["step_results"][0]["details"]["format"] == "csv"
    assert payload["step_results"][0]["details"]["file_name"].endswith(".csv")

    list_response = await client.get(f"/api/workflows/projects/{project.id}")
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1


async def test_import_file_workflow_creates_dataset(client: AsyncClient, db_session: AsyncSession) -> None:
    project = Project(name="Workflow Import Site")
    db_session.add(project)
    await db_session.commit()

    sample_file = Path(__file__).resolve().parents[2] / "data" / "sample_met_tower.csv"
    assert sample_file.exists()

    create_response = await client.post(
        f"/api/workflows/projects/{project.id}",
        json={
            "name": "Import met tower",
            "steps": [
                {
                    "order": 1,
                    "step_type": "import_file",
                    "params": {
                        "file_path": str(sample_file),
                        "dataset_name": "Workflow Imported Dataset",
                    },
                }
            ],
        },
    )

    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    run_response = await client.post(f"/api/workflows/{workflow_id}/run")
    assert run_response.status_code == 200
    payload = run_response.json()
    assert payload["status"] == "completed"
    assert payload["step_results"][0]["details"]["dataset_name"] == "Workflow Imported Dataset"

    dataset_count = await db_session.scalar(select(func.count(Dataset.id)).where(Dataset.project_id == project.id))
    workflow_count = await db_session.scalar(select(func.count(Workflow.id)).where(Workflow.project_id == project.id))

    assert dataset_count == 1
    assert workflow_count == 1