from __future__ import annotations

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, Field


ExportSectorCount = Literal[12, 16, 36]


class CSVExportRequest(BaseModel):
    column_ids: list[uuid.UUID] = Field(default_factory=list)
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    resample: str | None = None


class WAsPTabExportRequest(BaseModel):
    speed_column_id: uuid.UUID
    direction_column_id: uuid.UUID
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    num_sectors: ExportSectorCount = 12
    speed_bin_width: Annotated[float, Field(default=1.0, gt=0, le=10)] = 1.0


class IEAJSONExportRequest(BaseModel):
    column_ids: list[uuid.UUID] = Field(default_factory=list)
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    resample: str | None = None


class OpenwindExportRequest(BaseModel):
    column_ids: list[uuid.UUID] = Field(default_factory=list)
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    resample: str | None = None