"""OpenAI-compatible function-calling tool definitions.

Each tool maps to an existing GoKaatru service function.
Categories: inspection (auto-run), analysis (auto-run, read-only), action (requires approval), reasoning (internal).
"""

from __future__ import annotations

TOOL_CATEGORY_AUTO = "auto"        # executed immediately
TOOL_CATEGORY_ACTION = "action"    # requires user approval
TOOL_CATEGORY_REASONING = "reasoning"

# Tool metadata (name → category)
TOOL_CATEGORIES: dict[str, str] = {}


def _t(name: str, description: str, parameters: dict, category: str = TOOL_CATEGORY_AUTO) -> dict:
    """Helper to build an OpenAI-compatible tool dict and register its category."""
    TOOL_CATEGORIES[name] = category
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": parameters,
        },
    }


# ── Data Inspection (read-only, auto-execute) ──────────────────────────

INSPECT_TOOLS: list[dict] = [
    _t("list_project_datasets", "List all datasets in a project with column info, row counts, and date ranges.", {
        "type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"],
    }),
    _t("get_dataset_summary", "Get detailed dataset info: columns with types/heights, row count, date range, data recovery %.", {
        "type": "object", "properties": {"dataset_id": {"type": "string"}}, "required": ["dataset_id"],
    }),
    _t("get_data_statistics", "Per-column statistics: mean, std, min, max, null count, recovery %.", {
        "type": "object", "properties": {"dataset_id": {"type": "string"}}, "required": ["dataset_id"],
    }),
    _t("get_flagged_ranges", "List all QC flagged ranges for a dataset.", {
        "type": "object", "properties": {"dataset_id": {"type": "string"}}, "required": ["dataset_id"],
    }),
    _t("get_analysis_history", "List previously-run analyses and key results for a dataset.", {
        "type": "object", "properties": {"dataset_id": {"type": "string"}}, "required": ["dataset_id"],
    }),
    _t("get_project_metadata", "Get project name, coordinates, elevation, and dataset count.", {
        "type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"],
    }),
    _t("list_power_curves", "List all saved power curves in the library.", {
        "type": "object", "properties": {}, "required": [],
    }),
]

# ── Analysis (compute, auto-execute, results only) ─────────────────────

ANALYSIS_TOOLS: list[dict] = [
    _t("run_weibull_fit", "Fit a Weibull distribution to wind speed data. Returns k, A, mean speed, R².", {
        "type": "object",
        "properties": {
            "dataset_id": {"type": "string"},
            "column_id": {"type": "string"},
            "exclude_flags": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["dataset_id", "column_id"],
    }),
    _t("run_shear_analysis", "Compute vertical wind shear profile between measurement heights.", {
        "type": "object",
        "properties": {
            "dataset_id": {"type": "string"},
            "method": {"type": "string", "enum": ["power", "log"]},
            "target_height": {"type": "number"},
            "exclude_flags": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["dataset_id"],
    }),
    _t("run_turbulence_analysis", "Compute turbulence intensity by speed bin with IEC classification.", {
        "type": "object",
        "properties": {
            "dataset_id": {"type": "string"},
            "speed_column_id": {"type": "string"},
            "sd_column_id": {"type": "string"},
            "exclude_flags": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["dataset_id", "speed_column_id", "sd_column_id"],
    }),
    _t("run_extreme_wind", "Extreme wind analysis: Gumbel fit, return periods, V_e50.", {
        "type": "object",
        "properties": {
            "dataset_id": {"type": "string"},
            "speed_column_id": {"type": "string"},
            "gust_column_id": {"type": "string"},
            "exclude_flags": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["dataset_id", "speed_column_id"],
    }),
    _t("run_mcp_comparison", "Run all MCP methods, cross-validate, and rank by uncertainty.", {
        "type": "object",
        "properties": {
            "site_dataset_id": {"type": "string"},
            "site_column_id": {"type": "string"},
            "ref_dataset_id": {"type": "string"},
            "ref_column_id": {"type": "string"},
            "methods": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["site_dataset_id", "site_column_id", "ref_dataset_id", "ref_column_id"],
    }),
    _t("run_energy_estimate", "Compute gross AEP from wind speed data and a power curve.", {
        "type": "object",
        "properties": {
            "dataset_id": {"type": "string"},
            "speed_column_id": {"type": "string"},
            "power_curve_id": {"type": "string"},
            "density_adjusted": {"type": "boolean"},
            "exclude_flags": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["dataset_id", "speed_column_id", "power_curve_id"],
    }),
]

# ── Action (mutate state — ALWAYS requires user approval) ──────────────

ACTION_TOOLS: list[dict] = [
    _t("create_qc_flag", "Create a new QC flag with rules for a dataset.", {
        "type": "object",
        "properties": {
            "dataset_id": {"type": "string"},
            "flag_name": {"type": "string"},
            "flag_color": {"type": "string"},
            "rules": {"type": "array", "items": {"type": "object"}},
        },
        "required": ["dataset_id", "flag_name", "rules"],
    }, category=TOOL_CATEGORY_ACTION),
    _t("apply_flag_rules", "Execute flag rules and generate flagged ranges.", {
        "type": "object",
        "properties": {"dataset_id": {"type": "string"}, "flag_id": {"type": "string"}},
        "required": ["dataset_id", "flag_id"],
    }, category=TOOL_CATEGORY_ACTION),
    _t("generate_report", "Generate a PDF or DOCX wind resource report.", {
        "type": "object",
        "properties": {
            "project_id": {"type": "string"},
            "dataset_id": {"type": "string"},
            "format": {"type": "string", "enum": ["pdf", "docx"]},
            "sections": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["project_id", "dataset_id", "format"],
    }, category=TOOL_CATEGORY_ACTION),
]

# ── Reasoning (AI-internal) ────────────────────────────────────────────

REASONING_TOOLS: list[dict] = [
    _t("record_insight", "Store a project insight or finding in project memory.", {
        "type": "object",
        "properties": {
            "project_id": {"type": "string"},
            "category": {"type": "string"},
            "content": {"type": "string"},
        },
        "required": ["project_id", "content"],
    }, category=TOOL_CATEGORY_REASONING),
    _t("recall_project_memory", "Retrieve relevant project memories.", {
        "type": "object",
        "properties": {"project_id": {"type": "string"}, "memory_types": {"type": "array", "items": {"type": "string"}}},
        "required": ["project_id"],
    }, category=TOOL_CATEGORY_REASONING),
    _t("delegate_to_agent", "Delegate a task to a domain-specific agent. Agents: import (file interpretation), qc (anomaly detection), analysis (method selection & interpretation), mcp (long-term adjustment), energy (AEP scenarios), report (narrative generation). Use when the task requires deep domain expertise.", {
        "type": "object",
        "properties": {
            "agent_name": {"type": "string", "enum": ["import", "qc", "analysis", "mcp", "energy", "report"],
                           "description": "The domain agent to delegate to."},
            "project_id": {"type": "string", "description": "Project UUID."},
            "task_description": {"type": "string", "description": "Detailed description of what the agent should do."},
        },
        "required": ["agent_name", "project_id", "task_description"],
    }, category=TOOL_CATEGORY_REASONING),
    _t("estimate_downstream_impact", "Estimate how an AI action (e.g., applying a QC flag, changing MCP method, or adjusting shear) will affect downstream analysis results such as mean speed, Weibull parameters, turbulence intensity, and AEP. Returns a structured before/after comparison.", {
        "type": "object",
        "properties": {
            "action_id": {"type": "string", "description": "UUID of the pending AiAction to estimate impact for."},
        },
        "required": ["action_id"],
    }, category=TOOL_CATEGORY_REASONING),
]

ALL_TOOLS = INSPECT_TOOLS + ANALYSIS_TOOLS + ACTION_TOOLS + REASONING_TOOLS
