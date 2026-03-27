import { apiClient } from "./client";
import type { ChangeLogListResponse, UndoResponse } from "../types/history";
import type {
  ConfirmImportPayload,
  DatasetDetail,
  DatasetImportResponse,
  DatasetListResponse,
  DatasetTimeseriesQuery,
  DatasetUploadParams,
  ExcelSheetListResponse,
  TimeSeriesResponse,
  UploadPreviewResponse,
} from "../types/dataset";

interface UploadDatasetPreviewOptions extends DatasetUploadParams {
  onUploadProgress?: (progress: number) => void;
}

export async function uploadDatasetPreview({
  projectId,
  file,
  sheetName,
  onUploadProgress,
}: UploadDatasetPreviewOptions): Promise<UploadPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (sheetName) {
    formData.append("sheet_name", sheetName);
  }

  const response = await apiClient.post<UploadPreviewResponse>(`/import/upload/${projectId}`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress: (event) => {
      if (!event.total || !onUploadProgress) {
        return;
      }
      onUploadProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return response.data;
}

export async function listImportSheets(projectId: string, importId: string): Promise<ExcelSheetListResponse> {
  const response = await apiClient.get<ExcelSheetListResponse>(`/import/sheets/${projectId}`, {
    params: { import_id: importId },
  });
  return response.data;
}

export async function confirmDatasetImport(projectId: string, payload: ConfirmImportPayload): Promise<DatasetImportResponse> {
  const response = await apiClient.post<DatasetImportResponse>(`/import/confirm/${projectId}`, payload);
  return response.data;
}

export async function listProjectDatasets(projectId: string): Promise<DatasetListResponse> {
  const response = await apiClient.get<DatasetListResponse>(`/projects/${projectId}/datasets`);
  return response.data;
}

export async function getDataset(datasetId: string): Promise<DatasetDetail> {
  const response = await apiClient.get<DatasetDetail>(`/datasets/${datasetId}`);
  return response.data;
}

export async function getDatasetTimeseries(datasetId: string, query: DatasetTimeseriesQuery): Promise<TimeSeriesResponse> {
  const response = await apiClient.get<TimeSeriesResponse>(`/datasets/${datasetId}/timeseries`, {
    params: {
      start: query.start || undefined,
      end: query.end || undefined,
      columns: query.columns?.length ? query.columns.join(",") : undefined,
      resample: query.resample || undefined,
      exclude_flags: query.exclude_flags?.length ? query.exclude_flags.join(",") : undefined,
    },
  });
  return response.data;
}

export async function getDatasetHistory(datasetId: string): Promise<ChangeLogListResponse> {
  const response = await apiClient.get<ChangeLogListResponse>(`/datasets/${datasetId}/history`);
  return response.data;
}

export async function undoDatasetChange(datasetId: string): Promise<UndoResponse> {
  const response = await apiClient.post<UndoResponse>(`/datasets/${datasetId}/undo`);
  return response.data;
}

