from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


ALLOWED_OPERATORS = {"==", "!=", "<", ">", "<=", ">=", "between", "is_null"}
ALLOWED_LOGIC = {"AND", "OR"}


class FlagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=7)
    description: str | None = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if len(value) != 7 or not value.startswith("#"):
            raise ValueError("color must be a hex value like #1f8f84")
        return value


class FlagResponse(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    name: str
    color: str | None = None
    description: str | None = None
    rule_count: int = 0
    flagged_count: int = 0


class FlagRuleCreate(BaseModel):
    column_id: uuid.UUID
    operator: str
    value: Any = None
    logic: str | None = "AND"
    group_index: int = Field(default=1, ge=1)
    order_index: int = Field(default=1, ge=1)

    @field_validator("operator")
    @classmethod
    def validate_operator(cls, value: str) -> str:
        if value not in ALLOWED_OPERATORS:
            raise ValueError(f"operator must be one of {sorted(ALLOWED_OPERATORS)}")
        return value

    @field_validator("logic")
    @classmethod
    def validate_logic(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.upper()
        if normalized not in ALLOWED_LOGIC:
            raise ValueError("logic must be AND or OR")
        return normalized

    @model_validator(mode="after")
    def validate_value_shape(self) -> "FlagRuleCreate":
        if self.operator == "between":
            if not isinstance(self.value, list) or len(self.value) != 2:
                raise ValueError("between operator requires a two-item list value")
        if self.operator == "is_null":
            self.value = None
        return self


class FlagRuleUpdate(FlagRuleCreate):
    pass


class FlagRuleResponse(BaseModel):
    id: uuid.UUID
    flag_id: uuid.UUID
    column_id: uuid.UUID
    operator: str
    value: Any = None
    logic: str | None = "AND"
    group_index: int = 1
    order_index: int = 1


class ManualFlagRequest(BaseModel):
    start_time: datetime
    end_time: datetime
    column_ids: list[uuid.UUID] | None = None

    @model_validator(mode="after")
    def validate_time_range(self) -> "ManualFlagRequest":
        if self.end_time < self.start_time:
            raise ValueError("end_time must be greater than or equal to start_time")
        return self


class FlaggedRangeResponse(BaseModel):
    id: uuid.UUID
    flag_id: uuid.UUID
    start_time: datetime
    end_time: datetime
    applied_by: str
    column_ids: list[uuid.UUID] | None = None


class TowerShadowMethod(str, Enum):
    manual = "manual"
    auto = "auto"


class ReconstructionMethod(str, Enum):
    interpolation = "interpolation"
    knn = "knn"
    correlation = "correlation"


class ReconstructionSaveMode(str, Enum):
    preview = "preview"
    new_column = "new_column"
    overwrite = "overwrite"


class TowerShadowRequest(BaseModel):
    method: TowerShadowMethod
    boom_orientations: list[float] | None = None
    direction_column_id: uuid.UUID | None = None
    shadow_width: float = Field(default=20.0, gt=0, le=90)
    apply: bool = False
    flag_name: str = Field(default="Tower Shadow", min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_tower_shadow_request(self) -> "TowerShadowRequest":
        if self.method == TowerShadowMethod.manual and not self.boom_orientations:
            raise ValueError("boom_orientations are required for manual tower shadow detection")
        return self


class TowerShadowSectorResponse(BaseModel):
    direction_start: float
    direction_end: float
    affected_column_ids: list[uuid.UUID] = Field(default_factory=list)
    affected_column_names: list[str] = Field(default_factory=list)
    point_count: int = 0
    range_count: int = 0


class TowerShadowResponse(BaseModel):
    method: TowerShadowMethod
    direction_column_id: uuid.UUID
    sectors: list[TowerShadowSectorResponse] = Field(default_factory=list)
    preview_point_count: int = 0
    applied: bool = False
    flag_id: uuid.UUID | None = None
    flag_name: str | None = None


class GapSegmentResponse(BaseModel):
    start_time: datetime
    end_time: datetime
    duration_hours: float
    num_missing: int


class ReconstructionPreviewResponse(BaseModel):
    timestamps: list[datetime] = Field(default_factory=list)
    original_values: list[float | None] = Field(default_factory=list)
    reconstructed_values: list[float | None] = Field(default_factory=list)
    filled_mask: list[bool] = Field(default_factory=list)


class ReconstructionSummaryResponse(BaseModel):
    expected_step_seconds: int
    gap_count: int
    original_missing_count: int
    filled_count: int
    remaining_missing_count: int
    fill_ratio_pct: float
    recovery_before_pct: float
    recovery_after_pct: float
    original_mean: float | None = None
    reconstructed_mean: float | None = None
    original_std: float | None = None
    reconstructed_std: float | None = None


class ReconstructedColumnResponse(BaseModel):
    id: uuid.UUID
    name: str
    unit: str | None = None
    measurement_type: str | None = None
    height_m: float | None = None


class ReconstructionRequest(BaseModel):
    column_id: uuid.UUID
    method: ReconstructionMethod
    save_mode: ReconstructionSaveMode = ReconstructionSaveMode.preview
    predictor_column_ids: list[uuid.UUID] = Field(default_factory=list)
    reference_dataset_id: uuid.UUID | None = None
    reference_column_id: uuid.UUID | None = None
    max_gap_hours: int = Field(default=6, ge=1, le=168)
    n_neighbors: int = Field(default=5, ge=1, le=50)
    new_column_name: str | None = Field(default=None, min_length=1, max_length=255)

    @model_validator(mode="after")
    def validate_reconstruction_request(self) -> "ReconstructionRequest":
        if self.method == ReconstructionMethod.correlation and self.reference_column_id is None:
            raise ValueError("reference_column_id is required for correlation reconstruction")
        if self.save_mode == ReconstructionSaveMode.new_column and not self.new_column_name:
            self.new_column_name = None
        return self


class ReconstructionResponse(BaseModel):
    dataset_id: uuid.UUID
    column_id: uuid.UUID
    method: ReconstructionMethod
    save_mode: ReconstructionSaveMode
    predictor_column_ids: list[uuid.UUID] = Field(default_factory=list)
    reference_dataset_id: uuid.UUID | None = None
    reference_column_id: uuid.UUID | None = None
    gaps: list[GapSegmentResponse] = Field(default_factory=list)
    preview: ReconstructionPreviewResponse
    summary: ReconstructionSummaryResponse
    saved_column: ReconstructedColumnResponse | None = None
