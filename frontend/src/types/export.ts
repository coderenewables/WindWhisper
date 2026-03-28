export type ExportFormat = "csv" | "wasp-tab" | "iea-json" | "openwind";

export interface CSVExportRequest {
  column_ids?: string[];
  exclude_flags?: string[];
  resample?: string;
}

export interface WAsPTabExportRequest {
  speed_column_id: string;
  direction_column_id: string;
  exclude_flags?: string[];
  num_sectors?: 12 | 16 | 36;
  speed_bin_width?: number;
}

export interface IEAJSONExportRequest {
  column_ids?: string[];
  exclude_flags?: string[];
  resample?: string;
}

export interface OpenwindExportRequest {
  column_ids?: string[];
  exclude_flags?: string[];
  resample?: string;
}

export interface ExportDownload {
  blob: Blob;
  fileName: string;
  contentType: string;
}