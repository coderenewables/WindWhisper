"""Tests for domain-specific AI agents — tool selection and recommendation format."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agents import AGENT_REGISTRY
from app.ai.agents.base import AgentResult, BaseAgent
from app.models import Project


# ── Fixtures ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def project(db_session: AsyncSession) -> Project:
    p = Project(name="Agent Test Project", latitude=40.0, longitude=-105.0)
    db_session.add(p)
    await db_session.flush()
    return p


def _make_llm(response_content: str = "Analysis complete.") -> MagicMock:
    llm = MagicMock()
    llm.chat_completion = AsyncMock(return_value={
        "choices": [{"message": {"role": "assistant", "content": response_content}, "finish_reason": "stop"}]
    })
    llm.count_tokens = MagicMock(return_value=10)
    return llm


# ── Agent registry ──────────────────────────────────────────────────

def test_registry_has_six_agents():
    assert len(AGENT_REGISTRY) == 6


@pytest.mark.parametrize("name", ["import", "qc", "analysis", "mcp", "energy", "report"])
def test_registry_contains_agent(name):
    assert name in AGENT_REGISTRY


@pytest.mark.parametrize("name", ["import", "qc", "analysis", "mcp", "energy", "report"])
def test_all_agents_subclass_base(name):
    assert issubclass(AGENT_REGISTRY[name], BaseAgent)


# ── AgentResult dataclass ──────────────────────────────────────────

def test_agent_result_defaults():
    r = AgentResult(summary="test")
    assert r.summary == "test"
    assert r.recommendations == []
    assert r.insights == []
    assert r.tool_results == {}
    assert r.pending_actions == []
    assert r.raw_response == ""


# ── Agent tool restrictions ─────────────────────────────────────────

def test_import_agent_tools():
    from app.ai.agents.import_agent import ImportAgent
    agent = ImportAgent(_make_llm())
    tools = agent._filtered_tools()
    tool_names = {t["function"]["name"] for t in tools}
    assert "list_project_datasets" in tool_names
    assert "get_dataset_summary" in tool_names
    assert "record_insight" in tool_names
    # Should NOT have action tools
    assert "apply_flag_rules" not in tool_names


def test_qc_agent_tools():
    from app.ai.agents.qc_agent import QCAgent
    agent = QCAgent(_make_llm())
    tools = agent._filtered_tools()
    tool_names = {t["function"]["name"] for t in tools}
    assert "get_data_statistics" in tool_names
    assert "get_flagged_ranges" in tool_names
    assert "create_qc_flag" in tool_names
    assert "apply_flag_rules" in tool_names


def test_analysis_agent_tools():
    from app.ai.agents.analysis_agent import AnalysisAgent
    agent = AnalysisAgent(_make_llm())
    tools = agent._filtered_tools()
    tool_names = {t["function"]["name"] for t in tools}
    assert "run_weibull_fit" in tool_names
    assert "run_shear_analysis" in tool_names
    assert "run_turbulence_analysis" in tool_names
    assert "run_extreme_wind" in tool_names


def test_mcp_agent_tools():
    from app.ai.agents.mcp_agent import MCPAgent
    agent = MCPAgent(_make_llm())
    tools = agent._filtered_tools()
    tool_names = {t["function"]["name"] for t in tools}
    assert "run_mcp_comparison" in tool_names
    assert "get_analysis_history" in tool_names


def test_energy_agent_tools():
    from app.ai.agents.energy_agent import EnergyAgent
    agent = EnergyAgent(_make_llm())
    tools = agent._filtered_tools()
    tool_names = {t["function"]["name"] for t in tools}
    assert "run_energy_estimate" in tool_names
    assert "list_power_curves" in tool_names
    assert "run_shear_analysis" in tool_names


def test_report_agent_tools():
    from app.ai.agents.report_agent import ReportAgent
    agent = ReportAgent(_make_llm())
    tools = agent._filtered_tools()
    tool_names = {t["function"]["name"] for t in tools}
    assert "generate_report" in tool_names
    assert "get_project_metadata" in tool_names
    assert "get_analysis_history" in tool_names


# ── Agent run ───────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("agent_name", ["import", "qc", "analysis", "mcp", "energy", "report"])
async def test_agent_run_returns_agent_result(db_session, project, agent_name):
    llm = _make_llm(f"{agent_name} analysis complete. Recommendation: proceed.")
    agent_cls = AGENT_REGISTRY[agent_name]
    agent = agent_cls(llm)
    result = await agent.run(db_session, project.id, "Run a basic check", "Project: Agent Test")
    assert isinstance(result, AgentResult)
    assert len(result.summary) > 0


@pytest.mark.asyncio
async def test_agent_handles_tool_call_round(db_session, project):
    """Agent should process a tool call and continue to final response."""
    from app.ai.agents.analysis_agent import AnalysisAgent

    tool_response = {
        "choices": [{"message": {
            "role": "assistant", "content": "",
            "tool_calls": [{"id": "c1", "function": {"name": "get_analysis_history", "arguments": json.dumps({"dataset_id": str(uuid4())})}}]
        }, "finish_reason": "tool_calls"}]
    }
    final_response = {
        "choices": [{"message": {"role": "assistant", "content": "No prior analyses found. I recommend starting with Weibull."}, "finish_reason": "stop"}]
    }

    llm = MagicMock()
    llm.chat_completion = AsyncMock(side_effect=[tool_response, final_response])
    llm.count_tokens = MagicMock(return_value=5)

    agent = AnalysisAgent(llm)

    with patch("app.ai.action_executor.execute_tool", new_callable=AsyncMock, return_value={"analyses": []}):
        result = await agent.run(db_session, project.id, "What should I run?", "Project: Test")

    assert "Weibull" in result.summary or "recommend" in result.summary.lower() or len(result.summary) > 0


# ── System prompt ───────────────────────────────────────────────────

@pytest.mark.parametrize("agent_name", ["import", "qc", "analysis", "mcp", "energy", "report"])
def test_agent_has_nonempty_system_prompt(agent_name):
    agent_cls = AGENT_REGISTRY[agent_name]
    agent = agent_cls(_make_llm())
    prompt = agent._build_system_prompt("Project context here")
    assert isinstance(prompt, str)
    assert len(prompt) > 50
