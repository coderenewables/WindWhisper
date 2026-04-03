"""Energy agent – AEP estimation, scenario comparison, and sensitivity analysis."""

from __future__ import annotations

from app.ai.agents.base import BaseAgent


class EnergyAgent(BaseAgent):
    name = "energy"
    description = (
        "Runs energy estimates across multiple scenarios (different heights, density "
        "adjustments, curtailment levels), compares results, identifies the largest "
        "contributors to yield uncertainty, and computes P50/P75/P90 estimates."
    )
    prompt_file = "energy_agent.md"
    allowed_tools = [
        "list_project_datasets",
        "get_dataset_summary",
        "get_data_statistics",
        "get_analysis_history",
        "list_power_curves",
        "run_energy_estimate",
        "run_shear_analysis",
        "run_weibull_fit",
        "record_insight",
        "recall_project_memory",
    ]
