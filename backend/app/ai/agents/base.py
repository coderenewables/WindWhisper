"""Abstract base class for domain-specific AI agents."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_client import LLMClient
from app.ai.tools import ALL_TOOLS, TOOL_CATEGORIES, TOOL_CATEGORY_ACTION

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
MAX_AGENT_ROUNDS = 6


@dataclass
class AgentResult:
    """Structured output from a domain agent run."""

    summary: str
    recommendations: list[dict[str, Any]] = field(default_factory=list)
    insights: list[str] = field(default_factory=list)
    tool_results: dict[str, Any] = field(default_factory=dict)
    pending_actions: list[Any] = field(default_factory=list)
    raw_response: str = ""


class BaseAgent:
    """Base class for domain-specific AI agents.

    Each agent has:
    - A name and purpose description
    - A focused system prompt with domain expertise
    - A restricted set of tools it can use
    - A run() method that executes the agent on a given task
    """

    name: str = "base"
    description: str = "Base agent"
    prompt_file: str = ""  # filename inside backend/app/ai/prompts/
    allowed_tools: list[str] = []

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run(
        self,
        db: AsyncSession,
        project_id: UUID,
        task_description: str,
        context: str,
    ) -> AgentResult:
        """Execute the agent for a specific task.

        Parameters
        ----------
        db : AsyncSession
        project_id : UUID of the active project
        task_description : natural-language description of what the user/orchestrator wants
        context : pre-assembled project context string
        """
        system_prompt = self._build_system_prompt(context)
        tools = self._filtered_tools()
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": task_description},
        ]

        pending_actions: list[Any] = []
        tool_results: dict[str, Any] = {}

        for _round in range(MAX_AGENT_ROUNDS):
            response = await self.llm.chat_completion(
                messages=messages, tools=tools or None, temperature=0.1,
            )
            choice = response["choices"][0]
            message = choice["message"]
            finish_reason = choice.get("finish_reason", "stop")

            if finish_reason == "tool_calls" or message.get("tool_calls"):
                tool_calls = message["tool_calls"]
                messages.append({
                    "role": "assistant",
                    "content": message.get("content", ""),
                    "tool_calls": tool_calls,
                })

                for tc in tool_calls:
                    fn_name = tc["function"]["name"]
                    fn_args = (
                        json.loads(tc["function"]["arguments"])
                        if isinstance(tc["function"]["arguments"], str)
                        else tc["function"]["arguments"]
                    )
                    category = TOOL_CATEGORIES.get(fn_name, "auto")

                    if category == TOOL_CATEGORY_ACTION:
                        # Action tools create pending records
                        from app.models.ai import AiAction

                        action = AiAction(
                            project_id=project_id,
                            action_type=fn_name,
                            title=fn_name.replace("_", " ").title(),
                            description=message.get("content", ""),
                            reasoning=f"[{self.name} agent] {json.dumps(fn_args)}",
                            payload=fn_args,
                            status="pending",
                        )
                        db.add(action)
                        await db.flush()
                        pending_actions.append(action)
                        result_str = json.dumps({
                            "status": "pending_approval",
                            "action_id": str(action.id),
                            "message": "This action requires user approval.",
                        })
                    else:
                        from app.ai.action_executor import execute_tool

                        try:
                            result = await execute_tool(db, fn_name, fn_args)
                            tool_results[fn_name] = result
                            result_str = json.dumps(result, default=str)
                        except Exception as exc:
                            logger.exception("Agent %s tool %s failed", self.name, fn_name)
                            result_str = json.dumps({"error": str(exc)})

                    messages.append({
                        "role": "tool",
                        "content": result_str,
                        "tool_call_id": tc["id"],
                    })
                continue

            # Final assistant response
            assistant_text = message.get("content", "")
            return AgentResult(
                summary=assistant_text,
                recommendations=self._extract_recommendations(assistant_text),
                insights=self._extract_insights(assistant_text),
                tool_results=tool_results,
                pending_actions=pending_actions,
                raw_response=assistant_text,
            )

        return AgentResult(
            summary="Agent reached maximum reasoning rounds.",
            tool_results=tool_results,
            pending_actions=pending_actions,
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _build_system_prompt(self, context: str) -> str:
        """Load the prompt file and inject project context."""
        base_prompt = self._load_prompt_file()
        return f"{base_prompt}\n\n## Current Project Context\n{context}"

    def _load_prompt_file(self) -> str:
        """Read the .md prompt file for this agent."""
        if not self.prompt_file:
            return f"You are the {self.name} agent for GoKaatru wind resource assessment platform."
        path = PROMPTS_DIR / self.prompt_file
        if path.exists():
            return path.read_text(encoding="utf-8")
        logger.warning("Prompt file not found: %s", path)
        return f"You are the {self.name} agent for GoKaatru wind resource assessment platform."

    def _filtered_tools(self) -> list[dict]:
        """Return only the tools in allowed_tools."""
        if not self.allowed_tools:
            return []
        return [t for t in ALL_TOOLS if t["function"]["name"] in self.allowed_tools]

    @staticmethod
    def _extract_recommendations(text: str) -> list[dict[str, Any]]:
        """Simple heuristic: lines starting with '- **' or '- Recommend' are recommendations."""
        recs: list[dict[str, Any]] = []
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped.startswith("- **") or stripped.lower().startswith("- recommend"):
                recs.append({"text": stripped.lstrip("- ").strip()})
        return recs

    @staticmethod
    def _extract_insights(text: str) -> list[str]:
        """Simple heuristic: lines starting with '> ' or '⚠' are insights."""
        insights: list[str] = []
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped.startswith("> ") or stripped.startswith("⚠") or stripped.startswith("ℹ"):
                insights.append(stripped)
        return insights
