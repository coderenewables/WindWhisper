"""Analysis agent – analysis method selection, execution, and interpretation."""

from __future__ import annotations

from app.ai.agents.base import BaseAgent


class AnalysisAgent(BaseAgent):
    name = "analysis"
    description = (
        "Examines the current analysis state, suggests a logical analysis sequence, "
        "runs analyses, and interprets results with wind-energy domain context. "
        "Identifies inconsistencies and flags low-confidence results."
    )
    prompt_file = "analysis_agent.md"
    allowed_tools = [
        "list_project_datasets",
        "get_dataset_summary",
        "get_data_statistics",
        "get_analysis_history",
        "run_weibull_fit",
        "run_shear_analysis",
        "run_turbulence_analysis",
        "run_extreme_wind",
        "record_insight",
        "recall_project_memory",
    ]
