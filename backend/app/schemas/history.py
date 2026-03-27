from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ChangeLogResponse(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    action_type: str
    description: str
    before_state: dict[str, Any] | None = None
    after_state: dict[str, Any] | None = None
    created_at: datetime


class ChangeLogListResponse(BaseModel):
    changes: list[ChangeLogResponse] = Field(default_factory=list)
    total: int = 0


class UndoResponse(BaseModel):
    undone_change: ChangeLogResponse