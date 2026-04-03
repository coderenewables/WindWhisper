"""QC agent – anomaly detection and quality control recommendations."""

from __future__ import annotations

from app.ai.agents.base import BaseAgent


class QCAgent(BaseAgent):
    name = "qc"
    description = (
        "Reviews meteorological data for quality issues. Detects icing, tower shadow, "
        "flat-lining, spikes, sensor drift, and swaps. Estimates downstream impact of "
        "QC recommendations and groups them by severity."
    )
    prompt_file = "qc_agent.md"
    allowed_tools = [
        "get_dataset_summary",
        "get_data_statistics",
        "get_flagged_ranges",
        "get_analysis_history",
        "run_weibull_fit",
        "run_shear_analysis",
        "run_turbulence_analysis",
        "create_qc_flag",
        "apply_flag_rules",
        "record_insight",
        "recall_project_memory",
    ]
