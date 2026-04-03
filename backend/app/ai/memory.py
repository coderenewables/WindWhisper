"""Project memory: store and retrieve AI-generated insights."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AiProjectMemory


async def list_memories(db: AsyncSession, project_id: UUID, *, memory_type: str | None = None, limit: int = 50) -> list[AiProjectMemory]:
    q = select(AiProjectMemory).where(AiProjectMemory.project_id == project_id)
    if memory_type:
        q = q.where(AiProjectMemory.memory_type == memory_type)
    q = q.order_by(AiProjectMemory.created_at.desc()).limit(limit)
    return list((await db.execute(q)).scalars().all())


async def create_memory(db: AsyncSession, project_id: UUID, memory_type: str, content: str, metadata: dict | None = None) -> AiProjectMemory:
    mem = AiProjectMemory(project_id=project_id, memory_type=memory_type, content=content, metadata_json=metadata)
    db.add(mem)
    await db.flush()
    return mem


async def update_memory(db: AsyncSession, memory_id: UUID, content: str | None = None, metadata: dict | None = None) -> AiProjectMemory | None:
    mem = await db.get(AiProjectMemory, memory_id)
    if mem is None:
        return None
    if content is not None:
        mem.content = content
    if metadata is not None:
        mem.metadata_json = metadata
    await db.flush()
    return mem


async def delete_memory(db: AsyncSession, memory_id: UUID) -> bool:
    mem = await db.get(AiProjectMemory, memory_id)
    if mem is None:
        return False
    await db.delete(mem)
    await db.flush()
    return True
