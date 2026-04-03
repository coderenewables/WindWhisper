"""AI-related ORM models for GoKaatru v2."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import DateTime, Float, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.project import Project


class AiConversation(Base):
    __tablename__ = "ai_conversations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    messages: Mapped[list["AiMessage"]] = relationship(back_populates="conversation", cascade="all, delete-orphan", order_by="AiMessage.created_at")


class AiMessage(Base):
    __tablename__ = "ai_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text(), nullable=False)
    tool_calls: Mapped[dict | None] = mapped_column(JSONB())
    tool_call_id: Mapped[str | None] = mapped_column(String(255))
    token_count: Mapped[int | None] = mapped_column(Integer())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    conversation: Mapped["AiConversation"] = relationship(back_populates="messages")


class AiAction(Base):
    __tablename__ = "ai_actions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("ai_conversations.id", ondelete="SET NULL"))
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text())
    reasoning: Mapped[str | None] = mapped_column(Text())
    payload: Mapped[dict] = mapped_column(JSONB(), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'pending'"))
    impact_summary: Mapped[dict | None] = mapped_column(JSONB())
    resolved_by: Mapped[str | None] = mapped_column(String(20))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AiProjectMemory(Base):
    __tablename__ = "ai_project_memory"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    memory_type: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text(), nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB())
    source_action_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("ai_actions.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AnalysisProvenance(Base):
    __tablename__ = "analysis_provenance"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    analysis_result_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("analysis_results.id", ondelete="CASCADE"), nullable=False)
    dataset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    column_ids: Mapped[list | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    excluded_flag_ids: Mapped[list | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    data_hash: Mapped[str | None] = mapped_column(String(64))
    parameters_hash: Mapped[str | None] = mapped_column(String(64))
    time_range_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    time_range_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    record_count: Mapped[int | None] = mapped_column(Integer())
    data_recovery_pct: Mapped[float | None] = mapped_column(Float())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ProjectHealthSnapshot(Base):
    __tablename__ = "project_health_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    health_score: Mapped[float | None] = mapped_column(Float())
    summary: Mapped[str | None] = mapped_column(Text())
    issues: Mapped[dict | None] = mapped_column(JSONB())
    metrics: Mapped[dict | None] = mapped_column(JSONB())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
