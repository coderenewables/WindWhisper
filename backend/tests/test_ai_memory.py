"""Tests for AI project memory CRUD."""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project
from app.models.ai import AiProjectMemory


@pytest_asyncio.fixture
async def project(db_session: AsyncSession) -> Project:
    p = Project(name="Memory Test Project")
    db_session.add(p)
    await db_session.flush()
    return p


# ── create_memory ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_memory(db_session: AsyncSession, project: Project):
    from app.ai.memory import create_memory
    mem = await create_memory(db_session, project.id, "decision_rationale", "Chose variance ratio for MCP")
    assert mem.id is not None
    assert mem.project_id == project.id
    assert mem.memory_type == "decision_rationale"
    assert mem.content == "Chose variance ratio for MCP"
    assert mem.metadata_json is None


@pytest.mark.asyncio
async def test_create_memory_with_metadata(db_session: AsyncSession, project: Project):
    from app.ai.memory import create_memory
    meta = {"method": "variance_ratio", "r2": 0.82}
    mem = await create_memory(db_session, project.id, "method_preference", "Prefer VR", metadata=meta)
    assert mem.metadata_json == meta


# ── list_memories ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_memories_empty(db_session: AsyncSession, project: Project):
    from app.ai.memory import list_memories
    mems = await list_memories(db_session, project.id)
    assert mems == []


@pytest.mark.asyncio
async def test_list_memories_returns_all(db_session: AsyncSession, project: Project):
    from app.ai.memory import create_memory, list_memories
    await create_memory(db_session, project.id, "insight", "Wind speed is moderate")
    await create_memory(db_session, project.id, "decision_rationale", "Selected LLS MCP")
    mems = await list_memories(db_session, project.id)
    assert len(mems) == 2


@pytest.mark.asyncio
async def test_list_memories_filter_by_type(db_session: AsyncSession, project: Project):
    from app.ai.memory import create_memory, list_memories
    await create_memory(db_session, project.id, "insight", "Insight 1")
    await create_memory(db_session, project.id, "decision_rationale", "Decision 1")
    mems = await list_memories(db_session, project.id, memory_type="insight")
    assert len(mems) == 1
    assert mems[0].memory_type == "insight"


@pytest.mark.asyncio
async def test_list_memories_limit(db_session: AsyncSession, project: Project):
    from app.ai.memory import create_memory, list_memories
    for i in range(5):
        await create_memory(db_session, project.id, "insight", f"Insight {i}")
    mems = await list_memories(db_session, project.id, limit=3)
    assert len(mems) == 3


@pytest.mark.asyncio
async def test_list_memories_different_project(db_session: AsyncSession, project: Project):
    from app.ai.memory import create_memory, list_memories
    await create_memory(db_session, project.id, "insight", "Belongs to project")
    other_project = Project(name="Other Project")
    db_session.add(other_project)
    await db_session.flush()
    mems = await list_memories(db_session, other_project.id)
    assert len(mems) == 0


# ── update_memory ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_memory_content(db_session: AsyncSession, project: Project):
    from app.ai.memory import create_memory, update_memory
    mem = await create_memory(db_session, project.id, "insight", "Original")
    updated = await update_memory(db_session, mem.id, content="Updated content")
    assert updated is not None
    assert updated.content == "Updated content"


@pytest.mark.asyncio
async def test_update_memory_metadata(db_session: AsyncSession, project: Project):
    from app.ai.memory import create_memory, update_memory
    mem = await create_memory(db_session, project.id, "insight", "test")
    updated = await update_memory(db_session, mem.id, metadata={"key": "value"})
    assert updated.metadata_json == {"key": "value"}


@pytest.mark.asyncio
async def test_update_nonexistent_memory(db_session: AsyncSession):
    from app.ai.memory import update_memory
    result = await update_memory(db_session, uuid4(), content="nope")
    assert result is None


# ── delete_memory ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_memory(db_session: AsyncSession, project: Project):
    from app.ai.memory import create_memory, delete_memory, list_memories
    mem = await create_memory(db_session, project.id, "insight", "To delete")
    ok = await delete_memory(db_session, mem.id)
    assert ok is True
    remaining = await list_memories(db_session, project.id)
    assert len(remaining) == 0


@pytest.mark.asyncio
async def test_delete_nonexistent_memory(db_session: AsyncSession):
    from app.ai.memory import delete_memory
    ok = await delete_memory(db_session, uuid4())
    assert ok is False
