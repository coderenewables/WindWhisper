"""Import agent – interprets uploaded files and suggests column mappings."""

from __future__ import annotations

from app.ai.agents.base import BaseAgent


class ImportAgent(BaseAgent):
    name = "import"
    description = (
        "Interprets uploaded meteorological data files. Analyses detected column names, "
        "cross-references known logger naming conventions, identifies probable measurement "
        "types and sensor heights, and suggests corrections to column mappings."
    )
    prompt_file = "import_agent.md"
    allowed_tools = [
        "list_project_datasets",
        "get_dataset_summary",
        "get_data_statistics",
        "record_insight",
        "recall_project_memory",
    ]
