from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


WorkflowStatus = Literal["draft", "running", "completed", "failed"]
WorkflowStepType = Literal[
    "import_file",
    "apply_qc_rules",
    "reconstruct_gaps",
    "calculate_shear",
    "run_mcp",
    "generate_report",
    "export_data",
]
WorkflowStepStatus = Literal["completed", "failed"]


class WorkflowStepDefinition(BaseModel):
    order: int = Field(ge=1)
    step_type: WorkflowStepType
    params: dict[str, Any] = Field(default_factory=dict)


class WorkflowCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    steps: list[WorkflowStepDefinition] = Field(default_factory=list)


class WorkflowUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    steps: list[WorkflowStepDefinition] | None = None


class WorkflowExecutionLogEntry(BaseModel):
    order: int = Field(ge=1)
    step_type: WorkflowStepType
    status: WorkflowStepStatus
    started_at: datetime
    finished_at: datetime
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class WorkflowResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    steps: list[WorkflowStepDefinition] = Field(default_factory=list)
    status: WorkflowStatus
    last_run: datetime | None = None
    last_run_log: list[WorkflowExecutionLogEntry] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class WorkflowListResponse(BaseModel):
    items: list[WorkflowResponse] = Field(default_factory=list)
    total: int


class WorkflowRunResponse(BaseModel):
    workflow: WorkflowResponse
    started_at: datetime
    finished_at: datetime
    status: WorkflowStatus
    step_results: list[WorkflowExecutionLogEntry] = Field(default_factory=list)
    error: str | None = None

    @model_validator(mode="after")
    def validate_failure_state(self) -> "WorkflowRunResponse":
        if self.status == "failed" and not self.error:
            raise ValueError("error is required when workflow status is failed")
        return self