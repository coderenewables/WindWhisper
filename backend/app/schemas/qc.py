from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


ALLOWED_OPERATORS = {"==", "!=", "<", ">", "<=", ">=", "between", "is_null"}


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
        if normalized != "AND":
            raise ValueError("Only AND logic is currently supported")
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
