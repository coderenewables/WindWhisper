import { apiClient } from "./client";
import type {
  Workflow,
  WorkflowCreateRequest,
  WorkflowListResponse,
  WorkflowRunResponse,
  WorkflowUpdateRequest,
} from "../types/workflow";

export async function listProjectWorkflows(projectId: string): Promise<WorkflowListResponse> {
  const response = await apiClient.get<WorkflowListResponse>(`/workflows/projects/${projectId}`);
  return response.data;
}

export async function createWorkflow(projectId: string, payload: WorkflowCreateRequest): Promise<Workflow> {
  const response = await apiClient.post<Workflow>(`/workflows/projects/${projectId}`, payload);
  return response.data;
}

export async function getWorkflow(workflowId: string): Promise<Workflow> {
  const response = await apiClient.get<Workflow>(`/workflows/${workflowId}`);
  return response.data;
}

export async function updateWorkflow(workflowId: string, payload: WorkflowUpdateRequest): Promise<Workflow> {
  const response = await apiClient.put<Workflow>(`/workflows/${workflowId}`, payload);
  return response.data;
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  await apiClient.delete(`/workflows/${workflowId}`);
}

export async function runWorkflow(workflowId: string): Promise<WorkflowRunResponse> {
  const response = await apiClient.post<WorkflowRunResponse>(`/workflows/${workflowId}/run`);
  return response.data;
}