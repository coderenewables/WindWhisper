from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


if TYPE_CHECKING:
    from app.models.dataset import Dataset
    from app.models.workflow import Workflow


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text())
    latitude: Mapped[float | None] = mapped_column(Float())
    longitude: Mapped[float | None] = mapped_column(Float())
    elevation: Mapped[float | None] = mapped_column(Float())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    datasets: Mapped[list["Dataset"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    workflows: Mapped[list["Workflow"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
