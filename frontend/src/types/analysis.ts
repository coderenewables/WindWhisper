export interface WindRoseSpeedBin {
  label: string;
  lower: number;
  upper: number | null;
  count: number;
  frequency_pct: number;
}

export interface WindRoseSector {
  sector_index: number;
  direction: number;
  start_angle: number;
  end_angle: number;
  sample_count: number;
  frequency: number;
  mean_value: number | null;
  energy: number;
  speed_bins: WindRoseSpeedBin[];
}

export interface WindRoseResponse {
  dataset_id: string;
  direction_column_id: string;
  value_column_id: string;
  num_sectors: number;
  excluded_flag_ids: string[];
  total_count: number;
  sectors: WindRoseSector[];
}

export interface WindRoseRequest {
  direction_column_id: string;
  value_column_id: string;
  num_sectors: 12 | 16 | 36;
  exclude_flags?: string[];
  speed_bin_edges?: number[];
}

export interface HistogramBin {
  lower: number;
  upper: number;
  count: number;
  frequency_pct: number;
}

export interface HistogramStats {
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  count: number;
  data_recovery_pct: number;
}

export interface HistogramResponse {
  dataset_id: string;
  column_id: string;
  excluded_flag_ids: string[];
  bins: HistogramBin[];
  stats: HistogramStats;
}

export interface HistogramRequest {
  column_id: string;
  num_bins?: number;
  bin_width?: number;
  min_val?: number;
  max_val?: number;
  exclude_flags?: string[];
}

export type WeibullMethod = "mle" | "moments";

export interface WeibullFit {
  method: WeibullMethod;
  k: number;
  A: number;
  mean_speed: number;
  mean_power_density: number;
  r_squared: number;
  rmse: number;
  ks_stat: number;
}

export interface WeibullCurvePoint {
  x: number;
  pdf: number;
  frequency_pct: number;
}

export interface WeibullResponse {
  dataset_id: string;
  column_id: string;
  excluded_flag_ids: string[];
  fit: WeibullFit;
  curve_points: WeibullCurvePoint[];
}

export interface WeibullRequest extends HistogramRequest {
  method?: WeibullMethod;
  curve_points?: number;
}

export type ShearMethod = "power" | "log";

export interface ShearPair {
  lower_column_id: string;
  upper_column_id: string;
  lower_height_m: number;
  upper_height_m: number;
  mean_value: number | null;
  median_value: number | null;
  std_value: number | null;
  count: number;
}

export interface ShearProfilePoint {
  height_m: number;
  mean_speed: number | null;
  source: "measured" | "extrapolated";
}

export interface ShearDirectionBin {
  sector_index: number;
  direction: number;
  start_angle: number;
  end_angle: number;
  mean_value: number | null;
  median_value: number | null;
  std_value: number | null;
  count: number;
}

export interface ShearTimeOfDayBin {
  hour: number;
  mean_value: number | null;
  median_value: number | null;
  std_value: number | null;
  count: number;
}

export interface ShearRequest {
  speed_column_ids?: string[];
  direction_column_id?: string;
  exclude_flags?: string[];
  method?: ShearMethod;
  num_sectors?: 12 | 16 | 36;
  target_height?: number;
}

export interface ShearResponse {
  dataset_id: string;
  method: ShearMethod;
  excluded_flag_ids: string[];
  direction_column_id: string | null;
  target_height: number | null;
  target_mean_speed: number | null;
  representative_pair: ShearPair | null;
  pair_stats: ShearPair[];
  profile_points: ShearProfilePoint[];
  direction_bins: ShearDirectionBin[];
  time_of_day: ShearTimeOfDayBin[];
}

export interface TurbulenceRequest {
  speed_column_id: string;
  sd_column_id: string;
  direction_column_id?: string;
  exclude_flags?: string[];
  bin_width?: number;
  num_sectors?: 12 | 16 | 36;
  max_scatter_points?: number;
}

export interface TurbulenceScatterPoint {
  speed: number;
  ti: number;
}

export interface TurbulenceCurvePoint {
  speed: number;
  ti: number;
}

export interface TurbulenceIecCurve {
  label: string;
  reference_intensity: number;
  points: TurbulenceCurvePoint[];
}

export interface TurbulenceSpeedBin {
  lower: number;
  upper: number;
  center: number;
  sample_count: number;
  mean_ti: number | null;
  representative_ti: number | null;
  p90_ti: number | null;
  iec_class_a: number;
  iec_class_b: number;
  iec_class_c: number;
}

export interface TurbulenceDirectionBin {
  sector_index: number;
  direction: number;
  start_angle: number;
  end_angle: number;
  mean_ti: number | null;
  representative_ti: number | null;
  p90_ti: number | null;
  sample_count: number;
}

export interface TurbulenceSummary {
  mean_ti: number | null;
  median_ti: number | null;
  p90_ti: number | null;
  characteristic_ti_15: number | null;
  iec_class: string | null;
  sample_count: number;
  mean_speed: number | null;
}

export interface TurbulenceResponse {
  dataset_id: string;
  speed_column_id: string;
  sd_column_id: string;
  direction_column_id: string | null;
  excluded_flag_ids: string[];
  bin_width: number;
  num_sectors: number;
  summary: TurbulenceSummary;
  scatter_points: TurbulenceScatterPoint[];
  speed_bins: TurbulenceSpeedBin[];
  direction_bins: TurbulenceDirectionBin[];
  iec_curves: TurbulenceIecCurve[];
}

export type AirDensityPressureSource = "auto" | "measured" | "estimated";

export interface AirDensityRequest {
  temperature_column_id: string;
  speed_column_id: string;
  pressure_column_id?: string;
  exclude_flags?: string[];
  pressure_source?: AirDensityPressureSource;
  elevation_m?: number;
  max_series_points?: number;
}

export interface AirDensityPoint {
  timestamp: string;
  density: number | null;
  wind_power_density: number | null;
}

export interface AirDensityMonthly {
  month: number;
  label: string;
  mean_density: number | null;
  mean_wind_power_density: number | null;
  sample_count: number;
}

export interface AirDensitySummary {
  pressure_source: AirDensityPressureSource;
  elevation_m: number | null;
  estimated_pressure_hpa: number | null;
  mean_density: number | null;
  median_density: number | null;
  std_density: number | null;
  min_density: number | null;
  max_density: number | null;
  mean_wind_power_density: number | null;
  annual_wind_power_density: number | null;
  sample_count: number;
}

export interface AirDensityResponse {
  dataset_id: string;
  temperature_column_id: string;
  speed_column_id: string;
  pressure_column_id: string | null;
  excluded_flag_ids: string[];
  summary: AirDensitySummary;
  density_points: AirDensityPoint[];
  monthly: AirDensityMonthly[];
}

export interface ExtremeWindRequest {
  speed_column_id: string;
  gust_column_id?: string;
  exclude_flags?: string[];
  return_periods?: number[];
  max_curve_points?: number;
}

export interface ExtremeWindAnnualMaximum {
  year: number;
  timestamp: string | null;
  speed_max: number | null;
  gust_max: number | null;
  analysis_value: number | null;
}

export interface ExtremeWindReturnPeriod {
  return_period_years: number;
  speed: number | null;
  lower_ci: number | null;
  upper_ci: number | null;
}

export interface ExtremeWindObservedPoint {
  year: number;
  rank: number;
  return_period_years: number;
  speed: number;
}

export interface ExtremeWindGumbelFit {
  location: number | null;
  scale: number | null;
  sample_count: number;
}

export interface ExtremeWindSummary {
  data_source: "speed" | "gust";
  record_years: number;
  annual_max_count: number;
  ve10: number | null;
  ve20: number | null;
  ve50: number | null;
  ve100: number | null;
  gust_factor: number | null;
  short_record_warning: boolean;
  warning_message: string | null;
}

export interface PowerCurvePoint {
  wind_speed_ms: number;
  power_kw: number;
}

export interface PowerCurveSummary {
  point_count: number;
  rated_power_kw: number;
  cut_in_speed_ms: number | null;
  rated_speed_ms: number | null;
  cut_out_speed_ms: number | null;
}

export interface PowerCurveUploadResponse {
  file_name: string | null;
  summary: PowerCurveSummary;
  points: PowerCurvePoint[];
}

export interface PowerCurveLibraryItem {
  id: string;
  name: string;
  file_name: string | null;
  summary: PowerCurveSummary;
  points: PowerCurvePoint[];
  created_at: string;
  updated_at: string;
}

export interface PowerCurveLibraryListResponse {
  items: PowerCurveLibraryItem[];
  total: number;
}

export interface PowerCurveLibraryCreateRequest {
  name: string;
  file_name?: string | null;
  points: PowerCurvePoint[];
}

export interface PowerCurveLibraryUpdateRequest {
  name?: string;
  file_name?: string | null;
  points?: PowerCurvePoint[];
}

export interface EnergyEstimateRequest {
  speed_column_id: string;
  power_curve_points: PowerCurvePoint[];
  exclude_flags?: string[];
  air_density_adjustment?: boolean;
  temperature_column_id?: string;
  pressure_column_id?: string;
  pressure_source?: AirDensityPressureSource;
  elevation_m?: number;
  density_reference_kg_per_m3?: number;
  speed_bin_width?: number;
}

export interface EnergyEstimateMonthly {
  month: number;
  label: string;
  energy_mwh: number;
  mean_power_kw: number | null;
  sample_count: number;
}

export interface EnergyEstimateSpeedBin {
  lower: number;
  upper: number;
  center: number;
  sample_count: number;
  mean_power_kw: number | null;
  energy_mwh: number;
}

export interface EnergyEstimateSummary {
  rated_power_kw: number;
  mean_power_kw: number;
  annual_energy_mwh: number;
  capacity_factor_pct: number;
  equivalent_full_load_hours: number;
  time_step_hours: number | null;
  sample_count: number;
  air_density_adjusted: boolean;
  pressure_source: AirDensityPressureSource | null;
  elevation_m: number | null;
  estimated_pressure_hpa: number | null;
}

export interface EnergyEstimateResponse {
  dataset_id: string;
  speed_column_id: string;
  temperature_column_id: string | null;
  pressure_column_id: string | null;
  excluded_flag_ids: string[];
  air_density_adjustment: boolean;
  power_curve: PowerCurvePoint[];
  power_curve_summary: PowerCurveSummary;
  summary: EnergyEstimateSummary;
  monthly: EnergyEstimateMonthly[];
  speed_bins: EnergyEstimateSpeedBin[];
}

export type MCPMethod = "linear" | "variance_ratio" | "matrix";
export type MCPReferenceDataSource = "era5" | "merra2";

export interface MCPCorrelationPoint {
  timestamp: string;
  site_value: number;
  ref_value: number;
  month: number;
}

export interface MCPCorrelationStats {
  sample_count: number;
  pearson_r: number;
  r_squared: number;
  rmse: number;
  bias: number;
  slope: number;
  intercept: number;
  concurrent_start: string;
  concurrent_end: string;
}

export interface MCPCorrelationRequest {
  site_dataset_id: string;
  site_column_id: string;
  ref_dataset_id: string;
  ref_column_id: string;
  site_column_ids?: string[];
  ref_column_ids?: string[];
  site_exclude_flags?: string[];
  ref_exclude_flags?: string[];
  max_points?: number;
}

export interface MCPCorrelationResponse {
  site_dataset_id: string;
  site_column_id: string;
  ref_dataset_id: string;
  ref_column_id: string;
  site_column_ids: string[];
  ref_column_ids: string[];
  site_excluded_flag_ids: string[];
  ref_excluded_flag_ids: string[];
  stats: MCPCorrelationStats;
  scatter_points: MCPCorrelationPoint[];
}

export interface MCPPredictedPoint {
  timestamp: string;
  value: number;
}

export interface MCPMonthlyMean {
  month: number;
  mean_speed: number;
  sample_count: number;
}

export interface MCPAnnualMean {
  year: number;
  mean_speed: number;
  sample_count: number;
}

export interface MCPWeibullSummary {
  method: string;
  k: number;
  A: number;
  mean_speed: number;
  mean_power_density: number;
  r_squared: number;
  rmse: number;
  ks_stat: number;
}

export interface MCPSummary {
  method: MCPMethod;
  sample_count: number;
  start_time: string;
  end_time: string;
  long_term_mean_speed: number;
  monthly_means: MCPMonthlyMean[];
  annual_means: MCPAnnualMean[];
  weibull: MCPWeibullSummary | null;
}

export interface MCPCrossValidationFold {
  period: string;
  sample_count: number;
  rmse: number;
  bias: number;
  skill_score: number;
}

export interface MCPCrossValidation {
  fold_count: number;
  rmse: number;
  bias: number;
  skill_score: number;
  uncertainty: number;
  folds: MCPCrossValidationFold[];
}

export interface MCPMatrixOutput {
  site_column_id: string;
  params: Record<string, number>;
  stats: MCPCorrelationStats;
  summary: MCPSummary;
  predicted_points: MCPPredictedPoint[];
}

export interface MCPPredictionRequest extends MCPCorrelationRequest {
  method?: MCPMethod;
  max_prediction_points?: number;
}

export interface MCPPredictionResponse {
  site_dataset_id: string;
  site_column_id: string;
  ref_dataset_id: string;
  ref_column_id: string;
  site_column_ids: string[];
  ref_column_ids: string[];
  method: MCPMethod;
  site_excluded_flag_ids: string[];
  ref_excluded_flag_ids: string[];
  params: Record<string, number>;
  stats: MCPCorrelationStats;
  summary: MCPSummary;
  predicted_points: MCPPredictedPoint[];
  matrix_outputs: MCPMatrixOutput[];
}

export interface MCPComparisonRequest extends MCPCorrelationRequest {
  methods?: MCPMethod[];
}

export interface MCPComparisonRow {
  method: MCPMethod;
  params: Record<string, number>;
  stats: MCPCorrelationStats;
  summary: MCPSummary;
  cross_validation: MCPCrossValidation;
  uncertainty: number;
}

export interface MCPComparisonResponse {
  site_dataset_id: string;
  site_column_id: string;
  ref_dataset_id: string;
  ref_column_id: string;
  site_column_ids: string[];
  ref_column_ids: string[];
  site_excluded_flag_ids: string[];
  ref_excluded_flag_ids: string[];
  recommended_method: MCPMethod;
  results: MCPComparisonRow[];
}

export interface MCPReferenceDownloadRequest {
  project_id: string;
  source: MCPReferenceDataSource;
  latitude: number;
  longitude: number;
  start_year: number;
  end_year: number;
  dataset_name?: string | null;
  api_key?: string | null;
}

export interface MCPReferenceDownloadResponse {
  task_id: string;
  status: "queued" | "running" | "completed" | "failed";
  message: string;
}

export interface MCPReferenceDownloadStatusResponse {
  task_id: string;
  project_id: string;
  source: MCPReferenceDataSource;
  status: "queued" | "running" | "completed" | "failed";
  message: string;
  progress: number;
  dataset_id: string | null;
  dataset_name: string | null;
  row_count: number;
  column_count: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ExtremeWindResponse {
  dataset_id: string;
  speed_column_id: string;
  gust_column_id: string | null;
  excluded_flag_ids: string[];
  summary: ExtremeWindSummary;
  gumbel_fit: ExtremeWindGumbelFit;
  annual_maxima: ExtremeWindAnnualMaximum[];
  return_periods: ExtremeWindReturnPeriod[];
  return_period_curve: ExtremeWindReturnPeriod[];
  observed_points: ExtremeWindObservedPoint[];
}

export interface ExtrapolatedColumn {
  id: string;
  name: string;
  unit: string | null;
  measurement_type: string | null;
  height_m: number | null;
  sensor_info: Record<string, unknown> | null;
}

export interface ExtrapolateSummary {
  mean_speed: number | null;
  median_speed: number | null;
  std_speed: number | null;
  count: number;
}

export interface ExtrapolateRequest {
  speed_column_ids?: string[];
  exclude_flags?: string[];
  method?: ShearMethod;
  target_height: number;
  create_column?: boolean;
  column_name?: string;
}

export interface ExtrapolateResponse {
  dataset_id: string;
  method: ShearMethod;
  target_height: number;
  excluded_flag_ids: string[];
  representative_pair: ShearPair | null;
  summary: ExtrapolateSummary;
  timestamps: string[];
  values: Array<number | null>;
  created_column: ExtrapolatedColumn | null;
}