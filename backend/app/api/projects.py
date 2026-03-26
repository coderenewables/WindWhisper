from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Dataset, Project
from app.schemas import ProjectCreate, ProjectListResponse, ProjectResponse, ProjectUpdate


router = APIRouter(prefix="/api/projects", tags=["projects"])
DbSession = Annotated[AsyncSession, Depends(get_db)]


def serialize_project(project: Project, dataset_count: int = 0) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        latitude=project.latitude,
        longitude=project.longitude,
        elevation=project.elevation,
        created_at=project.created_at,
        updated_at=project.updated_at,
        dataset_count=dataset_count,
    )


def project_with_dataset_count_statement():
    dataset_count = func.count(Dataset.id).label("dataset_count")
    return (
        select(Project, dataset_count)
        .outerjoin(Dataset, Dataset.project_id == Project.id)
        .group_by(Project.id)
    )


async def get_project_with_count_or_404(
    db: AsyncSession,
    project_id: uuid.UUID,
) -> tuple[Project, int]:
    statement = project_with_dataset_count_statement().where(Project.id == project_id)
    row = (await db.execute(statement)).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    project, dataset_count = row
    return project, dataset_count


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectCreate, db: DbSession) -> ProjectResponse:
    project = Project(**payload.model_dump())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return serialize_project(project)


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    db: DbSession,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> ProjectListResponse:
    total = await db.scalar(select(func.count(Project.id)))
    statement = (
        project_with_dataset_count_statement()
        .order_by(Project.created_at.desc(), Project.id.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(statement)).all()

    return ProjectListResponse(
        projects=[serialize_project(project, dataset_count) for project, dataset_count in rows],
        total=total or 0,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: uuid.UUID, db: DbSession) -> ProjectResponse:
    project, dataset_count = await get_project_with_count_or_404(db, project_id)
    return serialize_project(project, dataset_count)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: DbSession,
) -> ProjectResponse:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"] is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name cannot be null")

    for field_name, value in updates.items():
        setattr(project, field_name, value)

    await db.commit()
    await db.refresh(project)

    dataset_count = await db.scalar(
        select(func.count(Dataset.id)).where(Dataset.project_id == project.id),
    )
    return serialize_project(project, dataset_count or 0)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: uuid.UUID, db: DbSession) -> Response:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    await db.delete(project)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)