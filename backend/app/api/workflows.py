from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Workflow
from app.schemas.workflow import (
    WorkflowCreateRequest,
    WorkflowListResponse,
    WorkflowResponse,
    WorkflowRunResponse,
    WorkflowUpdateRequest,
)
from app.services.workflow_engine import get_project_or_404, get_workflow_or_404, list_project_workflows, normalize_steps, run_workflow, serialize_workflow


router = APIRouter(prefix="/api/workflows", tags=["workflows"])
DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/projects/{project_id}", response_model=WorkflowListResponse)
async def list_workflows(project_id: uuid.UUID, db: DbSession) -> WorkflowListResponse:
    rows = await list_project_workflows(db, project_id)
    return WorkflowListResponse(items=[WorkflowResponse(**serialize_workflow(workflow)) for workflow in rows], total=len(rows))


@router.post("/projects/{project_id}", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(project_id: uuid.UUID, payload: WorkflowCreateRequest, db: DbSession) -> WorkflowResponse:
    await get_project_or_404(db, project_id)
    workflow = Workflow(
        project_id=project_id,
        name=payload.name,
        steps=[step.model_dump() for step in normalize_steps(payload.steps)],
        status="draft",
        last_run_log=[],
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return WorkflowResponse(**serialize_workflow(workflow))


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: uuid.UUID, db: DbSession) -> WorkflowResponse:
    workflow = await get_workflow_or_404(db, workflow_id)
    return WorkflowResponse(**serialize_workflow(workflow))


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(workflow_id: uuid.UUID, payload: WorkflowUpdateRequest, db: DbSession) -> WorkflowResponse:
    workflow = await get_workflow_or_404(db, workflow_id)
    if payload.name is not None:
        workflow.name = payload.name
    if payload.steps is not None:
        workflow.steps = [step.model_dump() for step in normalize_steps(payload.steps)]
        if workflow.status == "running":
            workflow.status = "draft"
    await db.commit()
    await db.refresh(workflow)
    return WorkflowResponse(**serialize_workflow(workflow))


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(workflow_id: uuid.UUID, db: DbSession) -> Response:
    workflow = await get_workflow_or_404(db, workflow_id)
    await db.delete(workflow)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{workflow_id}/run", response_model=WorkflowRunResponse)
async def execute_workflow(workflow_id: uuid.UUID, db: DbSession) -> WorkflowRunResponse:
    result = await run_workflow(db, workflow_id)
    return WorkflowRunResponse(**result)