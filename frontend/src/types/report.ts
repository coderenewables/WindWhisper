export type ReportFormat = "pdf" | "docx";

export type ReportSectionId =
  | "title_page"
  | "executive_summary"
  | "site_description"
  | "data_summary"
  | "qc_summary"
  | "wind_rose"
  | "frequency_distribution"
  | "wind_shear"
  | "turbulence"
  | "air_density"
  | "extreme_wind"
  | "long_term_adjustment"
  | "energy_estimate";

export interface ReportColumnSelection {
  speed_column_id?: string;
  direction_column_id?: string;
  temperature_column_id?: string;
  pressure_column_id?: string;
  turbulence_column_id?: string;
  gust_column_id?: string;
  shear_column_ids?: string[];
}

export interface ReportGenerateRequest {
  dataset_id: string;
  sections?: ReportSectionId[];
  exclude_flags?: string[];
  format?: ReportFormat;
  title?: string;
  column_selection?: ReportColumnSelection;
  power_curve_id?: string;
}

export interface ReportDownload {
  blob: Blob;
  fileName: string;
  contentType: string;
}
