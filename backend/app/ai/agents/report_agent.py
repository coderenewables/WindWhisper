"""Report agent – narrative generation and report assembly."""

from __future__ import annotations

from app.ai.agents.base import BaseAgent


class ReportAgent(BaseAgent):
    name = "report"
    description = (
        "Generates natural-language section narratives for wind resource reports, "
        "assembles assumption tables from analysis provenance, adjusts tone for "
        "different audiences, and identifies analysis gaps before reporting."
    )
    prompt_file = "report_agent.md"
    allowed_tools = [
        "list_project_datasets",
        "get_dataset_summary",
        "get_project_metadata",
        "get_analysis_history",
        "generate_report",
        "record_insight",
        "recall_project_memory",
    ]
