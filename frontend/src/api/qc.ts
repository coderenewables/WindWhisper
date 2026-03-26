import { apiClient } from "./client";
import type {
  Flag,
  FlagCreatePayload,
  FlaggedRange,
  FlagRule,
  FlagRuleCreatePayload,
  FlagRuleUpdatePayload,
  ManualFlagRequestPayload,
  TowerShadowRequestPayload,
  TowerShadowResponse,
} from "../types/qc";

export async function listFlags(datasetId: string): Promise<Flag[]> {
  const response = await apiClient.get<Flag[]>(`/qc/flags/${datasetId}`);
  return response.data;
}

export async function createFlag(datasetId: string, payload: FlagCreatePayload): Promise<Flag> {
  const response = await apiClient.post<Flag>(`/qc/flags/${datasetId}`, payload);
  return response.data;
}

export async function deleteFlag(flagId: string): Promise<void> {
  await apiClient.delete(`/qc/flags/${flagId}`);
}

export async function listFlagRules(flagId: string): Promise<FlagRule[]> {
  const response = await apiClient.get<FlagRule[]>(`/qc/flags/${flagId}/rules`);
  return response.data;
}

export async function createFlagRule(flagId: string, payload: FlagRuleCreatePayload): Promise<FlagRule> {
  const response = await apiClient.post<FlagRule>(`/qc/flags/${flagId}/rules`, payload);
  return response.data;
}

export async function updateFlagRule(ruleId: string, payload: FlagRuleUpdatePayload): Promise<FlagRule> {
  const response = await apiClient.put<FlagRule>(`/qc/rules/${ruleId}`, payload);
  return response.data;
}

export async function deleteFlagRule(ruleId: string): Promise<void> {
  await apiClient.delete(`/qc/rules/${ruleId}`);
}

export async function applyFlagRules(flagId: string): Promise<FlaggedRange[]> {
  const response = await apiClient.post<FlaggedRange[]>(`/qc/flags/${flagId}/apply-rules`);
  return response.data;
}

export async function listFlaggedRanges(datasetId: string): Promise<FlaggedRange[]> {
  const response = await apiClient.get<FlaggedRange[]>(`/qc/datasets/${datasetId}/flagged-ranges`);
  return response.data;
}

export async function createManualFlaggedRange(flagId: string, payload: ManualFlagRequestPayload): Promise<FlaggedRange> {
  const response = await apiClient.post<FlaggedRange>(`/qc/flags/${flagId}/manual`, payload);
  return response.data;
}

export async function deleteFlaggedRange(rangeId: string): Promise<void> {
  await apiClient.delete(`/qc/flagged-ranges/${rangeId}`);
}

export async function runTowerShadowDetection(datasetId: string, payload: TowerShadowRequestPayload): Promise<TowerShadowResponse> {
  const response = await apiClient.post<TowerShadowResponse>(`/qc/tower-shadow/${datasetId}`, payload);
  return response.data;
}
