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
        json={"column_id": str(temp_column.id), "operator": "<", "value": 2, "group_index": 1, "order_index": 1},
    )
    second_rule = await client.post(
        f"/api/qc/flags/{flag_id}/rules",
        json={"column_id": str(speed_column.id), "operator": "<=", "value": 3, "group_index": 1, "order_index": 2},
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
        json={"column_id": str(speed_column.id), "operator": "<", "value": 2, "group_index": 1, "order_index": 1},
    )
    assert create_rule_response.status_code == 201
    rule_id = create_rule_response.json()["id"]

    update_rule_response = await client.put(
        f"/api/qc/rules/{rule_id}",
        json={"column_id": str(temp_column.id), "operator": "between", "value": [-5, 1], "group_index": 2, "order_index": 3, "logic": "OR"},
    )
    assert update_rule_response.status_code == 200
    updated_payload = update_rule_response.json()
    assert updated_payload["column_id"] == str(temp_column.id)
    assert updated_payload["operator"] == "between"
    assert updated_payload["value"] == [-5, 1]
    assert updated_payload["group_index"] == 2
    assert updated_payload["order_index"] == 3
    assert updated_payload["logic"] == "OR"

    list_rules_response = await client.get(f"/api/qc/flags/{flag_id}/rules")
    assert list_rules_response.status_code == 200
    assert len(list_rules_response.json()) == 1
    assert list_rules_response.json()[0]["column_id"] == str(temp_column.id)

    delete_rule_response = await client.delete(f"/api/qc/rules/{rule_id}")
    assert delete_rule_response.status_code == 204

    rules_after_delete = await client.get(f"/api/qc/flags/{flag_id}/rules")
    assert rules_after_delete.status_code == 200
    assert rules_after_delete.json() == []


async def test_apply_rules_supports_grouping_and_or_logic(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, speed_column, temp_column = await _seed_dataset(db_session)
    flag_id = (
        await client.post(f"/api/qc/flags/{dataset.id}", json={"name": "Grouped logic", "color": "#7c3aed"})
    ).json()["id"]

    responses = await client.post(
        f"/api/qc/flags/{flag_id}/rules",
        json={"column_id": str(temp_column.id), "operator": "<", "value": 0, "group_index": 1, "order_index": 1},
    )
    assert responses.status_code == 201
    responses = await client.post(
        f"/api/qc/flags/{flag_id}/rules",
        json={"column_id": str(speed_column.id), "operator": "<=", "value": 2, "logic": "AND", "group_index": 1, "order_index": 2},
    )
    assert responses.status_code == 201
    responses = await client.post(
        f"/api/qc/flags/{flag_id}/rules",
        json={"column_id": str(speed_column.id), "operator": ">=", "value": 7, "logic": "AND", "group_index": 2, "order_index": 1},
    )
    assert responses.status_code == 201
    responses = await client.post(
        f"/api/qc/flags/{flag_id}/rules",
        json={"column_id": str(temp_column.id), "operator": ">=", "value": 4, "logic": "OR", "group_index": 2, "order_index": 2},
    )
    assert responses.status_code == 201

    apply_response = await client.post(f"/api/qc/flags/{flag_id}/apply-rules")
    assert apply_response.status_code == 200
    flagged_ranges = apply_response.json()
    assert len(flagged_ranges) == 3
    assert flagged_ranges[0]["start_time"] == "2025-01-01T00:00:00Z"
    assert flagged_ranges[0]["end_time"] == "2025-01-01T00:00:00Z"
    assert flagged_ranges[1]["start_time"] == "2025-01-01T00:20:00Z"
    assert flagged_ranges[1]["end_time"] == "2025-01-01T00:30:00Z"
    assert flagged_ranges[2]["start_time"] == "2025-01-01T00:50:00Z"
    assert flagged_ranges[2]["end_time"] == "2025-01-01T00:50:00Z"


async def _seed_tower_shadow_dataset(db_session: AsyncSession) -> tuple[Project, Dataset, DataColumn, DataColumn, DataColumn]:
    project = Project(name="Tower Shadow Site")
    db_session.add(project)
    await db_session.flush()

    dataset = Dataset(
        project_id=project.id,
        name="Tower Shadow Mast",
        source_type="mast",
        time_step_seconds=600,
        start_time=datetime(2025, 2, 1, 0, 0, tzinfo=UTC),
        end_time=datetime(2025, 2, 1, 6, 0, tzinfo=UTC),
    )
    db_session.add(dataset)
    await db_session.flush()

    direction_column = DataColumn(dataset_id=dataset.id, name="Dir_80m", measurement_type="direction", height_m=80)
    speed_a = DataColumn(dataset_id=dataset.id, name="Speed_A_80m", measurement_type="speed", height_m=80)
    speed_b = DataColumn(dataset_id=dataset.id, name="Speed_B_80m", measurement_type="speed", height_m=80)
    db_session.add_all([direction_column, speed_a, speed_b])
    await db_session.flush()

    base_time = datetime(2025, 2, 1, 0, 0, tzinfo=UTC)
    shadow_rows = [
        {"Dir_80m": 170, "Speed_A_80m": 2.0, "Speed_B_80m": 8.0},
        {"Dir_80m": 175, "Speed_A_80m": 2.0, "Speed_B_80m": 8.0},
        {"Dir_80m": 180, "Speed_A_80m": 1.0, "Speed_B_80m": 8.0},
        {"Dir_80m": 185, "Speed_A_80m": 2.0, "Speed_B_80m": 8.0},
        {"Dir_80m": 190, "Speed_A_80m": 2.0, "Speed_B_80m": 8.0},
    ]
    normal_rows = [
        {"Dir_80m": direction, "Speed_A_80m": 8.0, "Speed_B_80m": 8.0}
        for direction in [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155]
    ]
    rows = shadow_rows + normal_rows
    db_session.add_all(
        [
            TimeseriesData(dataset_id=dataset.id, timestamp=base_time + timedelta(minutes=index * 10), values_json=row)
            for index, row in enumerate(rows)
        ],
    )
    await db_session.commit()
    return project, dataset, direction_column, speed_a, speed_b


async def test_manual_tower_shadow_preview_and_apply(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, direction_column, speed_a, _ = await _seed_tower_shadow_dataset(db_session)

    preview_response = await client.post(
        f"/api/qc/tower-shadow/{dataset.id}",
        json={
            "method": "manual",
            "direction_column_id": str(direction_column.id),
            "boom_orientations": [0],
            "shadow_width": 20,
            "apply": False,
        },
    )

    assert preview_response.status_code == 200
    preview_payload = preview_response.json()
    assert preview_payload["preview_point_count"] == 10
    assert len(preview_payload["sectors"]) >= 1
    assert preview_payload["sectors"][0]["affected_column_ids"] == [str(speed_a.id)]

    apply_response = await client.post(
        f"/api/qc/tower-shadow/{dataset.id}",
        json={
            "method": "manual",
            "direction_column_id": str(direction_column.id),
            "boom_orientations": [0],
            "shadow_width": 20,
            "apply": True,
        },
    )

    assert apply_response.status_code == 200
    apply_payload = apply_response.json()
    assert apply_payload["applied"] is True
    assert apply_payload["flag_id"] is not None

    flagged_ranges_response = await client.get(f"/api/qc/datasets/{dataset.id}/flagged-ranges")
    assert flagged_ranges_response.status_code == 200
    ranges = flagged_ranges_response.json()
    assert len(ranges) >= 1
    assert any(str(speed_a.id) in (flagged_range["column_ids"] or []) for flagged_range in ranges)


async def test_auto_tower_shadow_detects_shadow_sector(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, direction_column, speed_a, speed_b = await _seed_tower_shadow_dataset(db_session)

    response = await client.post(
        f"/api/qc/tower-shadow/{dataset.id}",
        json={
            "method": "auto",
            "direction_column_id": str(direction_column.id),
            "apply": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_point_count"] >= 5
    assert len(payload["sectors"]) >= 1
    assert set(payload["sectors"][0]["affected_column_ids"]) == {str(speed_a.id), str(speed_b.id)}


async def _seed_reconstruction_dataset(db_session: AsyncSession) -> tuple[Project, Dataset, DataColumn, DataColumn]:
    project = Project(name="Reconstruction Site")
    db_session.add(project)
    await db_session.flush()

    dataset = Dataset(
        project_id=project.id,
        name="Gap Fill Mast",
        source_type="mast",
        time_step_seconds=600,
        start_time=datetime(2025, 3, 1, 0, 0, tzinfo=UTC),
        end_time=datetime(2025, 3, 1, 0, 50, tzinfo=UTC),
    )
    db_session.add(dataset)
    await db_session.flush()

    target_column = DataColumn(dataset_id=dataset.id, name="Speed_80m", measurement_type="speed", height_m=80, unit="m/s")
    reference_column = DataColumn(dataset_id=dataset.id, name="RefSpeed_80m", measurement_type="speed", height_m=80, unit="m/s")
    db_session.add_all([target_column, reference_column])
    await db_session.flush()

    base_time = datetime(2025, 3, 1, 0, 0, tzinfo=UTC)
    rows = [
        (0, {"Speed_80m": 2.0, "RefSpeed_80m": 4.0}),
        (10, {"Speed_80m": 4.0, "RefSpeed_80m": 8.0}),
        (30, {"Speed_80m": None, "RefSpeed_80m": 12.0}),
        (40, {"Speed_80m": 8.0, "RefSpeed_80m": 16.0}),
        (50, {"Speed_80m": 10.0, "RefSpeed_80m": 20.0}),
    ]
    db_session.add_all(
        [
            TimeseriesData(dataset_id=dataset.id, timestamp=base_time + timedelta(minutes=offset), values_json=row)
            for offset, row in rows
        ],
    )
    await db_session.commit()
    return project, dataset, target_column, reference_column


async def test_reconstruction_preview_reports_gaps_and_fills(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, target_column, _ = await _seed_reconstruction_dataset(db_session)

    response = await client.post(
        f"/api/qc/reconstruct/{dataset.id}",
        json={
            "column_id": str(target_column.id),
            "method": "interpolation",
            "save_mode": "preview",
            "max_gap_hours": 6,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["save_mode"] == "preview"
    assert payload["summary"]["gap_count"] == 1
    assert payload["summary"]["filled_count"] == 2
    assert payload["summary"]["remaining_missing_count"] == 0
    assert payload["gaps"][0]["start_time"] == "2025-03-01T00:20:00Z"
    assert payload["gaps"][0]["end_time"] == "2025-03-01T00:30:00Z"
    assert payload["saved_column"] is None
    assert any(payload["preview"]["filled_mask"])


async def test_reconstruction_can_save_new_column_and_insert_missing_rows(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, target_column, _ = await _seed_reconstruction_dataset(db_session)

    response = await client.post(
        f"/api/qc/reconstruct/{dataset.id}",
        json={
            "column_id": str(target_column.id),
            "method": "interpolation",
            "save_mode": "new_column",
            "new_column_name": "Speed_80m_reconstructed",
            "max_gap_hours": 6,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["saved_column"]["name"] == "Speed_80m_reconstructed"
    assert payload["summary"]["filled_count"] == 2

    dataset_response = await client.get(f"/api/datasets/{dataset.id}")
    assert dataset_response.status_code == 200
    dataset_payload = dataset_response.json()
    assert any(column["name"] == "Speed_80m_reconstructed" for column in dataset_payload["columns"])

    timeseries_response = await client.get(f"/api/datasets/{dataset.id}/timeseries")
    assert timeseries_response.status_code == 200
    series_payload = timeseries_response.json()
    saved_column_id = payload["saved_column"]["id"]
    assert len(series_payload["timestamps"]) == 6
    assert saved_column_id in series_payload["columns"]
    assert series_payload["columns"][saved_column_id]["values"][2] is not None
    assert series_payload["columns"][saved_column_id]["values"][3] is not None


async def test_correlation_reconstruction_preview_uses_reference_column(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, target_column, reference_column = await _seed_reconstruction_dataset(db_session)

    response = await client.post(
        f"/api/qc/reconstruct/{dataset.id}",
        json={
            "column_id": str(target_column.id),
            "method": "correlation",
            "save_mode": "preview",
            "reference_column_id": str(reference_column.id),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "correlation"
    assert payload["reference_column_id"] == str(reference_column.id)
    assert payload["summary"]["filled_count"] == 2
    assert payload["summary"]["remaining_missing_count"] == 0


async def test_reconstruction_overwrite_is_recorded_and_can_be_undone(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, target_column, _ = await _seed_reconstruction_dataset(db_session)

    overwrite_response = await client.post(
        f"/api/qc/reconstruct/{dataset.id}",
        json={
            "column_id": str(target_column.id),
            "method": "interpolation",
            "save_mode": "overwrite",
            "max_gap_hours": 6,
        },
    )

    assert overwrite_response.status_code == 200
    overwrite_payload = overwrite_response.json()
    assert overwrite_payload["save_mode"] == "overwrite"
    assert overwrite_payload["summary"]["filled_count"] == 2

    history_response = await client.get(f"/api/datasets/{dataset.id}/history")
    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert history_payload["total"] == 1
    assert history_payload["changes"][0]["action_type"] == "data_reconstructed"
    assert history_payload["changes"][0]["before_state"]["save_mode"] == "overwrite"
    assert len(history_payload["changes"][0]["before_state"]["changes"]) == 2

    timeseries_after_overwrite = await client.get(f"/api/datasets/{dataset.id}/timeseries")
    assert timeseries_after_overwrite.status_code == 200
    series_after_overwrite = timeseries_after_overwrite.json()
    target_values_after_overwrite = series_after_overwrite["columns"][str(target_column.id)]["values"]
    assert len(series_after_overwrite["timestamps"]) == 6
    assert target_values_after_overwrite[2] is not None
    assert target_values_after_overwrite[3] is not None

    undo_response = await client.post(f"/api/datasets/{dataset.id}/undo")
    assert undo_response.status_code == 200
    undo_payload = undo_response.json()
    assert undo_payload["undone_change"]["action_type"] == "data_reconstructed"

    timeseries_after_undo = await client.get(f"/api/datasets/{dataset.id}/timeseries")
    assert timeseries_after_undo.status_code == 200
    series_after_undo = timeseries_after_undo.json()
    target_values_after_undo = series_after_undo["columns"][str(target_column.id)]["values"]
    assert len(series_after_undo["timestamps"]) == 5
    assert target_values_after_undo[2] is None

    history_after_undo = await client.get(f"/api/datasets/{dataset.id}/history")
    assert history_after_undo.status_code == 200
    assert history_after_undo.json()["total"] == 0


async def test_reconstruction_new_column_is_recorded_and_can_be_undone(client: AsyncClient, db_session: AsyncSession) -> None:
    _, dataset, target_column, _ = await _seed_reconstruction_dataset(db_session)

    response = await client.post(
        f"/api/qc/reconstruct/{dataset.id}",
        json={
            "column_id": str(target_column.id),
            "method": "interpolation",
            "save_mode": "new_column",
            "new_column_name": "Speed_80m_reconstructed",
            "max_gap_hours": 6,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    saved_column_id = payload["saved_column"]["id"]

    history_response = await client.get(f"/api/datasets/{dataset.id}/history")
    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert history_payload["total"] == 1
    assert history_payload["changes"][0]["before_state"]["save_mode"] == "new_column"

    undo_response = await client.post(f"/api/datasets/{dataset.id}/undo")
    assert undo_response.status_code == 200

    dataset_response = await client.get(f"/api/datasets/{dataset.id}")
    assert dataset_response.status_code == 200
    assert all(column["id"] != saved_column_id for column in dataset_response.json()["columns"])


async def test_manual_flag_application_is_recorded_and_can_be_undone(client: AsyncClient, db_session: AsyncSession) -> None:
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

    history_response = await client.get(f"/api/datasets/{dataset.id}/history")
    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert history_payload["total"] == 1
    assert history_payload["changes"][0]["action_type"] == "flag_applied"

    undo_response = await client.post(f"/api/datasets/{dataset.id}/undo")
    assert undo_response.status_code == 200

    ranges_response = await client.get(f"/api/qc/datasets/{dataset.id}/flagged-ranges")
    assert ranges_response.status_code == 200
    assert ranges_response.json() == []


async def test_delete_flag_is_recorded_and_can_be_undone(client: AsyncClient, db_session: AsyncSession) -> None:
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

    clear_history_response = await client.post(f"/api/datasets/{dataset.id}/undo")
    assert clear_history_response.status_code == 200

    delete_flag_response = await client.delete(f"/api/qc/flags/{flag_id}")
    assert delete_flag_response.status_code == 204

    history_response = await client.get(f"/api/datasets/{dataset.id}/history")
    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert history_payload["total"] == 1
    assert history_payload["changes"][0]["action_type"] == "flag_removed"

    undo_response = await client.post(f"/api/datasets/{dataset.id}/undo")
    assert undo_response.status_code == 200

    flags_response = await client.get(f"/api/qc/flags/{dataset.id}")
    assert flags_response.status_code == 200
    restored_flags = flags_response.json()
    assert len(restored_flags) == 1
    assert restored_flags[0]["name"] == "Transient"
