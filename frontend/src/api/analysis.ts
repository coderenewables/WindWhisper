import { apiClient } from "./client";
import type { HistogramRequest, HistogramResponse, WindRoseRequest, WindRoseResponse } from "../types/analysis";

export async function getWindRoseAnalysis(datasetId: string, payload: WindRoseRequest): Promise<WindRoseResponse> {
  const response = await apiClient.post<WindRoseResponse>(`/analysis/wind-rose/${datasetId}`, payload);
  return response.data;
}

export async function getHistogramAnalysis(datasetId: string, payload: HistogramRequest): Promise<HistogramResponse> {
  const response = await apiClient.post<HistogramResponse>(`/analysis/histogram/${datasetId}`, payload);
  return response.data;
}