"""Tests for AI tool definitions (function-calling schema validation)."""

from __future__ import annotations

import json

import pytest

from app.ai.tools import (
    ACTION_TOOLS,
    ALL_TOOLS,
    ANALYSIS_TOOLS,
    INSPECT_TOOLS,
    REASONING_TOOLS,
    TOOL_CATEGORIES,
    TOOL_CATEGORY_ACTION,
    TOOL_CATEGORY_AUTO,
    TOOL_CATEGORY_REASONING,
)


# ── Tool schema structure ───────────────────────────────────────────

def test_all_tools_is_complete():
    assert len(ALL_TOOLS) == len(INSPECT_TOOLS) + len(ANALYSIS_TOOLS) + len(ACTION_TOOLS) + len(REASONING_TOOLS)
    assert len(ALL_TOOLS) == 20


def test_tool_names_are_unique():
    names = [t["function"]["name"] for t in ALL_TOOLS]
    assert len(names) == len(set(names)), f"Duplicate tool names: {[n for n in names if names.count(n) > 1]}"


@pytest.mark.parametrize("tool", ALL_TOOLS, ids=lambda t: t["function"]["name"])
def test_tool_has_valid_openai_schema(tool):
    """Each tool must have type=function and a function with name, description, parameters."""
    assert tool["type"] == "function"
    fn = tool["function"]
    assert "name" in fn
    assert isinstance(fn["name"], str)
    assert len(fn["name"]) > 0
    assert "description" in fn
    assert isinstance(fn["description"], str)
    assert len(fn["description"]) > 10, f"Tool '{fn['name']}' has a too-short description"
    assert "parameters" in fn
    params = fn["parameters"]
    assert params.get("type") == "object"
    assert "properties" in params
    assert "required" in params


@pytest.mark.parametrize("tool", ALL_TOOLS, ids=lambda t: t["function"]["name"])
def test_tool_has_category(tool):
    name = tool["function"]["name"]
    assert name in TOOL_CATEGORIES, f"Tool '{name}' has no category registered"


@pytest.mark.parametrize("tool", ALL_TOOLS, ids=lambda t: t["function"]["name"])
def test_tool_is_json_serializable(tool):
    """Tool schemas must be JSON-serializable for the LLM API."""
    serialized = json.dumps(tool)
    parsed = json.loads(serialized)
    assert parsed["function"]["name"] == tool["function"]["name"]


# ── Category checks ─────────────────────────────────────────────────

def test_inspect_tools_are_auto():
    for tool in INSPECT_TOOLS:
        name = tool["function"]["name"]
        assert TOOL_CATEGORIES[name] == TOOL_CATEGORY_AUTO, f"Inspect tool '{name}' should be auto"


def test_analysis_tools_are_auto():
    for tool in ANALYSIS_TOOLS:
        name = tool["function"]["name"]
        assert TOOL_CATEGORIES[name] == TOOL_CATEGORY_AUTO, f"Analysis tool '{name}' should be auto"


def test_action_tools_require_approval():
    for tool in ACTION_TOOLS:
        name = tool["function"]["name"]
        assert TOOL_CATEGORIES[name] == TOOL_CATEGORY_ACTION, f"Action tool '{name}' should require approval"


def test_reasoning_tools_are_reasoning():
    for tool in REASONING_TOOLS:
        name = tool["function"]["name"]
        assert TOOL_CATEGORIES[name] == TOOL_CATEGORY_REASONING, f"Reasoning tool '{name}' should be reasoning"


# ── Specific tool schema checks ─────────────────────────────────────

def test_list_project_datasets_requires_project_id():
    tool = _find_tool("list_project_datasets")
    assert "project_id" in tool["function"]["parameters"]["required"]


def test_run_weibull_fit_requires_dataset_and_column():
    tool = _find_tool("run_weibull_fit")
    req = tool["function"]["parameters"]["required"]
    assert "dataset_id" in req
    assert "column_id" in req


def test_create_qc_flag_requires_name_and_rules():
    tool = _find_tool("create_qc_flag")
    req = tool["function"]["parameters"]["required"]
    assert "dataset_id" in req
    assert "flag_name" in req
    assert "rules" in req


def test_run_mcp_comparison_requires_site_and_ref():
    tool = _find_tool("run_mcp_comparison")
    req = tool["function"]["parameters"]["required"]
    assert "site_dataset_id" in req
    assert "ref_dataset_id" in req
    assert "site_column_id" in req
    assert "ref_column_id" in req


def test_run_energy_estimate_requires_power_curve():
    tool = _find_tool("run_energy_estimate")
    req = tool["function"]["parameters"]["required"]
    assert "power_curve_id" in req


def test_delegate_to_agent_has_enum():
    tool = _find_tool("delegate_to_agent")
    agent_prop = tool["function"]["parameters"]["properties"]["agent_name"]
    assert "enum" in agent_prop
    expected_agents = {"import", "qc", "analysis", "mcp", "energy", "report"}
    assert set(agent_prop["enum"]) == expected_agents


def test_generate_report_has_format_enum():
    tool = _find_tool("generate_report")
    fmt = tool["function"]["parameters"]["properties"]["format"]
    assert set(fmt["enum"]) == {"pdf", "docx"}


# ── Dispatch table coverage ─────────────────────────────────────────

def test_all_tools_have_executor_handler():
    """Every tool defined in tools.py should have a handler in action_executor.py."""
    from app.ai.action_executor import execute_tool
    import inspect
    source = inspect.getsource(execute_tool)
    for tool in ALL_TOOLS:
        name = tool["function"]["name"]
        assert f'"{name}"' in source, f"Tool '{name}' has no handler in execute_tool dispatch"


# ── Helpers ──────────────────────────────────────────────────────────

def _find_tool(name: str) -> dict:
    for tool in ALL_TOOLS:
        if tool["function"]["name"] == name:
            return tool
    raise ValueError(f"Tool '{name}' not found")
