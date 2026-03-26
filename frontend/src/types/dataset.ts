export type MeasurementType =
  | "speed"
  | "direction"
  | "temperature"
  | "pressure"
  | "speed_sd"
  | "direction_sd"
  | "ti"
  | "gust"
  | "other";

export interface ColumnInfo {
  name: string;
  measurement_type: string | null;
  height_m: number | null;
  unit: string | null;
  confidence: number;
}

export interface UploadPreviewResponse {
  import_id: string;
  file_name: string;
  delimiter: string | null;
  row_count: number;
  time_step_seconds: number | null;
  preview_rows: Array<Record<string, unknown>>;
  columns: ColumnInfo[];
  sheet_names: string[];
  selected_sheet: string | null;
}

export interface ConfirmImportPayload {
  import_id: string;
  dataset_name?: string | null;
  columns: ColumnInfo[];
}

export interface DatasetImportResponse {
  dataset_id: string;
  project_id: string;
  name: string;
  row_count: number;
  column_count: number;
  time_step_seconds: number | null;
  start_time: string | null;
  end_time: string | null;
}

export interface ExcelSheetListResponse {
  import_id: string;
  sheet_names: string[];
  selected_sheet: string | null;
}

export interface DatasetUploadParams {
  projectId: string;
  file: File;
  sheetName?: string;
}

export interface DatasetColumn {
  id: string;
  name: string;
  unit: string | null;
  measurement_type: string | null;
  height_m: number | null;
  sensor_info: Record<string, unknown> | null;
}

export interface DatasetSummary {
  id: string;
  project_id: string;
  name: string;
  source_type: string | null;
  file_name: string | null;
  time_step_seconds: number | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  column_count: number;
  row_count: number;
}

export interface DatasetListResponse {
  datasets: DatasetSummary[];
  total: number;
}

export interface DatasetDetail extends DatasetSummary {
  columns: DatasetColumn[];
}

export interface TimeSeriesColumnSeries {
  name: string;
  unit: string | null;
  measurement_type: string | null;
  values: Array<number | null>;
}

export interface TimeSeriesResponse {
  dataset_id: string;
  resample: string | null;
  start_time: string | null;
  end_time: string | null;
  excluded_flag_ids: string[];
  timestamps: string[];
  columns: Record<string, TimeSeriesColumnSeries>;
}

export interface DatasetTimeseriesQuery {
  start?: string | null;
  end?: string | null;
  columns?: string[];
  resample?: string | null;
  exclude_flags?: string[];
}
