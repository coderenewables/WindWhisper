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