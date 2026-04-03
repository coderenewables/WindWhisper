"""Tests for the AI orchestrator — tool dispatch loop, action creation, approval/rejection."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dataset, Project
from app.models.ai import AiAction, AiConversation, AiMessage


# ── Fixtures ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def project(db_session: AsyncSession) -> Project:
    p = Project(name="Orchestrator Test", latitude=40.0, longitude=-105.0)
    db_session.add(p)
    await db_session.flush()
    return p


@pytest_asyncio.fixture
async def dataset(db_session: AsyncSession, project: Project) -> Dataset:
    ds = Dataset(project_id=project.id, name="Test DS", source_type="met_tower",
                 start_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
                 end_time=datetime(2025, 1, 1, tzinfo=timezone.utc))
    db_session.add(ds)
    await db_session.flush()
    return ds


@pytest_asyncio.fixture
async def conversation(db_session: AsyncSession, project: Project) -> AiConversation:
    conv = AiConversation(project_id=project.id, title="Test Conv")
    db_session.add(conv)
    await db_session.flush()
    # Eager-load the messages relationship for the orchestrator
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    result = await db_session.execute(
        select(AiConversation)
        .where(AiConversation.id == conv.id)
        .options(selectinload(AiConversation.messages))
    )
    return result.scalars().one()


def _make_llm_mock(responses: list[dict]) -> MagicMock:
    """Create a mock LLMClient that returns a sequence of chat_completion responses."""
    llm = MagicMock()
    llm.chat_completion = AsyncMock(side_effect=responses)
    llm.count_tokens = MagicMock(return_value=10)
    return llm


def _simple_response(content: str) -> dict:
    return {"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": "stop"}]}


def _tool_call_response(tool_name: str, tool_args: dict, call_id: str = "call_1") -> dict:
    return {"choices": [{"message": {
        "role": "assistant", "content": "",
        "tool_calls": [{"id": call_id, "function": {"name": tool_name, "arguments": json.dumps(tool_args)}}],
    }, "finish_reason": "tool_calls"}]}


# ── run_conversation_turn ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_simple_turn_returns_content(db_session, project, conversation):
    from app.ai.orchestrator import run_conversation_turn
    llm = _make_llm_mock([_simple_response("Hello from AI")])

    content, actions = await run_conversation_turn(db_session, llm, project.id, conversation, "Hi")

    assert content == "Hello from AI"
    assert actions == []
    llm.chat_completion.assert_awaited_once()


@pytest.mark.asyncio
async def test_tool_call_auto_executes_inspection(db_session, project, conversation, dataset):
    from app.ai.orchestrator import run_conversation_turn
    llm = _make_llm_mock([
        _tool_call_response("get_project_metadata", {"project_id": str(project.id)}),
        _simple_response("Your project is called Orchestrator Test"),
    ])

    content, actions = await run_conversation_turn(db_session, llm, project.id, conversation, "Tell me about this project")

    assert "Orchestrator Test" in content
    assert actions == []
    assert llm.chat_completion.await_count == 2


@pytest.mark.asyncio
async def test_action_tool_creates_pending_action(db_session, project, conversation, dataset):
    from app.ai.orchestrator import run_conversation_turn

    tool_args = {"dataset_id": str(dataset.id), "flag_name": "Icing", "rules": []}
    llm = _make_llm_mock([
        _tool_call_response("create_qc_flag", tool_args),
        _simple_response("I recommend creating an icing flag. Awaiting your approval."),
    ])

    with patch("app.ai.impact.estimate_impact", new_callable=AsyncMock, return_value={"affected_metrics": [], "data_affected_pct": 0, "confidence": "low"}):
        content, actions = await run_conversation_turn(db_session, llm, project.id, conversation, "Check icing")

    assert len(actions) == 1
    assert actions[0].action_type == "create_qc_flag"
    assert actions[0].status == "pending"
    assert actions[0].payload["flag_name"] == "Icing"


@pytest.mark.asyncio
async def test_max_rounds_limit(db_session, project, conversation, dataset):
    from app.ai.orchestrator import run_conversation_turn, MAX_TOOL_ROUNDS

    # Create a response that always calls a tool (infinite loop scenario)
    tool_resp = _tool_call_response("get_project_metadata", {"project_id": str(project.id)})
    llm = _make_llm_mock([tool_resp] * (MAX_TOOL_ROUNDS + 5))

    content, actions = await run_conversation_turn(db_session, llm, project.id, conversation, "Loop test")

    assert "maximum reasoning steps" in content.lower()
    assert llm.chat_completion.await_count == MAX_TOOL_ROUNDS


@pytest.mark.asyncio
async def test_messages_are_persisted(db_session, project, conversation):
    from app.ai.orchestrator import run_conversation_turn
    from sqlalchemy import select

    llm = _make_llm_mock([_simple_response("Persisted reply")])
    await run_conversation_turn(db_session, llm, project.id, conversation, "Save this")

    msgs = (await db_session.execute(
        select(AiMessage).where(AiMessage.conversation_id == conversation.id)
    )).scalars().all()
    assert len(msgs) >= 2
    roles = {m.role for m in msgs}
    assert "user" in roles
    assert "assistant" in roles


# ── run_agent ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_agent_unknown_agent(db_session, project):
    from app.ai.orchestrator import run_agent
    llm = MagicMock()
    result = await run_agent(db_session, llm, project.id, "nonexistent", "do something")
    assert "error" in result
    assert "nonexistent" in result["error"]


@pytest.mark.asyncio
async def test_run_agent_valid_agent(db_session, project):
    from app.ai.orchestrator import run_agent
    from app.ai.agents.base import AgentResult

    mock_result = AgentResult(summary="Done", recommendations=[{"type": "test"}], insights=["insight1"])

    llm = MagicMock()

    with patch("app.ai.agents.import_agent.ImportAgent.run", new_callable=AsyncMock, return_value=mock_result):
        result = await run_agent(db_session, llm, project.id, "import", "Interpret uploaded file")

    assert result["agent"] == "import"
    assert result["summary"] == "Done"
    assert len(result["recommendations"]) == 1
    assert "insight1" in result["insights"]
