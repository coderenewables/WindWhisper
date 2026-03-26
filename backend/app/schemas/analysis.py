from __future__ import annotations

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, Field


DEFAULT_SPEED_BIN_EDGES = [0.0, 3.0, 6.0, 9.0, 12.0, 15.0]
DEFAULT_HISTOGRAM_BIN_COUNT = 30
DEFAULT_WEIBULL_CURVE_POINTS = 160
WeibullMethod = Literal["mle", "moments"]


class WindRoseRequest(BaseModel):
    direction_column_id: uuid.UUID
    value_column_id: uuid.UUID
    num_sectors: Literal[12, 16, 36] = 12
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    speed_bin_edges: Annotated[list[float], Field(default_factory=lambda: list(DEFAULT_SPEED_BIN_EDGES), min_length=2)]


class WindRoseSpeedBinResponse(BaseModel):
    label: str
    lower: float
    upper: float | None = None
    count: int = 0
    frequency_pct: float = 0.0


class WindRoseSectorResponse(BaseModel):
    sector_index: int
    direction: float
    start_angle: float
    end_angle: float
    sample_count: int = 0
    frequency: float = 0.0
    mean_value: float | None = None
    energy: float = 0.0
    speed_bins: list[WindRoseSpeedBinResponse] = Field(default_factory=list)


class WindRoseResponse(BaseModel):
    dataset_id: uuid.UUID
    direction_column_id: uuid.UUID
    value_column_id: uuid.UUID
    num_sectors: int
    excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    total_count: int = 0
    sectors: list[WindRoseSectorResponse] = Field(default_factory=list)


class HistogramRequest(BaseModel):
    column_id: uuid.UUID
    num_bins: Annotated[int, Field(default=DEFAULT_HISTOGRAM_BIN_COUNT, ge=1, le=200)] = DEFAULT_HISTOGRAM_BIN_COUNT
    bin_width: float | None = Field(default=None, gt=0)
    min_val: float | None = None
    max_val: float | None = None
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)


class HistogramBinResponse(BaseModel):
    lower: float
    upper: float
    count: int = 0
    frequency_pct: float = 0.0


class HistogramStatsResponse(BaseModel):
    mean: float | None = None
    std: float | None = None
    min: float | None = None
    max: float | None = None
    median: float | None = None
    count: int = 0
    data_recovery_pct: float = 0.0


class HistogramResponse(BaseModel):
    dataset_id: uuid.UUID
    column_id: uuid.UUID
    excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    bins: list[HistogramBinResponse] = Field(default_factory=list)
    stats: HistogramStatsResponse


class WeibullRequest(BaseModel):
    column_id: uuid.UUID
    num_bins: Annotated[int, Field(default=DEFAULT_HISTOGRAM_BIN_COUNT, ge=1, le=200)] = DEFAULT_HISTOGRAM_BIN_COUNT
    bin_width: float | None = Field(default=None, gt=0)
    min_val: float | None = None
    max_val: float | None = None
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    method: WeibullMethod = "mle"
    curve_points: Annotated[int, Field(default=DEFAULT_WEIBULL_CURVE_POINTS, ge=24, le=600)] = DEFAULT_WEIBULL_CURVE_POINTS


class WeibullFitResponse(BaseModel):
    method: WeibullMethod
    k: float
    A: float
    mean_speed: float
    mean_power_density: float
    r_squared: float
    rmse: float
    ks_stat: float


class WeibullCurvePointResponse(BaseModel):
    x: float
    pdf: float
    frequency_pct: float


class WeibullResponse(BaseModel):
    dataset_id: uuid.UUID
    column_id: uuid.UUID
    excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    fit: WeibullFitResponse
    curve_points: list[WeibullCurvePointResponse] = Field(default_factory=list)