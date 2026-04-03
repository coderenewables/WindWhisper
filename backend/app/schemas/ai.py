"""Pydantic schemas for AI endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# --- Conversation ---

class AiMessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=20000)


class AiMemoryCreateRequest(BaseModel):
    memory_type: str = Field(..., min_length=1, max_length=50)
    content: str = Field(..., min_length=1, max_length=10000)
    metadata: dict | None = None


class AiMemoryUpdateRequest(BaseModel):
    content: str | None = None
    metadata: dict | None = None


class AiActionRejectRequest(BaseModel):
    reason: str | None = None


# --- Responses ---

class AiConversationResponse(BaseModel):
    id: str
    project_id: str
    title: str | None
    created_at: datetime
    updated_at: datetime


class AiMessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    tool_calls: dict | list | None = None
    tool_call_id: str | None = None
    token_count: int | None = None
    created_at: datetime


class AiConversationDetailResponse(BaseModel):
    id: str
    project_id: str
    title: str | None
    messages: list[AiMessageResponse]
    created_at: datetime
    updated_at: datetime


class AiImpactMetricResponse(BaseModel):
    metric: str
    current: float
    projected: float
    change_pct: float
    direction: str


class AiImpactSummaryResponse(BaseModel):
    affected_metrics: list[AiImpactMetricResponse]
    data_affected_pct: float
    confidence: str


class AiActionResponse(BaseModel):
    id: str
    project_id: str
    conversation_id: str | None
    action_type: str
    title: str
    description: str | None
    reasoning: str | None
    payload: dict
    status: str
    impact_summary: AiImpactSummaryResponse | None = None
    resolved_by: str | None
    resolved_at: datetime | None
    created_at: datetime


class AiMemoryResponse(BaseModel):
    id: str
    project_id: str
    memory_type: str
    content: str
    metadata: dict | None
    created_at: datetime
    updated_at: datetime


class AiHealthIssueResponse(BaseModel):
    severity: str
    category: str
    message: str
    suggested_action: str


class AiHealthResponse(BaseModel):
    id: str
    project_id: str
    health_score: float
    summary: str
    issues: list[AiHealthIssueResponse]
    metrics: dict
    created_at: datetime


class AiConfigureRequest(BaseModel):
    llm_api_key: str | None = Field(None, min_length=1, max_length=500)
    llm_provider: str | None = Field(None, min_length=1, max_length=50)
    llm_model: str | None = Field(None, min_length=1, max_length=100)
    llm_base_url: str | None = None


class AiStatusResponse(BaseModel):
    ai_enabled: bool
    llm_provider: str | None = None
    llm_model: str | None = None
    has_api_key: bool = False
    connected: bool = False
