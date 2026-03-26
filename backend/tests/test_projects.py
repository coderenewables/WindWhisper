from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dataset, Project


async def test_create_project(client: AsyncClient) -> None:
    response = await client.post(
        "/api/projects",
        json={
            "name": "North Ridge",
            "description": "Primary monitoring campaign",
            "latitude": 35.123,
            "longitude": -101.456,
            "elevation": 1420.5,
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "North Ridge"
    assert payload["description"] == "Primary monitoring campaign"
    assert payload["dataset_count"] == 0
    assert payload["id"]


async def test_list_projects_returns_paginated_results(client: AsyncClient) -> None:
    await client.post("/api/projects", json={"name": "Project A"})
    await client.post("/api/projects", json={"name": "Project B"})
    await client.post("/api/projects", json={"name": "Project C"})

    response = await client.get("/api/projects", params={"skip": 1, "limit": 2})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 3
    assert len(payload["projects"]) == 2


async def test_get_project_includes_dataset_count(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    project = Project(name="Coastal Site")
    db_session.add(project)
    await db_session.flush()

    db_session.add(
        Dataset(
            project_id=project.id,
            name="Met Mast 80m",
            source_type="mast",
        ),
    )
    await db_session.commit()

    response = await client.get(f"/api/projects/{project.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == str(project.id)
    assert payload["dataset_count"] == 1


async def test_update_project_updates_mutable_fields(client: AsyncClient) -> None:
    create_response = await client.post("/api/projects", json={"name": "Legacy Site"})
    project_id = create_response.json()["id"]

    response = await client.put(
        f"/api/projects/{project_id}",
        json={
            "name": "Legacy Site Revised",
            "description": "Updated project metadata",
            "elevation": 1188.0,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Legacy Site Revised"
    assert payload["description"] == "Updated project metadata"
    assert payload["elevation"] == 1188.0


async def test_delete_project_removes_record(client: AsyncClient) -> None:
    create_response = await client.post("/api/projects", json={"name": "Retired Site"})
    project_id = create_response.json()["id"]

    delete_response = await client.delete(f"/api/projects/{project_id}")
    get_response = await client.get(f"/api/projects/{project_id}")

    assert delete_response.status_code == 204
    assert get_response.status_code == 404