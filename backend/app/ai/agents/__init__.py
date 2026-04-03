"""Domain-specific AI agents for GoKaatru v2."""

from app.ai.agents.base import BaseAgent
from app.ai.agents.import_agent import ImportAgent
from app.ai.agents.qc_agent import QCAgent
from app.ai.agents.analysis_agent import AnalysisAgent
from app.ai.agents.mcp_agent import MCPAgent
from app.ai.agents.energy_agent import EnergyAgent
from app.ai.agents.report_agent import ReportAgent

AGENT_REGISTRY: dict[str, type[BaseAgent]] = {
    "import": ImportAgent,
    "qc": QCAgent,
    "analysis": AnalysisAgent,
    "mcp": MCPAgent,
    "energy": EnergyAgent,
    "report": ReportAgent,
}

__all__ = [
    "BaseAgent",
    "ImportAgent",
    "QCAgent",
    "AnalysisAgent",
    "MCPAgent",
    "EnergyAgent",
    "ReportAgent",
    "AGENT_REGISTRY",
]
