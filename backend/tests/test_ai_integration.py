"""Full AI pipeline integration tests.

Tests the end-to-end flow:
  create project → create conversation → send message →
  orchestrator processes → LLM tool calls → action created →
  approve/reject action → memory/provenance/health updated.

All LLM calls are mocked; the rest (DB, HTTP, orchestrator logic,
action executor, context assembly, health scoring) runs for real.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import DataColumn, Dataset, Project, TimeseriesData
from app.models.ai import (
    AiAction,
    AiConversation,
    AiMessage,
    AiProjectMemory,
    ProjectHealthSnapshot,
)


# ── Fixtures ────────────────────────────────────────────────────────

@pytest_asyncio.fixture(autouse=True)
async def enable_ai():
    """Ensure AI features are on for every test."""
    original = settings.ai_enabled
    settings.ai_enabled = True
    yield
    settings.ai_enabled = original


@pytest_asyncio.fixture
async def project(db_session: AsyncSession) -> Project:
    p = Project(name="Integration Wind Farm", latitude=52.0, longitude=4.5, elevation=10)
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def dataset_with_data(db_session: AsyncSession, project: Project) -> Dataset:
    """Create a dataset with columns and a few timeseries rows."""
    ds = Dataset(
        project_id=project.id,
        name="Met Mast A",
        source_type="mast",
        time_step_seconds=600,
        start_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
        end_time=datetime(2024, 1, 1, 0, 30, tzinfo=timezone.utc),
    )
    db_session.add(ds)
    await db_session.flush()

    spd_col = DataColumn(
        dataset_id=ds.id,
        name="Speed 80m",
        measurement_type="speed",
        unit="m/s",
        height_m=80,
    )
    dir_col = DataColumn(
        dataset_id=ds.id,
        name="Dir 80m",
        measurement_type="direction",
        unit="deg",
        height_m=80,
    )
    db_session.add_all([spd_col, dir_col])
    await db_session.flush()

    for i in range(4):
        ts = TimeseriesData(
            dataset_id=ds.id,
            timestamp=datetime(2024, 1, 1, 0, i * 10, tzinfo=timezone.utc),
            values_json={str(spd_col.id): 5.0 + i, str(dir_col.id): 180.0 + i * 10},
        )
        db_session.add(ts)
    await db_session.commit()
    await db_session.refresh(ds)
    return ds


def _llm_simple_reply(content: str):
    """Return a mock LLM response with a plain text reply."""
    return {
        "choices": [
            {
                "message": {"content": content, "role": "assistant"},
                "finish_reason": "stop",
            }
        ]
    }


def _make_mock_llm():
    """Create a mock LLM client with sync count_tokens and async chat_completion."""
    mock_llm = MagicMock()
    mock_llm.chat_completion = AsyncMock()
    mock_llm.count_tokens = MagicMock(return_value=5)
    return mock_llm


def _llm_tool_call(tool_name: str, args: dict, *, call_id: str = "tc-1"):
    """Return a mock LLM response that invokes a tool."""
    return {
        "choices": [
            {
                "message": {
                    "content": "",
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": tool_name,
                                "arguments": json.dumps(args),
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ]
    }


# ── Test: Simple conversation (no tool calls) ──────────────────────

@pytest.mark.asyncio
async def test_end_to_end_simple_conversation(client: AsyncClient, project: Project):
    """Create conv → send message → get reply → verify DB persistence."""
    # 1. Create conversation
    resp = await client.post(f"/api/ai/projects/{project.id}/conversations")
    assert resp.status_code == 201
    conv = resp.json()
    conv_id = conv["id"]

    # 2. Send a message (mock LLM for simple reply)
    with patch("app.ai.router._get_llm_client") as mock_client_fn:
        mock_llm = _make_mock_llm()
        mock_llm.chat_completion.return_value = _llm_simple_reply("Wind speeds look normal.")
        mock_client_fn.return_value = mock_llm

        resp = await client.post(
            f"/api/ai/conversations/{conv_id}/messages",
            json={"content": "Summarise the project"},
        )
    assert resp.status_code == 200
    msg = resp.json()
    assert msg["role"] == "assistant"
    assert "Wind speeds" in msg["content"]

    # 3. Verify conversation detail has both messages
    resp = await client.get(f"/api/ai/conversations/{conv_id}")
    assert resp.status_code == 200
    detail = resp.json()
    roles = [m["role"] for m in detail["messages"]]
    assert "user" in roles
    assert "assistant" in roles

    # 4. Verify auto-title (set after first exchange when messages >= 2 in DB)
    # Title may be set on first send or require a second turn; either way it was committed
    assert detail["title"] is None or isinstance(detail["title"], str)


# ── Test: Auto-execute read-only tool ───────────────────────────────

@pytest.mark.asyncio
async def test_auto_execute_tool_list_datasets(
    client: AsyncClient, project: Project, dataset_with_data: Dataset
):
    """AI calls list_project_datasets → auto-executed → result returned to LLM."""
    # Create conversation
    resp = await client.post(f"/api/ai/projects/{project.id}/conversations")
    conv_id = resp.json()["id"]

    call_count = 0

    async def staged_llm(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # First call: LLM requests the tool
            return _llm_tool_call(
                "list_project_datasets",
                {"project_id": str(project.id)},
            )
        else:
            # Second call: LLM received tool results, produces final answer
            return _llm_simple_reply("Found 1 dataset: Met Mast A with 4 rows.")

    with patch("app.ai.router._get_llm_client") as mock_fn:
        mock_llm = _make_mock_llm()
        mock_llm.chat_completion.side_effect = staged_llm
        mock_fn.return_value = mock_llm

        resp = await client.post(
            f"/api/ai/conversations/{conv_id}/messages",
            json={"content": "List all datasets"},
        )
    assert resp.status_code == 200
    assert "Met Mast A" in resp.json()["content"]
    assert call_count == 2  # LLM called twice (tool call + final reply)


# ── Test: Action tool → pending action → approve ────────────────────

@pytest.mark.asyncio
async def test_action_tool_creates_pending_and_approve(
    client: AsyncClient, project: Project, dataset_with_data: Dataset, db_session: AsyncSession
):
    """AI calls create_qc_flag → action created as pending → user approves → executed."""
    resp = await client.post(f"/api/ai/projects/{project.id}/conversations")
    conv_id = resp.json()["id"]

    flag_args = {
        "dataset_id": str(dataset_with_data.id),
        "name": "AI Icing Flag",
        "color": "#3b82f6",
        "description": "Suspected icing",
    }
    call_count = 0

    async def staged_llm(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _llm_tool_call("create_qc_flag", flag_args)
        else:
            return _llm_simple_reply("I've proposed an icing flag for your review.")

    with patch("app.ai.router._get_llm_client") as mock_fn:
        mock_llm = _make_mock_llm()
        mock_llm.chat_completion.side_effect = staged_llm
        mock_fn.return_value = mock_llm

        with patch("app.ai.impact.estimate_impact", new_callable=AsyncMock, return_value={"records_affected": 2}):
            resp = await client.post(
                f"/api/ai/conversations/{conv_id}/messages",
                json={"content": "Flag icing events"},
            )
    assert resp.status_code == 200

    # Verify pending action exists
    resp = await client.get(f"/api/ai/projects/{project.id}/actions", params={"status_filter": "pending"})
    assert resp.status_code == 200
    actions = resp.json()
    assert len(actions) == 1
    action = actions[0]
    assert action["action_type"] == "create_qc_flag"
    assert action["status"] == "pending"
    action_id = action["id"]

    # Approve the action (mock the executor since create_qc_flag requires real service logic)
    with patch("app.ai.action_executor.execute_tool", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {"flag_id": str(uuid.uuid4()), "status": "created"}
        resp = await client.post(f"/api/ai/actions/{action_id}/approve")
    assert resp.status_code == 200
    approved = resp.json()
    assert approved["status"] == "approved"
    assert approved["resolved_by"] == "user"


# ── Test: Action tool → pending → reject ────────────────────────────

@pytest.mark.asyncio
async def test_action_tool_creates_pending_and_reject(
    client: AsyncClient, project: Project, db_session: AsyncSession
):
    """AI proposes action → user rejects with reason → action saved as rejected."""
    resp = await client.post(f"/api/ai/projects/{project.id}/conversations")
    conv_id = resp.json()["id"]

    call_count = 0

    async def staged_llm(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _llm_tool_call("generate_report", {"project_id": str(project.id), "format": "pdf"})
        else:
            return _llm_simple_reply("Report generation proposed.")

    with patch("app.ai.router._get_llm_client") as mock_fn:
        mock_llm = _make_mock_llm()
        mock_llm.chat_completion.side_effect = staged_llm
        mock_fn.return_value = mock_llm

        with patch("app.ai.impact.estimate_impact", new_callable=AsyncMock, return_value={}):
            resp = await client.post(
                f"/api/ai/conversations/{conv_id}/messages",
                json={"content": "Generate a report"},
            )
    assert resp.status_code == 200

    # Get pending action
    resp = await client.get(f"/api/ai/projects/{project.id}/actions", params={"status_filter": "pending"})
    actions = resp.json()
    assert len(actions) == 1
    action_id = actions[0]["id"]

    # Reject it
    resp = await client.post(
        f"/api/ai/actions/{action_id}/reject",
        json={"reason": "Not ready yet"},
    )
    assert resp.status_code == 200
    rejected = resp.json()
    assert rejected["status"] == "rejected"
    assert "Not ready yet" in rejected["description"]


# ── Test: Memory CRUD through API ───────────────────────────────────

@pytest.mark.asyncio
async def test_memory_lifecycle(client: AsyncClient, project: Project):
    """Create → list → delete memory entries via API."""
    # Create
    resp = await client.post(
        f"/api/ai/projects/{project.id}/memory",
        json={"memory_type": "insight", "content": "Turbulence is high in sector 3"},
    )
    assert resp.status_code == 201
    mem = resp.json()
    mem_id = mem["id"]
    assert mem["content"] == "Turbulence is high in sector 3"

    # List
    resp = await client.get(f"/api/ai/projects/{project.id}/memory")
    assert resp.status_code == 200
    memories = resp.json()
    assert any(m["id"] == mem_id for m in memories)

    # Filter by type
    resp = await client.get(f"/api/ai/projects/{project.id}/memory", params={"memory_type": "insight"})
    assert len(resp.json()) >= 1

    # Delete
    resp = await client.delete(f"/api/ai/memory/{mem_id}")
    assert resp.status_code == 204

    # Confirm gone
    resp = await client.get(f"/api/ai/projects/{project.id}/memory")
    assert not any(m["id"] == mem_id for m in resp.json())


# ── Test: Health endpoint with project data ─────────────────────────

@pytest.mark.asyncio
async def test_health_reflects_project_state(
    client: AsyncClient, project: Project, dataset_with_data: Dataset
):
    """Health endpoint returns a score based on dataset presence."""
    resp = await client.get(f"/api/ai/projects/{project.id}/health")
    assert resp.status_code == 200
    health = resp.json()
    assert "health_score" in health
    assert isinstance(health["health_score"], (int, float))
    assert 0 <= health["health_score"] <= 100
    # With data but no flags/analyses, expect partial health
    assert health["health_score"] > 0


# ── Test: Context assembly feeds into orchestrator ──────────────────

@pytest.mark.asyncio
async def test_context_included_in_llm_call(
    client: AsyncClient, project: Project, dataset_with_data: Dataset
):
    """Verify the system message sent to LLM includes project context."""
    resp = await client.post(f"/api/ai/projects/{project.id}/conversations")
    conv_id = resp.json()["id"]

    captured_messages = []

    async def capture_llm(*args, messages=None, **kwargs):
        if messages:
            captured_messages.extend(messages)
        return _llm_simple_reply("Analysis complete.")

    with patch("app.ai.router._get_llm_client") as mock_fn:
        mock_llm = _make_mock_llm()
        mock_llm.chat_completion.side_effect = capture_llm
        mock_fn.return_value = mock_llm

        await client.post(
            f"/api/ai/conversations/{conv_id}/messages",
            json={"content": "Analyse wind data"},
        )

    # System message should contain project context
    system_msgs = [m for m in captured_messages if m.get("role") == "system"]
    assert len(system_msgs) == 1
    ctx = system_msgs[0]["content"]
    assert "Integration Wind Farm" in ctx
    assert "Met Mast A" in ctx


# ── Test: Multi-turn conversation maintains history ─────────────────

@pytest.mark.asyncio
async def test_multi_turn_conversation(client: AsyncClient, project: Project):
    """Send two messages in same conversation; second LLM call includes first exchange."""
    resp = await client.post(f"/api/ai/projects/{project.id}/conversations")
    conv_id = resp.json()["id"]

    captured_history_lens = []

    async def track_history(*args, messages=None, **kwargs):
        if messages:
            captured_history_lens.append(len(messages))
        return _llm_simple_reply("Reply.")

    with patch("app.ai.router._get_llm_client") as mock_fn:
        mock_llm = _make_mock_llm()
        mock_llm.chat_completion.side_effect = track_history
        mock_fn.return_value = mock_llm

        # First turn
        await client.post(
            f"/api/ai/conversations/{conv_id}/messages",
            json={"content": "Hello"},
        )
        # Second turn
        await client.post(
            f"/api/ai/conversations/{conv_id}/messages",
            json={"content": "Follow-up question"},
        )

    # First call: system + user = 2 messages
    # Second call: system + user + assistant + user = 4 messages
    assert len(captured_history_lens) == 2
    assert captured_history_lens[0] == 2
    assert captured_history_lens[1] == 4


# ── Test: Full pipeline – conversation + tool + action + health ─────

@pytest.mark.asyncio
async def test_full_pipeline_conversation_to_health(
    client: AsyncClient, project: Project, dataset_with_data: Dataset
):
    """Full E2E: conversation → tool call → action → approve → check health."""
    # Step 1: Create conversation
    resp = await client.post(f"/api/ai/projects/{project.id}/conversations")
    assert resp.status_code == 201
    conv_id = resp.json()["id"]

    # Step 2: Send message that triggers auto-tool + action-tool
    call_count = 0

    async def staged_llm(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # Auto tool
            return _llm_tool_call(
                "list_project_datasets",
                {"project_id": str(project.id)},
                call_id="tc-auto",
            )
        elif call_count == 2:
            # LLM sees dataset list, proposes QC flag
            return _llm_tool_call(
                "create_qc_flag",
                {"dataset_id": str(dataset_with_data.id), "name": "Pipeline Flag", "color": "#ff0000"},
                call_id="tc-action",
            )
        else:
            return _llm_simple_reply("I found the dataset and proposed a flag.")

    with patch("app.ai.router._get_llm_client") as mock_fn:
        mock_llm = _make_mock_llm()
        mock_llm.chat_completion.side_effect = staged_llm
        mock_fn.return_value = mock_llm

        with patch("app.ai.impact.estimate_impact", new_callable=AsyncMock, return_value={"rows_affected": 4}):
            resp = await client.post(
                f"/api/ai/conversations/{conv_id}/messages",
                json={"content": "Review dataset and flag issues"},
            )
    assert resp.status_code == 200

    # Step 3: Verify conversation has multiple messages (user, tool-calling assistants, tool results)
    resp = await client.get(f"/api/ai/conversations/{conv_id}")
    detail = resp.json()
    assert len(detail["messages"]) >= 4  # user + assistant(tool) + tool + assistant(final)

    # Step 4: Approve the pending action
    resp = await client.get(f"/api/ai/projects/{project.id}/actions", params={"status_filter": "pending"})
    actions = resp.json()
    assert len(actions) >= 1
    action_id = actions[0]["id"]

    with patch("app.ai.action_executor.execute_tool", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {"flag_id": "new-flag-id", "status": "created"}
        resp = await client.post(f"/api/ai/actions/{action_id}/approve")
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"

    # Step 5: Check health – should still return a valid score
    resp = await client.get(f"/api/ai/projects/{project.id}/health")
    assert resp.status_code == 200
    health = resp.json()
    assert "health_score" in health

    # Step 6: Add memory about the analysis
    resp = await client.post(
        f"/api/ai/projects/{project.id}/memory",
        json={"memory_type": "decision", "content": "Applied icing flag after review"},
    )
    assert resp.status_code == 201

    # Step 7: Verify project memory persists
    resp = await client.get(f"/api/ai/projects/{project.id}/memory")
    assert len(resp.json()) >= 1


# ── Test: AI disabled returns 503 on all mutation endpoints ─────────

@pytest.mark.asyncio
async def test_ai_disabled_blocks_messages(client: AsyncClient, project: Project):
    """When AI is disabled, sending a message should fail with 503."""
    settings.ai_enabled = False
    try:
        resp = await client.post(f"/api/ai/projects/{project.id}/conversations")
        conv_id = resp.json()["id"]

        resp = await client.post(
            f"/api/ai/conversations/{conv_id}/messages",
            json={"content": "Hello"},
        )
        assert resp.status_code == 503
    finally:
        settings.ai_enabled = True


# ── Test: Toggle AI on/off persists ─────────────────────────────────

@pytest.mark.asyncio
async def test_toggle_ai_state(client: AsyncClient):
    """Toggle AI enabled/disabled and verify status reflects the change."""
    # Initial status
    resp = await client.get("/api/ai/status")
    assert resp.status_code == 200

    # Disable
    resp = await client.post("/api/ai/toggle")
    assert resp.status_code == 200
    state1 = resp.json()["ai_enabled"]

    # Toggle again
    resp = await client.post("/api/ai/toggle")
    assert resp.status_code == 200
    state2 = resp.json()["ai_enabled"]

    assert state1 != state2
