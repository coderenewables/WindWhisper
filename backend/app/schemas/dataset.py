from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ColumnInfo(BaseModel):
    name: str
    measurement_type: str | None = None
    height_m: float | None = None
    unit: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class UploadPreviewResponse(BaseModel):
    import_id: uuid.UUID
    file_name: str
    delimiter: str | None = None
    row_count: int
    time_step_seconds: int | None = None
    preview_rows: list[dict[str, Any]]
    columns: list[ColumnInfo]
    sheet_names: list[str] = Field(default_factory=list)
    selected_sheet: str | None = None


class ConfirmImportRequest(BaseModel):
    import_id: uuid.UUID
    dataset_name: str | None = Field(default=None, min_length=1, max_length=255)
    columns: list[ColumnInfo]


class DatasetImportResponse(BaseModel):
    dataset_id: uuid.UUID
    project_id: uuid.UUID
    name: str
    row_count: int
    column_count: int
    time_step_seconds: int | None
    start_time: datetime | None
    end_time: datetime | None


class ExcelSheetListResponse(BaseModel):
    import_id: uuid.UUID
    sheet_names: list[str]
    selected_sheet: str | None = None