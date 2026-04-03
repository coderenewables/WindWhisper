"""MCP agent – Measure-Correlate-Predict method recommendation and comparison."""

from __future__ import annotations

from app.ai.agents.base import BaseAgent


class MCPAgent(BaseAgent):
    name = "mcp"
    description = (
        "Assesses whether MCP is needed, identifies reference datasets, runs method "
        "comparisons with cross-validation, explains method stability and seasonal "
        "bias, and recommends the best approach for long-term wind speed adjustment."
    )
    prompt_file = "mcp_agent.md"
    allowed_tools = [
        "list_project_datasets",
        "get_dataset_summary",
        "get_data_statistics",
        "get_analysis_history",
        "run_mcp_comparison",
        "run_weibull_fit",
        "record_insight",
        "recall_project_memory",
    ]
