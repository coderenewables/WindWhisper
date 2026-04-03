"""Tests for AI REST endpoints and WebSocket connection."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dataset, Project
from app.models.ai import AiAction, AiConversation, AiMessage, AiProjectMemory


# ── Fixtures ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def project(db_session: AsyncSession) -> Project:
    p = Project(name="Router Test Project", latitude=40.0, longitude=-105.0)
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def conversation(db_session: AsyncSession, project: Project) -> AiConversation:
    conv = AiConversation(project_id=project.id, title="Test Conv")
    db_session.add(conv)
    await db_session.commit()
    return conv


@pytest_asyncio.fixture
async def pending_action(db_session: AsyncSession, project: Project) -> AiAction:
    action = AiAction(
        project_id=project.id, action_type="create_qc_flag",
        title="Flag Icing", payload={"dataset_id": str(uuid4()), "flag_name": "Icing", "rules": []},
        status="pending",
    )
    db_session.add(action)
    await db_session.commit()
    return action


@pytest_asyncio.fixture
async def memory(db_session: AsyncSession, project: Project) -> AiProjectMemory:
    mem = AiProjectMemory(project_id=project.id, memory_type="insight", content="Test insight content")
    db_session.add(mem)
    await db_session.commit()
    return mem


# ── Status ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ai_status(client: AsyncClient):
    resp = await client.get("/api/ai/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "ai_enabled" in data
    assert "has_api_key" in data
    assert "connected" in data


@pytest.mark.asyncio
async def test_toggle_ai(client: AsyncClient):
    resp1 = await client.get("/api/ai/status")
    initial = resp1.json()["ai_enabled"]

    resp2 = await client.post("/api/ai/toggle")
    assert resp2.status_code == 200
    assert resp2.json()["ai_enabled"] != initial

    # Toggle back
    resp3 = await client.post("/api/ai/toggle")
    assert resp3.json()["ai_enabled"] == initial


@pytest.mark.asyncio
async def test_configure_ai(client: AsyncClient):
    resp = await client.post("/api/ai/configure", json={"llm_model": "gpt-4"})
    assert resp.status_code == 200
    assert resp.json()["llm_model"] == "gpt-4"


# ── Conversations ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_conversation(client: AsyncClient, project: Project):
    resp = await client.post(f"/api/ai/projects/{project.id}/conversations")
    assert resp.status_code == 201
    data = resp.json()
    assert data["project_id"] == str(project.id)
    assert "id" in data


@pytest.mark.asyncio
async def test_list_conversations(client: AsyncClient, project: Project, conversation: AiConversation):
    resp = await client.get(f"/api/ai/projects/{project.id}/conversations")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["id"] == str(conversation.id)


@pytest.mark.asyncio
async def test_get_conversation(client: AsyncClient, project: Project):
    # Create via API to avoid session issues
    create_resp = await client.post(f"/api/ai/projects/{project.id}/conversations")
    conv_id = create_resp.json()["id"]
    resp = await client.get(f"/api/ai/conversations/{conv_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == conv_id
    assert "messages" in data


@pytest.mark.asyncio
async def test_get_conversation_not_found(client: AsyncClient):
    resp = await client.get(f"/api/ai/conversations/{uuid4()}")
    assert resp.status_code == 404


# ── Actions ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_actions(client: AsyncClient, project: Project, pending_action: AiAction):
    resp = await client.get(f"/api/ai/projects/{project.id}/actions")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_list_actions_with_filter(client: AsyncClient, project: Project, pending_action: AiAction):
    resp = await client.get(f"/api/ai/projects/{project.id}/actions", params={"status_filter": "approved"})
    assert resp.status_code == 200
    assert len(resp.json()) == 0  # no approved actions yet


@pytest.mark.asyncio
async def test_approve_action(client: AsyncClient, pending_action: AiAction):
    with patch("app.ai.action_executor.execute_tool", new_callable=AsyncMock, return_value={"status": "ok"}):
        resp = await client.post(f"/api/ai/actions/{pending_action.id}/approve")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("approved", "failed")
    assert data["resolved_by"] == "user"


@pytest.mark.asyncio
async def test_approve_action_not_found(client: AsyncClient):
    resp = await client.post(f"/api/ai/actions/{uuid4()}/approve")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_approve_already_approved(client: AsyncClient, db_session, pending_action: AiAction):
    pending_action.status = "approved"
    await db_session.commit()
    resp = await client.post(f"/api/ai/actions/{pending_action.id}/approve")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_reject_action(client: AsyncClient, pending_action: AiAction):
    resp = await client.post(f"/api/ai/actions/{pending_action.id}/reject", json={"reason": "Not needed"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "rejected"
    assert "Not needed" in (data["description"] or "")


@pytest.mark.asyncio
async def test_reject_action_no_reason(client: AsyncClient, pending_action: AiAction):
    resp = await client.post(f"/api/ai/actions/{pending_action.id}/reject", json={})
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"


@pytest.mark.asyncio
async def test_reject_action_not_found(client: AsyncClient):
    resp = await client.post(f"/api/ai/actions/{uuid4()}/reject", json={})
    assert resp.status_code == 404


# ── Memory ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_memory(client: AsyncClient, project: Project, memory: AiProjectMemory):
    resp = await client.get(f"/api/ai/projects/{project.id}/memory")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["content"] == "Test insight content"


@pytest.mark.asyncio
async def test_create_memory(client: AsyncClient, project: Project):
    resp = await client.post(f"/api/ai/projects/{project.id}/memory",
                             json={"memory_type": "decision_rationale", "content": "Chose VR method"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["memory_type"] == "decision_rationale"
    assert data["content"] == "Chose VR method"


@pytest.mark.asyncio
async def test_create_memory_validation(client: AsyncClient, project: Project):
    resp = await client.post(f"/api/ai/projects/{project.id}/memory",
                             json={"memory_type": "", "content": "x"})
    assert resp.status_code == 422  # validation error


@pytest.mark.asyncio
async def test_delete_memory(client: AsyncClient, memory: AiProjectMemory):
    resp = await client.delete(f"/api/ai/memory/{memory.id}")
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_memory_not_found(client: AsyncClient):
    resp = await client.delete(f"/api/ai/memory/{uuid4()}")
    assert resp.status_code == 404


# ── Health ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_project_health(client: AsyncClient, project: Project):
    resp = await client.get(f"/api/ai/projects/{project.id}/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "health_score" in data
    assert "issues" in data
    assert "summary" in data


@pytest.mark.asyncio
async def test_project_health_no_datasets(client: AsyncClient, project: Project):
    resp = await client.get(f"/api/ai/projects/{project.id}/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["health_score"] == 0


# ── Send Message ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_message_ai_disabled(client: AsyncClient, conversation: AiConversation):
    from app.config import settings
    original = settings.ai_enabled
    settings.ai_enabled = False
    try:
        resp = await client.post(f"/api/ai/conversations/{conversation.id}/messages",
                                 json={"content": "Hello"})
        assert resp.status_code == 503
    finally:
        settings.ai_enabled = original


@pytest.mark.asyncio
async def test_send_message_not_found(client: AsyncClient):
    resp = await client.post(f"/api/ai/conversations/{uuid4()}/messages",
                             json={"content": "Hello"})
    assert resp.status_code == 404
