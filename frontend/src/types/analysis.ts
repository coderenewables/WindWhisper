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