import { apiClient } from "./client";
import type {
  AirDensityRequest,
  AirDensityResponse,
  EnergyEstimateRequest,
  EnergyEstimateResponse,
  ExtremeWindRequest,
  ExtremeWindResponse,
  ExtrapolateRequest,
  ExtrapolateResponse,
  HistogramRequest,
  HistogramResponse,
  MCPComparisonRequest,
  MCPComparisonResponse,
  MCPCorrelationRequest,
  MCPCorrelationResponse,
  MCPReferenceDownloadRequest,
  MCPReferenceDownloadResponse,
  MCPReferenceDownloadStatusResponse,
  MCPPredictionRequest,
  MCPPredictionResponse,
  PowerCurveLibraryCreateRequest,
  PowerCurveLibraryItem,
  PowerCurveLibraryListResponse,
  PowerCurveLibraryUpdateRequest,
  PowerCurveUploadResponse,
  ShearRequest,
  ShearResponse,
  TurbulenceRequest,
  TurbulenceResponse,
  WeibullRequest,
  WeibullResponse,
  WindRoseRequest,
  WindRoseResponse,
} from "../types/analysis";

export async function getWindRoseAnalysis(datasetId: string, payload: WindRoseRequest): Promise<WindRoseResponse> {
  const response = await apiClient.post<WindRoseResponse>(`/analysis/wind-rose/${datasetId}`, payload);
  return response.data;
}

export async function getHistogramAnalysis(datasetId: string, payload: HistogramRequest): Promise<HistogramResponse> {
  const response = await apiClient.post<HistogramResponse>(`/analysis/histogram/${datasetId}`, payload);
  return response.data;
}

export async function getWeibullAnalysis(datasetId: string, payload: WeibullRequest): Promise<WeibullResponse> {
  const response = await apiClient.post<WeibullResponse>(`/analysis/weibull/${datasetId}`, payload);
  return response.data;
}

export async function getShearAnalysis(datasetId: string, payload: ShearRequest): Promise<ShearResponse> {
  const response = await apiClient.post<ShearResponse>(`/analysis/shear/${datasetId}`, payload);
  return response.data;
}

export async function getTurbulenceAnalysis(datasetId: string, payload: TurbulenceRequest): Promise<TurbulenceResponse> {
  const response = await apiClient.post<TurbulenceResponse>(`/analysis/turbulence/${datasetId}`, payload);
  return response.data;
}

export async function getAirDensityAnalysis(datasetId: string, payload: AirDensityRequest): Promise<AirDensityResponse> {
  const response = await apiClient.post<AirDensityResponse>(`/analysis/air-density/${datasetId}`, payload);
  return response.data;
}

export async function getExtremeWindAnalysis(datasetId: string, payload: ExtremeWindRequest): Promise<ExtremeWindResponse> {
  const response = await apiClient.post<ExtremeWindResponse>(`/analysis/extreme-wind/${datasetId}`, payload);
  return response.data;
}

export async function uploadPowerCurve(file: File): Promise<PowerCurveUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<PowerCurveUploadResponse>("/analysis/power-curve/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function listPowerCurves(): Promise<PowerCurveLibraryListResponse> {
  const response = await apiClient.get<PowerCurveLibraryListResponse>("/analysis/power-curves");
  return response.data;
}

export async function createPowerCurve(payload: PowerCurveLibraryCreateRequest): Promise<PowerCurveLibraryItem> {
  const response = await apiClient.post<PowerCurveLibraryItem>("/analysis/power-curves", payload);
  return response.data;
}

export async function updatePowerCurve(curveId: string, payload: PowerCurveLibraryUpdateRequest): Promise<PowerCurveLibraryItem> {
  const response = await apiClient.put<PowerCurveLibraryItem>(`/analysis/power-curves/${curveId}`, payload);
  return response.data;
}

export async function deletePowerCurve(curveId: string): Promise<void> {
  await apiClient.delete(`/analysis/power-curves/${curveId}`);
}

export async function getEnergyEstimate(datasetId: string, payload: EnergyEstimateRequest): Promise<EnergyEstimateResponse> {
  const response = await apiClient.post<EnergyEstimateResponse>(`/analysis/energy-estimate/${datasetId}`, payload);
  return response.data;
}

export async function createExtrapolatedChannel(datasetId: string, payload: ExtrapolateRequest): Promise<ExtrapolateResponse> {
  const response = await apiClient.post<ExtrapolateResponse>(`/analysis/extrapolate/${datasetId}`, payload);
  return response.data;
}

export async function getMcpCorrelation(payload: MCPCorrelationRequest): Promise<MCPCorrelationResponse> {
  const response = await apiClient.post<MCPCorrelationResponse>("/mcp/correlate", payload);
  return response.data;
}

export async function getMcpPrediction(payload: MCPPredictionRequest): Promise<MCPPredictionResponse> {
  const response = await apiClient.post<MCPPredictionResponse>("/mcp/predict", payload);
  return response.data;
}

export async function getMcpComparison(payload: MCPComparisonRequest): Promise<MCPComparisonResponse> {
  const response = await apiClient.post<MCPComparisonResponse>("/mcp/compare", payload);
  return response.data;
}

export async function downloadMcpReferenceData(payload: MCPReferenceDownloadRequest): Promise<MCPReferenceDownloadResponse> {
  const response = await apiClient.post<MCPReferenceDownloadResponse>("/mcp/download-reference", payload);
  return response.data;
}

export async function getMcpDownloadStatus(taskId: string): Promise<MCPReferenceDownloadStatusResponse> {
  const response = await apiClient.get<MCPReferenceDownloadStatusResponse>(`/mcp/download-status/${taskId}`);
  return response.data;
}