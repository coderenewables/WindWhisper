from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DatasetColumnResponse(BaseModel):
    id: uuid.UUID
    name: str
    unit: str | None = None
    measurement_type: str | None = None
    height_m: float | None = None
    sensor_info: dict[str, Any] | None = None


class DatasetSummaryResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    source_type: str | None = None
    file_name: str | None = None
    time_step_seconds: int | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    created_at: datetime
    column_count: int = 0
    row_count: int = 0


class DatasetListResponse(BaseModel):
    datasets: list[DatasetSummaryResponse] = Field(default_factory=list)
    total: int = 0


class DatasetDetailResponse(DatasetSummaryResponse):
    columns: list[DatasetColumnResponse] = Field(default_factory=list)


class TimeSeriesColumnResponse(BaseModel):
    name: str
    unit: str | None = None
    measurement_type: str | None = None
    values: list[float | None] = Field(default_factory=list)


class TimeSeriesResponse(BaseModel):
    dataset_id: uuid.UUID
    resample: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    timestamps: list[datetime] = Field(default_factory=list)
    columns: dict[str, TimeSeriesColumnResponse] = Field(default_factory=dict)
