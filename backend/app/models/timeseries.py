from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


if TYPE_CHECKING:
    from app.models.dataset import Dataset


class TimeseriesData(Base):
    __tablename__ = "timeseries_data"
    __table_args__ = (
        Index("ix_timeseries_data_dataset_id_timestamp", "dataset_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(BigInteger(), primary_key=True, autoincrement=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    values_json: Mapped[dict] = mapped_column("values", JSONB, nullable=False)

    dataset: Mapped["Dataset"] = relationship(back_populates="timeseries_records")
