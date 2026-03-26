from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataColumn, Dataset, Project, TimeseriesData


async def _seed_dataset(db_session: AsyncSession) -> tuple[Project, Dataset, DataColumn, DataColumn]:
    project = Project(name="QC Site")
    db_session.add(project)
    await db_session.flush()

    dataset = Dataset(
        project_id=project.id,
        name="Mast A",
        source_type="mast",
        time_step_seconds=600,
        start_time=datetime(2025, 1, 1, 0, 0, tzinfo=UTC),
        end_time=datetime(2025, 1, 1, 0, 50, tzinfo=UTC),
    )
    db_session.add(dataset)
    await db_session.flush()

    speed_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80)
    temp_column = DataColumn(dataset_id=dataset.id, name="Temp_2m", measurement_type="temperature", height_m=2)
    db_session.add_all([speed_column, temp_column])
    await db_session.flush()

    base_time = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
    rows = [
        {"Speed_80m": 4.0, "Temp_2m": 5.0},
        {"Speed_80m": 3.0, "Temp_2m": 1.0},
        {"Speed_80m": 2.0, "Temp_2m": -1.0},
        {"Speed_80m": 1.0, "Temp_2m": -2.0},
        {"Speed_80m": 6.0, "Temp_2m": 3.0},
        {"Speed_80m": 7.0, "Temp_2m": 4.0},
    ]
    db_session.add_all(
        [
            TimeseriesData(dataset_id=dataset.id, timestamp=base_time + timedelta(minutes=index * 10), values_json=row)
            for index, row in enumerate(rows)
        ],
    )
    await db_session.commit()
    return project, dataset, speed_column, temp_column


async def test_create_and_list_flags(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, _, _ = await _seed_dataset(db_session)

    create_response = await client.post(
        f"/api/qc/flags/{dataset.id}",
        json={"name": "Icing", "color": "#1f8f84", "description": "Low temperature icing risk"},
    )

    assert create_response.status_code == 201
    payload = create_response.json()
    assert payload["name"] == "Icing"
    assert payload["rule_count"] == 0
    assert payload["flagged_count"] == 0

    list_response = await client.get(f"/api/qc/flags/{dataset.id}")
    assert list_response.status_code == 200
    listed = list_response.json()
    assert len(listed) == 1
    assert listed[0]["name"] == "Icing"


async def test_manual_flagging_and_delete_range(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, speed_column, _ = await _seed_dataset(db_session)
    flag_id = (
        await client.post(f"/api/qc/flags/{dataset.id}", json={"name": "Manual exclusion", "color": "#ef4444"})
    ).json()["id"]

    manual_response = await client.post(
        f"/api/qc/flags/{flag_id}/manual",
        json={
            "start_time": "2025-01-01T00:10:00Z",
            "end_time": "2025-01-01T00:30:00Z",
            "column_ids": [str(speed_column.id)],
        },
    )

    assert manual_response.status_code == 201
    payload = manual_response.json()
    assert payload["applied_by"] == "manual"
    assert payload["column_ids"] == [str(speed_column.id)]

    ranges_response = await client.get(f"/api/qc/datasets/{dataset.id}/flagged-ranges")
    assert ranges_response.status_code == 200
    ranges = ranges_response.json()
    assert len(ranges) == 1

    delete_response = await client.delete(f"/api/qc/flagged-ranges/{payload['id']}")
    assert delete_response.status_code == 204

    ranges_after_delete = await client.get(f"/api/qc/datasets/{dataset.id}/flagged-ranges")
    assert ranges_after_delete.status_code == 200
    assert ranges_after_delete.json() == []


async def test_apply_rules_creates_merged_automatic_ranges(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, speed_column, temp_column = await _seed_dataset(db_session)
    flag_id = (
        await client.post(f"/api/qc/flags/{dataset.id}", json={"name": "Cold low-speed", "color": "#2563eb"})
    ).json()["id"]

    first_rule = await client.post(
        f"/api/qc/flags/{flag_id}/rules",
        json={"column_id": str(temp_column.id), "operator": "<", "value": 2},
    )
    second_rule = await client.post(
        f"/api/qc/flags/{flag_id}/rules",
        json={"column_id": str(speed_column.id), "operator": "<=", "value": 3},
    )

    assert first_rule.status_code == 201
    assert second_rule.status_code == 201

    list_rules_response = await client.get(f"/api/qc/flags/{flag_id}/rules")
    assert list_rules_response.status_code == 200
    assert len(list_rules_response.json()) == 2

    apply_response = await client.post(f"/api/qc/flags/{flag_id}/apply-rules")
    assert apply_response.status_code == 200
    flagged_ranges = apply_response.json()
    assert len(flagged_ranges) == 1
    assert flagged_ranges[0]["applied_by"] == "auto"
    assert flagged_ranges[0]["start_time"] == "2025-01-01T00:10:00Z"
    assert flagged_ranges[0]["end_time"] == "2025-01-01T00:30:00Z"
    assert set(flagged_ranges[0]["column_ids"]) == {str(speed_column.id), str(temp_column.id)}

    list_flags_response = await client.get(f"/api/qc/flags/{dataset.id}")
    assert list_flags_response.status_code == 200
    listed_flag = list_flags_response.json()[0]
    assert listed_flag["rule_count"] == 2
    assert listed_flag["flagged_count"] == 1


async def test_delete_flag_removes_flag_and_ranges(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, speed_column, _ = await _seed_dataset(db_session)
    flag_id = (
        await client.post(f"/api/qc/flags/{dataset.id}", json={"name": "Transient", "color": "#6b7280"})
    ).json()["id"]
    manual_response = await client.post(
        f"/api/qc/flags/{flag_id}/manual",
        json={
            "start_time": "2025-01-01T00:10:00Z",
            "end_time": "2025-01-01T00:20:00Z",
            "column_ids": [str(speed_column.id)],
        },
    )
    assert manual_response.status_code == 201

    delete_flag_response = await client.delete(f"/api/qc/flags/{flag_id}")
    assert delete_flag_response.status_code == 204

    flags_response = await client.get(f"/api/qc/flags/{dataset.id}")
    assert flags_response.status_code == 200
    assert flags_response.json() == []


async def test_update_and_delete_rule(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, speed_column, temp_column = await _seed_dataset(db_session)
    flag_id = (
        await client.post(f"/api/qc/flags/{dataset.id}", json={"name": "Editable", "color": "#0f766e"})
    ).json()["id"]

    create_rule_response = await client.post(
        f"/api/qc/flags/{flag_id}/rules",
        json={"column_id": str(speed_column.id), "operator": "<", "value": 2},
    )
    assert create_rule_response.status_code == 201
    rule_id = create_rule_response.json()["id"]

    update_rule_response = await client.put(
        f"/api/qc/rules/{rule_id}",
        json={"column_id": str(temp_column.id), "operator": "between", "value": [-5, 1]},
    )
    assert update_rule_response.status_code == 200
    updated_payload = update_rule_response.json()
    assert updated_payload["column_id"] == str(temp_column.id)
    assert updated_payload["operator"] == "between"
    assert updated_payload["value"] == [-5, 1]

    list_rules_response = await client.get(f"/api/qc/flags/{flag_id}/rules")
    assert list_rules_response.status_code == 200
    assert len(list_rules_response.json()) == 1
    assert list_rules_response.json()[0]["column_id"] == str(temp_column.id)

    delete_rule_response = await client.delete(f"/api/qc/rules/{rule_id}")
    assert delete_rule_response.status_code == 204

    rules_after_delete = await client.get(f"/api/qc/flags/{flag_id}/rules")
    assert rules_after_delete.status_code == 200
    assert rules_after_delete.json() == []
