from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field


MCPMethod = Literal["linear", "variance_ratio", "matrix"]
ReferenceDataSource = Literal["era5", "merra2"]


class CorrelationPointResponse(BaseModel):
    timestamp: datetime
    site_value: float
    ref_value: float
    month: int


class MCPCorrelationStatsResponse(BaseModel):
    sample_count: int
    pearson_r: float
    r_squared: float
    rmse: float
    bias: float
    slope: float
    intercept: float
    concurrent_start: datetime
    concurrent_end: datetime


class MCPCorrelationRequest(BaseModel):
    site_dataset_id: uuid.UUID
    site_column_id: uuid.UUID
    ref_dataset_id: uuid.UUID
    ref_column_id: uuid.UUID
    site_column_ids: list[uuid.UUID] = Field(default_factory=list)
    ref_column_ids: list[uuid.UUID] = Field(default_factory=list)
    site_exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    ref_exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    max_points: Annotated[int, Field(default=2000, ge=1, le=10000)] = 2000


class MCPCorrelationResponse(BaseModel):
    site_dataset_id: uuid.UUID
    site_column_id: uuid.UUID
    ref_dataset_id: uuid.UUID
    ref_column_id: uuid.UUID
    site_column_ids: list[uuid.UUID] = Field(default_factory=list)
    ref_column_ids: list[uuid.UUID] = Field(default_factory=list)
    site_excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    ref_excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    stats: MCPCorrelationStatsResponse
    scatter_points: list[CorrelationPointResponse] = Field(default_factory=list)


class MCPPredictedPointResponse(BaseModel):
    timestamp: datetime
    value: float


class MCPMonthlyMeanResponse(BaseModel):
    month: int
    mean_speed: float
    sample_count: int


class MCPAnnualMeanResponse(BaseModel):
    year: int
    mean_speed: float
    sample_count: int


class MCPWeibullSummaryResponse(BaseModel):
    method: str
    k: float
    A: float
    mean_speed: float
    mean_power_density: float
    r_squared: float
    rmse: float
    ks_stat: float


class MCPSummaryResponse(BaseModel):
    method: MCPMethod
    sample_count: int
    start_time: datetime
    end_time: datetime
    long_term_mean_speed: float
    monthly_means: list[MCPMonthlyMeanResponse] = Field(default_factory=list)
    annual_means: list[MCPAnnualMeanResponse] = Field(default_factory=list)
    weibull: MCPWeibullSummaryResponse | None = None


class MCPCrossValidationFoldResponse(BaseModel):
    period: str
    sample_count: int
    rmse: float
    bias: float
    skill_score: float


class MCPCrossValidationResponse(BaseModel):
    fold_count: int
    rmse: float
    bias: float
    skill_score: float
    uncertainty: float
    folds: list[MCPCrossValidationFoldResponse] = Field(default_factory=list)


class MCPMatrixOutputResponse(BaseModel):
    site_column_id: uuid.UUID
    params: dict[str, float] = Field(default_factory=dict)
    stats: MCPCorrelationStatsResponse
    summary: MCPSummaryResponse
    predicted_points: list[MCPPredictedPointResponse] = Field(default_factory=list)


class MCPPredictionRequest(MCPCorrelationRequest):
    method: MCPMethod = "linear"
    max_prediction_points: Annotated[int, Field(default=5000, ge=1, le=20000)] = 5000


class MCPPredictionResponse(BaseModel):
    site_dataset_id: uuid.UUID
    site_column_id: uuid.UUID
    ref_dataset_id: uuid.UUID
    ref_column_id: uuid.UUID
    site_column_ids: list[uuid.UUID] = Field(default_factory=list)
    ref_column_ids: list[uuid.UUID] = Field(default_factory=list)
    method: MCPMethod
    site_excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    ref_excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    params: dict[str, float] = Field(default_factory=dict)
    stats: MCPCorrelationStatsResponse
    summary: MCPSummaryResponse
    predicted_points: list[MCPPredictedPointResponse] = Field(default_factory=list)
    matrix_outputs: list[MCPMatrixOutputResponse] = Field(default_factory=list)


class MCPComparisonRequest(MCPCorrelationRequest):
    methods: list[MCPMethod] = Field(default_factory=lambda: ["linear", "variance_ratio"], min_length=1)


class MCPComparisonRowResponse(BaseModel):
    method: MCPMethod
    params: dict[str, float] = Field(default_factory=dict)
    stats: MCPCorrelationStatsResponse
    summary: MCPSummaryResponse
    cross_validation: MCPCrossValidationResponse
    uncertainty: float


class MCPComparisonResponse(BaseModel):
    site_dataset_id: uuid.UUID
    site_column_id: uuid.UUID
    ref_dataset_id: uuid.UUID
    ref_column_id: uuid.UUID
    site_column_ids: list[uuid.UUID] = Field(default_factory=list)
    ref_column_ids: list[uuid.UUID] = Field(default_factory=list)
    site_excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    ref_excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    recommended_method: MCPMethod
    results: list[MCPComparisonRowResponse] = Field(default_factory=list)


class MCPReferenceDownloadRequest(BaseModel):
    project_id: uuid.UUID
    source: ReferenceDataSource
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    start_year: int = Field(ge=1950, le=2100)
    end_year: int = Field(ge=1950, le=2100)
    dataset_name: str | None = Field(default=None, min_length=1, max_length=255)
    api_key: str | None = Field(default=None, min_length=1, max_length=512)


class MCPReferenceDownloadResponse(BaseModel):
    task_id: uuid.UUID
    status: Literal["queued", "running", "completed", "failed"]
    message: str


class MCPReferenceDownloadStatusResponse(BaseModel):
    task_id: uuid.UUID
    project_id: uuid.UUID
    source: ReferenceDataSource
    status: Literal["queued", "running", "completed", "failed"]
    message: str
    progress: int = Field(ge=0, le=100)
    dataset_id: uuid.UUID | None = None
    dataset_name: str | None = None
    row_count: int = 0
    column_count: int = 0
    error: str | None = None
    started_at: datetime
    completed_at: datetime | None = None