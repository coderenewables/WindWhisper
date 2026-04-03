"""Central AI orchestrator – routes user messages through LLM reasoning loop."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.context import assemble_project_context
from app.ai.llm_client import LLMClient
from app.ai.tools import ALL_TOOLS, TOOL_CATEGORIES, TOOL_CATEGORY_ACTION

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


def _load_system_prompt() -> str:
    """Load orchestrator system prompt from .md file, with inline fallback."""
    path = PROMPTS_DIR / "orchestrator.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return (
        "You are GoKaatru AI, an expert wind resource assessment assistant. "
        "You help engineers analyse meteorological data, perform QC, run analyses, "
        "and make informed decisions."
    )


MAX_TOOL_ROUNDS = 8


async def run_conversation_turn(
    db: AsyncSession,
    llm: LLMClient,
    project_id: UUID,
    conversation: "AiConversation",
    user_content: str,
) -> tuple[str, list["AiAction"]]:
    """Process a user message: run LLM, handle tool calls, return assistant reply + any pending actions."""
    from app.models.ai import AiAction, AiConversation, AiMessage

    context = await assemble_project_context(db, project_id)
    prompt_text = _load_system_prompt()
    system_msg = {"role": "system", "content": f"{prompt_text}\n\n## Current Project Context\n{context}"}

    # Build message history from DB
    history: list[dict[str, Any]] = [system_msg]
    for msg in conversation.messages:
        entry: dict[str, Any] = {"role": msg.role, "content": msg.content}
        if msg.tool_calls:
            entry["tool_calls"] = msg.tool_calls
        if msg.tool_call_id:
            entry["tool_call_id"] = msg.tool_call_id
        history.append(entry)

    # Append user message
    history.append({"role": "user", "content": user_content})

    # Save user message
    user_msg = AiMessage(
        conversation_id=conversation.id,
        role="user",
        content=user_content,
        token_count=llm.count_tokens(user_content),
    )
    db.add(user_msg)
    await db.flush()

    pending_actions: list[AiAction] = []

    for _round in range(MAX_TOOL_ROUNDS):
        response = await llm.chat_completion(messages=history, tools=ALL_TOOLS)
        choice = response["choices"][0]
        message = choice["message"]
        finish_reason = choice.get("finish_reason", "stop")

        if finish_reason == "tool_calls" or message.get("tool_calls"):
            tool_calls = message["tool_calls"]
            # LLM tool-calling messages may have content=None; DB column is NOT NULL.
            tc_content = message.get("content") or ""

            # Save assistant tool-calling message
            assistant_msg = AiMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=tc_content,
                tool_calls=tool_calls,
                token_count=message.get("usage", {}).get("completion_tokens"),
            )
            db.add(assistant_msg)
            await db.flush()
            history.append({"role": "assistant", "content": tc_content, "tool_calls": tool_calls})

            for tc in tool_calls:
                fn_name = tc["function"]["name"]
                fn_args = json.loads(tc["function"]["arguments"]) if isinstance(tc["function"]["arguments"], str) else tc["function"]["arguments"]
                # Inject the real project_id so LLM-hallucinated UUIDs don't cause failures.
                if "project_id" in fn_args:
                    fn_args["project_id"] = str(project_id)
                category = TOOL_CATEGORIES.get(fn_name, "auto")

                if category == TOOL_CATEGORY_ACTION:
                    # Create pending action – don't execute yet
                    action = AiAction(
                        project_id=project_id,
                        conversation_id=conversation.id,
                        action_type=fn_name,
                        title=fn_name.replace("_", " ").title(),
                        description=message.get("content", ""),
                        reasoning=f"AI called {fn_name} with args: {json.dumps(fn_args)}",
                        payload=fn_args,
                        status="pending",
                    )
                    db.add(action)
                    await db.flush()

                    # Estimate downstream impact (non-blocking side-effect)
                    try:
                        from app.ai.impact import estimate_impact
                        impact = await estimate_impact(db, project_id, action)
                        action.impact_summary = impact
                        await db.flush()
                    except Exception:
                        logger.debug("Impact estimation skipped for action %s", action.id)

                    pending_actions.append(action)

                    tool_result = json.dumps({"status": "pending_approval", "action_id": str(action.id), "message": "This action requires user approval before execution."})
                else:
                    tool_result = await _execute_tool(db, fn_name, fn_args)

                tool_msg = AiMessage(
                    conversation_id=conversation.id,
                    role="tool",
                    content=tool_result,
                    tool_call_id=tc["id"],
                    token_count=llm.count_tokens(tool_result),
                )
                db.add(tool_msg)
                await db.flush()
                history.append({"role": "tool", "content": tool_result, "tool_call_id": tc["id"]})

            continue

        # Normal completion
        assistant_content = message.get("content", "")
        assistant_msg = AiMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=assistant_content,
            token_count=message.get("usage", {}).get("completion_tokens"),
        )
        db.add(assistant_msg)
        await db.flush()

        return assistant_content, pending_actions

    return "I've reached the maximum reasoning steps. Please try rephrasing your question.", pending_actions


async def _execute_tool(db: AsyncSession, name: str, args: dict) -> str:
    """Execute an auto-approved tool and return result as JSON string."""
    from app.ai.action_executor import execute_tool
    try:
        result = await execute_tool(db, name, args)
        return json.dumps(result, default=str)
    except Exception as exc:
        logger.exception("Tool %s failed", name)
        return json.dumps({"error": str(exc)})


async def run_agent(
    db: AsyncSession,
    llm: LLMClient,
    project_id: UUID,
    agent_name: str,
    task_description: str,
) -> dict[str, Any]:
    """Invoke a domain-specific agent and return its structured result.

    Parameters
    ----------
    agent_name : one of 'import', 'qc', 'analysis', 'mcp', 'energy', 'report'
    task_description : what the agent should do
    """
    from app.ai.agents import AGENT_REGISTRY
    from app.ai.agents.base import AgentResult

    agent_cls = AGENT_REGISTRY.get(agent_name)
    if agent_cls is None:
        available = ", ".join(sorted(AGENT_REGISTRY.keys()))
        return {"error": f"Unknown agent '{agent_name}'. Available: {available}"}

    agent = agent_cls(llm)
    context = await assemble_project_context(db, project_id)
    result: AgentResult = await agent.run(db, project_id, task_description, context)

    return {
        "agent": agent_name,
        "summary": result.summary,
        "recommendations": result.recommendations,
        "insights": result.insights,
        "pending_actions": [
            {"id": str(a.id), "type": a.action_type, "title": a.title, "status": a.status}
            for a in result.pending_actions
        ],
    }
