"""AI REST + WebSocket API router."""

from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.health import compute_health
from app.ai.memory import create_memory, delete_memory, list_memories, update_memory
from app.ai.websocket_hub import ws_hub
from app.config import settings
from app.database import get_db
from app.models.ai import AiAction, AiConversation, AiMessage
from app.schemas.ai import (
    AiActionRejectRequest,
    AiActionResponse,
    AiConfigureRequest,
    AiConversationDetailResponse,
    AiConversationResponse,
    AiHealthResponse,
    AiMemoryCreateRequest,
    AiMemoryResponse,
    AiMemoryUpdateRequest,
    AiMessageCreateRequest,
    AiMessageResponse,
    AiStatusResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai"])


def _get_llm_client():
    from app.ai.llm_client import LLMClient
    return LLMClient(
        provider=settings.llm_provider,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        base_url=settings.llm_base_url,
    )


# ── Agents ──────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/agents/{agent_name}")
async def invoke_agent(project_id: UUID, agent_name: str, body: AiMessageCreateRequest, db: AsyncSession = Depends(get_db)):
    """Invoke a domain-specific agent directly (import, qc, analysis, mcp, energy, report)."""
    if not settings.ai_enabled:
        raise HTTPException(status_code=503, detail="AI features are disabled")
    from app.ai.orchestrator import run_agent
    llm = _get_llm_client()
    result = await run_agent(db, llm, project_id, agent_name, body.content)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    await db.commit()
    return result


# ── Status ──────────────────────────────────────────────────────────

@router.get("/status", response_model=AiStatusResponse)
async def ai_status():
    connected = False
    if settings.ai_enabled and settings.llm_api_key:
        try:
            llm = _get_llm_client()
            resp = await llm.chat_completion([{"role": "user", "content": "ping"}], max_tokens=5)
            connected = bool(resp.get("choices"))
        except Exception:
            connected = False
    return AiStatusResponse(
        ai_enabled=settings.ai_enabled,
        llm_provider=settings.llm_provider if settings.ai_enabled else None,
        llm_model=settings.llm_model if settings.ai_enabled else None,
        has_api_key=bool(settings.llm_api_key),
        connected=connected,
    )


@router.post("/toggle", response_model=AiStatusResponse)
async def toggle_ai():
    """Toggle AI features on/off at runtime."""
    settings.ai_enabled = not settings.ai_enabled
    return AiStatusResponse(
        ai_enabled=settings.ai_enabled,
        llm_provider=settings.llm_provider if settings.ai_enabled else None,
        llm_model=settings.llm_model if settings.ai_enabled else None,
        has_api_key=bool(settings.llm_api_key),
        connected=False,
    )


@router.post("/configure", response_model=AiStatusResponse)
async def configure_ai(body: AiConfigureRequest):
    """Update LLM configuration at runtime (API key, provider, model)."""
    if body.llm_api_key is not None:
        settings.llm_api_key = body.llm_api_key
    if body.llm_provider is not None:
        settings.llm_provider = body.llm_provider
    if body.llm_model is not None:
        settings.llm_model = body.llm_model
    if body.llm_base_url is not None:
        settings.llm_base_url = body.llm_base_url or None
    return AiStatusResponse(
        ai_enabled=settings.ai_enabled,
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
        has_api_key=bool(settings.llm_api_key),
        connected=False,
    )


# ── Conversations ───────────────────────────────────────────────────

@router.get("/projects/{project_id}/conversations", response_model=list[AiConversationResponse])
async def list_conversations(project_id: UUID, db: AsyncSession = Depends(get_db)):
    q = select(AiConversation).where(AiConversation.project_id == project_id).order_by(AiConversation.updated_at.desc()).limit(50)
    rows = (await db.execute(q)).scalars().all()
    return [AiConversationResponse(id=str(c.id), project_id=str(c.project_id), title=c.title, created_at=c.created_at, updated_at=c.updated_at) for c in rows]


@router.post("/projects/{project_id}/conversations", response_model=AiConversationResponse, status_code=201)
async def create_conversation(project_id: UUID, db: AsyncSession = Depends(get_db)):
    conv = AiConversation(project_id=project_id)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return AiConversationResponse(id=str(conv.id), project_id=str(conv.project_id), title=conv.title, created_at=conv.created_at, updated_at=conv.updated_at)


@router.get("/conversations/{conversation_id}", response_model=AiConversationDetailResponse)
async def get_conversation(conversation_id: UUID, db: AsyncSession = Depends(get_db)):
    conv = await db.get(AiConversation, conversation_id, options=[selectinload(AiConversation.messages)])
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msgs = [AiMessageResponse(id=str(m.id), conversation_id=str(m.conversation_id), role=m.role, content=m.content, tool_calls=m.tool_calls, tool_call_id=m.tool_call_id, token_count=m.token_count, created_at=m.created_at) for m in conv.messages]
    return AiConversationDetailResponse(id=str(conv.id), project_id=str(conv.project_id), title=conv.title, messages=msgs, created_at=conv.created_at, updated_at=conv.updated_at)


@router.post("/conversations/{conversation_id}/messages", response_model=AiMessageResponse)
async def send_message(conversation_id: UUID, body: AiMessageCreateRequest, db: AsyncSession = Depends(get_db)):
    if not settings.ai_enabled:
        raise HTTPException(status_code=503, detail="AI features are disabled")
    conv = await db.get(AiConversation, conversation_id, options=[selectinload(AiConversation.messages)])
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    from app.ai.orchestrator import run_conversation_turn
    llm = _get_llm_client()
    try:
        reply_content, pending_actions = await run_conversation_turn(db, llm, conv.project_id, conv, body.content)
    except Exception as exc:
        exc_str = str(exc)
        if "RateLimitError" in type(exc).__name__ or "429" in exc_str:
            raise HTTPException(status_code=429, detail="The AI model is temporarily rate-limited. Please wait a moment and try again.")
        if "NotFoundError" in type(exc).__name__ or "No endpoints found" in exc_str:
            raise HTTPException(status_code=502, detail="The configured AI model is unavailable or does not support the required features. Please try a different model.")
        logger.exception("AI conversation turn failed")
        raise HTTPException(status_code=502, detail="AI request failed. Please try again later.")

    # Auto-title after first exchange
    if not conv.title and len(conv.messages) >= 2:
        conv.title = body.content[:80]

    await db.commit()

    # Broadcast pending actions via WS
    for action in pending_actions:
        await ws_hub.broadcast(str(conv.project_id), "action_pending", {
            "id": str(action.id), "type": action.action_type, "title": action.title,
            "description": action.description, "payload": action.payload,
        })

    last_msg = conv.messages[-1] if conv.messages else None
    if last_msg:
        return AiMessageResponse(id=str(last_msg.id), conversation_id=str(last_msg.conversation_id), role=last_msg.role, content=last_msg.content, tool_calls=last_msg.tool_calls, tool_call_id=last_msg.tool_call_id, token_count=last_msg.token_count, created_at=last_msg.created_at)
    return AiMessageResponse(id="", conversation_id=str(conversation_id), role="assistant", content=reply_content, created_at=conv.updated_at)


# ── Actions ─────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/actions", response_model=list[AiActionResponse])
async def list_actions(project_id: UUID, status_filter: str | None = None, db: AsyncSession = Depends(get_db)):
    q = select(AiAction).where(AiAction.project_id == project_id)
    if status_filter:
        q = q.where(AiAction.status == status_filter)
    q = q.order_by(AiAction.created_at.desc()).limit(50)
    rows = (await db.execute(q)).scalars().all()
    return [_action_response(a) for a in rows]


@router.post("/actions/{action_id}/approve", response_model=AiActionResponse)
async def approve_action(action_id: UUID, db: AsyncSession = Depends(get_db)):
    action = await db.get(AiAction, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if action.status != "pending":
        raise HTTPException(status_code=400, detail="Action is not pending")

    from app.ai.action_executor import execute_tool
    from datetime import datetime, timezone
    try:
        await execute_tool(db, action.action_type, action.payload)
        action.status = "approved"
    except Exception as exc:
        action.status = "failed"
        action.description = (action.description or "") + f"\nExecution error: {exc}"
    action.resolved_by = "user"
    action.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(action)
    await ws_hub.broadcast(str(action.project_id), "action_resolved", {"id": str(action.id), "status": action.status})
    return _action_response(action)


@router.post("/actions/{action_id}/reject", response_model=AiActionResponse)
async def reject_action(action_id: UUID, body: AiActionRejectRequest, db: AsyncSession = Depends(get_db)):
    from datetime import datetime, timezone
    action = await db.get(AiAction, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if action.status != "pending":
        raise HTTPException(status_code=400, detail="Action is not pending")
    action.status = "rejected"
    action.resolved_by = "user"
    action.resolved_at = datetime.now(timezone.utc)
    if body.reason:
        action.description = (action.description or "") + f"\nRejection reason: {body.reason}"
    await db.commit()
    await db.refresh(action)
    await ws_hub.broadcast(str(action.project_id), "action_resolved", {"id": str(action.id), "status": action.status})
    return _action_response(action)


# ── Memory ──────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/memory", response_model=list[AiMemoryResponse])
async def list_project_memory(project_id: UUID, memory_type: str | None = None, db: AsyncSession = Depends(get_db)):
    mems = await list_memories(db, project_id, memory_type=memory_type)
    return [AiMemoryResponse(id=str(m.id), project_id=str(m.project_id), memory_type=m.memory_type, content=m.content, metadata=m.metadata_json, created_at=m.created_at, updated_at=m.updated_at) for m in mems]


@router.post("/projects/{project_id}/memory", response_model=AiMemoryResponse, status_code=201)
async def create_project_memory(project_id: UUID, body: AiMemoryCreateRequest, db: AsyncSession = Depends(get_db)):
    m = await create_memory(db, project_id, body.memory_type, body.content, body.metadata)
    await db.commit()
    await db.refresh(m)
    return AiMemoryResponse(id=str(m.id), project_id=str(m.project_id), memory_type=m.memory_type, content=m.content, metadata=m.metadata_json, created_at=m.created_at, updated_at=m.updated_at)


@router.delete("/memory/{memory_id}", status_code=204)
async def delete_project_memory(memory_id: UUID, db: AsyncSession = Depends(get_db)):
    ok = await delete_memory(db, memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.commit()


# ── Health ──────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/health")
async def project_health(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await compute_health(db, project_id)
    await db.commit()
    return result


# ── WebSocket ───────────────────────────────────────────────────────

@router.websocket("/ws/{project_id}")
async def ai_websocket(project_id: str, ws: WebSocket):
    await ws_hub.connect(project_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await ws_hub.send_to(ws, "pong", {})
    except WebSocketDisconnect:
        pass
    finally:
        await ws_hub.disconnect(project_id, ws)


# ── Helpers ─────────────────────────────────────────────────────────

def _action_response(a: AiAction) -> AiActionResponse:
    impact = None
    if a.impact_summary:
        from app.schemas.ai import AiImpactMetricResponse, AiImpactSummaryResponse
        metrics = [AiImpactMetricResponse(**m) for m in a.impact_summary.get("affected_metrics", [])]
        impact = AiImpactSummaryResponse(affected_metrics=metrics, data_affected_pct=a.impact_summary.get("data_affected_pct", 0), confidence=a.impact_summary.get("confidence", "low"))
    return AiActionResponse(
        id=str(a.id), project_id=str(a.project_id),
        conversation_id=str(a.conversation_id) if a.conversation_id else None,
        action_type=a.action_type, title=a.title, description=a.description,
        reasoning=a.reasoning, payload=a.payload, status=a.status,
        impact_summary=impact, resolved_by=a.resolved_by,
        resolved_at=a.resolved_at, created_at=a.created_at,
    )
