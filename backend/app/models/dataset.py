from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


if TYPE_CHECKING:
    from app.models.analysis_result import AnalysisResult
    from app.models.flag import Flag
    from app.models.project import Project
    from app.models.timeseries import TimeseriesData


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str | None] = mapped_column(String(50))
    file_name: Mapped[str | None] = mapped_column(String(500))
    time_step_seconds: Mapped[int | None] = mapped_column(Integer())
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    project: Mapped["Project"] = relationship(back_populates="datasets")
    columns: Mapped[list["DataColumn"]] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
    )
    timeseries_records: Mapped[list["TimeseriesData"]] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
    )
    flags: Mapped[list["Flag"]] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
    )
    analysis_results: Mapped[list["AnalysisResult"]] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
    )


class DataColumn(Base):
    __tablename__ = "data_columns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(50))
    measurement_type: Mapped[str | None] = mapped_column(String(50))
    height_m: Mapped[float | None] = mapped_column(Float())
    sensor_info: Mapped[dict | None] = mapped_column(JSONB)

    dataset: Mapped["Dataset"] = relationship(back_populates="columns")
