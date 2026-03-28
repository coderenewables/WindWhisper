from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field


DEFAULT_SPEED_BIN_EDGES = [0.0, 3.0, 6.0, 9.0, 12.0, 15.0]
DEFAULT_HISTOGRAM_BIN_COUNT = 30
DEFAULT_WEIBULL_CURVE_POINTS = 160
DEFAULT_TURBULENCE_BIN_WIDTH = 1.0
DEFAULT_EXTREME_WIND_RETURN_PERIODS = [10.0, 20.0, 50.0, 100.0]
DEFAULT_ENERGY_SPEED_BIN_WIDTH = 1.0
DEFAULT_SCATTER_MAX_POINTS = 10000
WeibullMethod = Literal["mle", "moments"]
ShearMethod = Literal["power", "log"]
AirDensityPressureSource = Literal["auto", "measured", "estimated"]


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


class ShearRequest(BaseModel):
    speed_column_ids: list[uuid.UUID] = Field(default_factory=list)
    direction_column_id: uuid.UUID | None = None
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    method: ShearMethod = "power"
    num_sectors: Literal[12, 16, 36] = 12
    target_height: float | None = Field(default=None, gt=0)


class ShearPairResponse(BaseModel):
    lower_column_id: uuid.UUID
    upper_column_id: uuid.UUID
    lower_height_m: float
    upper_height_m: float
    mean_value: float | None = None
    median_value: float | None = None
    std_value: float | None = None
    count: int = 0


class ShearProfilePointResponse(BaseModel):
    height_m: float
    mean_speed: float | None = None
    source: Literal["measured", "extrapolated"] = "measured"


class ShearDirectionBinResponse(BaseModel):
    sector_index: int
    direction: float
    start_angle: float
    end_angle: float
    mean_value: float | None = None
    median_value: float | None = None
    std_value: float | None = None
    count: int = 0


class ShearTimeOfDayResponse(BaseModel):
    hour: int
    mean_value: float | None = None
    median_value: float | None = None
    std_value: float | None = None
    count: int = 0


class ShearResponse(BaseModel):
    dataset_id: uuid.UUID
    method: ShearMethod
    excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    direction_column_id: uuid.UUID | None = None
    target_height: float | None = None
    target_mean_speed: float | None = None
    representative_pair: ShearPairResponse | None = None
    pair_stats: list[ShearPairResponse] = Field(default_factory=list)
    profile_points: list[ShearProfilePointResponse] = Field(default_factory=list)
    direction_bins: list[ShearDirectionBinResponse] = Field(default_factory=list)
    time_of_day: list[ShearTimeOfDayResponse] = Field(default_factory=list)


class TurbulenceRequest(BaseModel):
    speed_column_id: uuid.UUID
    sd_column_id: uuid.UUID
    direction_column_id: uuid.UUID | None = None
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    bin_width: float = Field(default=DEFAULT_TURBULENCE_BIN_WIDTH, gt=0, le=10)
    num_sectors: Literal[12, 16, 36] = 12
    max_scatter_points: Annotated[int, Field(default=4000, ge=200, le=10000)] = 4000


class TurbulenceScatterPointResponse(BaseModel):
    speed: float
    ti: float


class TurbulenceCurvePointResponse(BaseModel):
    speed: float
    ti: float


class TurbulenceIecCurveResponse(BaseModel):
    label: str
    reference_intensity: float
    points: list[TurbulenceCurvePointResponse] = Field(default_factory=list)


class TurbulenceSpeedBinResponse(BaseModel):
    lower: float
    upper: float
    center: float
    sample_count: int = 0
    mean_ti: float | None = None
    representative_ti: float | None = None
    p90_ti: float | None = None
    iec_class_a: float
    iec_class_b: float
    iec_class_c: float


class TurbulenceDirectionBinResponse(BaseModel):
    sector_index: int
    direction: float
    start_angle: float
    end_angle: float
    mean_ti: float | None = None
    representative_ti: float | None = None
    p90_ti: float | None = None
    sample_count: int = 0


class TurbulenceSummaryResponse(BaseModel):
    mean_ti: float | None = None
    median_ti: float | None = None
    p90_ti: float | None = None
    characteristic_ti_15: float | None = None
    iec_class: str | None = None
    sample_count: int = 0
    mean_speed: float | None = None


class TurbulenceResponse(BaseModel):
    dataset_id: uuid.UUID
    speed_column_id: uuid.UUID
    sd_column_id: uuid.UUID
    direction_column_id: uuid.UUID | None = None
    excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    bin_width: float
    num_sectors: int
    summary: TurbulenceSummaryResponse
    scatter_points: list[TurbulenceScatterPointResponse] = Field(default_factory=list)
    speed_bins: list[TurbulenceSpeedBinResponse] = Field(default_factory=list)
    direction_bins: list[TurbulenceDirectionBinResponse] = Field(default_factory=list)
    iec_curves: list[TurbulenceIecCurveResponse] = Field(default_factory=list)


class AirDensityRequest(BaseModel):
    temperature_column_id: uuid.UUID
    speed_column_id: uuid.UUID
    pressure_column_id: uuid.UUID | None = None
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    pressure_source: AirDensityPressureSource = "auto"
    elevation_m: float | None = None
    max_series_points: Annotated[int, Field(default=240, ge=24, le=1000)] = 240


class AirDensityPointResponse(BaseModel):
    timestamp: datetime
    density: float | None = None
    wind_power_density: float | None = None


class AirDensityMonthlyResponse(BaseModel):
    month: int
    label: str
    mean_density: float | None = None
    mean_wind_power_density: float | None = None
    sample_count: int = 0


class AirDensitySummaryResponse(BaseModel):
    pressure_source: AirDensityPressureSource
    elevation_m: float | None = None
    estimated_pressure_hpa: float | None = None
    mean_density: float | None = None
    median_density: float | None = None
    std_density: float | None = None
    min_density: float | None = None
    max_density: float | None = None
    mean_wind_power_density: float | None = None
    annual_wind_power_density: float | None = None
    sample_count: int = 0


class AirDensityResponse(BaseModel):
    dataset_id: uuid.UUID
    temperature_column_id: uuid.UUID
    speed_column_id: uuid.UUID
    pressure_column_id: uuid.UUID | None = None
    excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    summary: AirDensitySummaryResponse
    density_points: list[AirDensityPointResponse] = Field(default_factory=list)
    monthly: list[AirDensityMonthlyResponse] = Field(default_factory=list)


class ExtremeWindRequest(BaseModel):
    speed_column_id: uuid.UUID
    gust_column_id: uuid.UUID | None = None
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    return_periods: Annotated[list[float], Field(default_factory=lambda: list(DEFAULT_EXTREME_WIND_RETURN_PERIODS), min_length=1)]
    max_curve_points: Annotated[int, Field(default=80, ge=24, le=240)] = 80


class ExtremeWindAnnualMaximumResponse(BaseModel):
    year: int
    timestamp: datetime | None = None
    speed_max: float | None = None
    gust_max: float | None = None
    analysis_value: float | None = None


class ExtremeWindReturnPeriodResponse(BaseModel):
    return_period_years: float
    speed: float | None = None
    lower_ci: float | None = None
    upper_ci: float | None = None


class ExtremeWindObservedPointResponse(BaseModel):
    year: int
    rank: int
    return_period_years: float
    speed: float


class ExtremeWindGumbelFitResponse(BaseModel):
    location: float | None = None
    scale: float | None = None
    sample_count: int = 0


class ExtremeWindSummaryResponse(BaseModel):
    data_source: Literal["speed", "gust"] = "speed"
    record_years: float = 0.0
    annual_max_count: int = 0
    ve10: float | None = None
    ve20: float | None = None
    ve50: float | None = None
    ve100: float | None = None
    gust_factor: float | None = None
    short_record_warning: bool = False
    warning_message: str | None = None


class ExtremeWindResponse(BaseModel):
    dataset_id: uuid.UUID
    speed_column_id: uuid.UUID
    gust_column_id: uuid.UUID | None = None
    excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    summary: ExtremeWindSummaryResponse
    gumbel_fit: ExtremeWindGumbelFitResponse
    annual_maxima: list[ExtremeWindAnnualMaximumResponse] = Field(default_factory=list)
    return_periods: list[ExtremeWindReturnPeriodResponse] = Field(default_factory=list)
    return_period_curve: list[ExtremeWindReturnPeriodResponse] = Field(default_factory=list)
    observed_points: list[ExtremeWindObservedPointResponse] = Field(default_factory=list)


class ScatterRequest(BaseModel):
    x_column_id: uuid.UUID
    y_column_id: uuid.UUID
    color_column_id: uuid.UUID | None = None
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    max_points: Annotated[int, Field(default=DEFAULT_SCATTER_MAX_POINTS, ge=500, le=10000)] = DEFAULT_SCATTER_MAX_POINTS


class ScatterPointResponse(BaseModel):
    x: float
    y: float
    color: float | None = None


class ScatterResponse(BaseModel):
    dataset_id: uuid.UUID
    x_column_id: uuid.UUID
    y_column_id: uuid.UUID
    color_column_id: uuid.UUID | None = None
    excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    total_count: int = 0
    sample_count: int = 0
    is_downsampled: bool = False
    points: list[ScatterPointResponse] = Field(default_factory=list)


class ExtrapolateRequest(BaseModel):
    speed_column_ids: list[uuid.UUID] = Field(default_factory=list)
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    method: ShearMethod = "power"
    target_height: float = Field(gt=0)
    create_column: bool = False
    column_name: str | None = Field(default=None, min_length=1, max_length=255)


class ExtrapolatedColumnResponse(BaseModel):
    id: uuid.UUID
    name: str
    unit: str | None = None
    measurement_type: str | None = None
    height_m: float | None = None
    sensor_info: dict[str, object] | None = None


class ExtrapolateSummaryResponse(BaseModel):
    mean_speed: float | None = None
    median_speed: float | None = None
    std_speed: float | None = None
    count: int = 0


class ExtrapolateResponse(BaseModel):
    dataset_id: uuid.UUID
    method: ShearMethod
    target_height: float
    excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    representative_pair: ShearPairResponse | None = None
    summary: ExtrapolateSummaryResponse
    timestamps: list[datetime] = Field(default_factory=list)
    values: list[float | None] = Field(default_factory=list)
    created_column: ExtrapolatedColumnResponse | None = None


class PowerCurvePointInput(BaseModel):
    wind_speed_ms: float = Field(ge=0)
    power_kw: float = Field(ge=0)


class PowerCurvePointResponse(BaseModel):
    wind_speed_ms: float
    power_kw: float


class PowerCurveSummaryResponse(BaseModel):
    point_count: int = 0
    rated_power_kw: float = 0.0
    cut_in_speed_ms: float | None = None
    rated_speed_ms: float | None = None
    cut_out_speed_ms: float | None = None


class PowerCurveUploadResponse(BaseModel):
    file_name: str | None = None
    summary: PowerCurveSummaryResponse
    points: list[PowerCurvePointResponse] = Field(default_factory=list)


class PowerCurveLibraryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    file_name: str | None = Field(default=None, max_length=255)
    points: Annotated[list[PowerCurvePointInput], Field(min_length=2)]


class PowerCurveLibraryUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    file_name: str | None = Field(default=None, max_length=255)
    points: list[PowerCurvePointInput] | None = Field(default=None, min_length=2)


class PowerCurveLibraryResponse(BaseModel):
    id: uuid.UUID
    name: str
    file_name: str | None = None
    summary: PowerCurveSummaryResponse
    points: list[PowerCurvePointResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PowerCurveLibraryListResponse(BaseModel):
    items: list[PowerCurveLibraryResponse] = Field(default_factory=list)
    total: int = 0


class EnergyEstimateRequest(BaseModel):
    speed_column_id: uuid.UUID
    power_curve_points: Annotated[list[PowerCurvePointInput], Field(min_length=2)]
    exclude_flags: list[uuid.UUID] = Field(default_factory=list)
    air_density_adjustment: bool = False
    temperature_column_id: uuid.UUID | None = None
    pressure_column_id: uuid.UUID | None = None
    pressure_source: AirDensityPressureSource = "auto"
    elevation_m: float | None = None
    density_reference_kg_per_m3: float = Field(default=1.225, gt=0)
    speed_bin_width: float = Field(default=DEFAULT_ENERGY_SPEED_BIN_WIDTH, gt=0, le=10)


class EnergyEstimateMonthlyResponse(BaseModel):
    month: int
    label: str
    energy_mwh: float = 0.0
    mean_power_kw: float | None = None
    sample_count: int = 0


class EnergyEstimateSpeedBinResponse(BaseModel):
    lower: float
    upper: float
    center: float
    sample_count: int = 0
    mean_power_kw: float | None = None
    energy_mwh: float = 0.0


class EnergyEstimateSummaryResponse(BaseModel):
    rated_power_kw: float = 0.0
    mean_power_kw: float = 0.0
    annual_energy_mwh: float = 0.0
    capacity_factor_pct: float = 0.0
    equivalent_full_load_hours: float = 0.0
    time_step_hours: float | None = None
    sample_count: int = 0
    air_density_adjusted: bool = False
    pressure_source: AirDensityPressureSource | None = None
    elevation_m: float | None = None
    estimated_pressure_hpa: float | None = None


class EnergyEstimateResponse(BaseModel):
    dataset_id: uuid.UUID
    speed_column_id: uuid.UUID
    temperature_column_id: uuid.UUID | None = None
    pressure_column_id: uuid.UUID | None = None
    excluded_flag_ids: list[uuid.UUID] = Field(default_factory=list)
    air_density_adjustment: bool = False
    power_curve: list[PowerCurvePointResponse] = Field(default_factory=list)
    power_curve_summary: PowerCurveSummaryResponse
    summary: EnergyEstimateSummaryResponse
    monthly: list[EnergyEstimateMonthlyResponse] = Field(default_factory=list)
    speed_bins: list[EnergyEstimateSpeedBinResponse] = Field(default_factory=list)