import { apiClient } from "./client";
import type {
  ExtrapolateRequest,
  ExtrapolateResponse,
  HistogramRequest,
  HistogramResponse,
  ShearRequest,
  ShearResponse,
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

export async function createExtrapolatedChannel(datasetId: string, payload: ExtrapolateRequest): Promise<ExtrapolateResponse> {
  const response = await apiClient.post<ExtrapolateResponse>(`/analysis/extrapolate/${datasetId}`, payload);
  return response.data;
}