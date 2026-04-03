/* AI API client functions */

import { apiClient } from "./client";
import type {
  AiAction,
  AiConversation,
  AiConversationDetail,
  AiHealth,
  AiMemory,
  AiMessage,
  AiStatus,
} from "../types/ai";

// Status
export async function getAiStatus(): Promise<AiStatus> {
  const { data } = await apiClient.get<AiStatus>("/ai/status");
  return data;
}

export async function toggleAi(): Promise<AiStatus> {
  const { data } = await apiClient.post<AiStatus>("/ai/toggle");
  return data;
}

export async function configureAi(config: { llm_api_key?: string; llm_provider?: string; llm_model?: string; llm_base_url?: string }): Promise<AiStatus> {
  const { data } = await apiClient.post<AiStatus>("/ai/configure", config);
  return data;
}

// Conversations
export async function listConversations(projectId: string): Promise<AiConversation[]> {
  const { data } = await apiClient.get<AiConversation[]>(`/ai/projects/${projectId}/conversations`);
  return data;
}

export async function createConversation(projectId: string): Promise<AiConversation> {
  const { data } = await apiClient.post<AiConversation>(`/ai/projects/${projectId}/conversations`);
  return data;
}

export async function getConversation(conversationId: string): Promise<AiConversationDetail> {
  const { data } = await apiClient.get<AiConversationDetail>(`/ai/conversations/${conversationId}`);
  return data;
}

export async function sendMessage(conversationId: string, content: string): Promise<AiMessage> {
  const { data } = await apiClient.post<AiMessage>(`/ai/conversations/${conversationId}/messages`, { content });
  return data;
}

// Actions
export async function listActions(projectId: string, statusFilter?: string): Promise<AiAction[]> {
  const params = statusFilter ? { status_filter: statusFilter } : {};
  const { data } = await apiClient.get<AiAction[]>(`/ai/projects/${projectId}/actions`, { params });
  return data;
}

export async function approveAction(actionId: string): Promise<AiAction> {
  const { data } = await apiClient.post<AiAction>(`/ai/actions/${actionId}/approve`);
  return data;
}

export async function rejectAction(actionId: string, reason?: string): Promise<AiAction> {
  const { data } = await apiClient.post<AiAction>(`/ai/actions/${actionId}/reject`, { reason });
  return data;
}

// Memory
export async function listMemory(projectId: string): Promise<AiMemory[]> {
  const { data } = await apiClient.get<AiMemory[]>(`/ai/projects/${projectId}/memory`);
  return data;
}

export async function createMemory(projectId: string, memoryType: string, content: string): Promise<AiMemory> {
  const { data } = await apiClient.post<AiMemory>(`/ai/projects/${projectId}/memory`, { memory_type: memoryType, content });
  return data;
}

export async function deleteMemory(memoryId: string): Promise<void> {
  await apiClient.delete(`/ai/memory/${memoryId}`);
}

// Health
export async function getProjectHealth(projectId: string): Promise<AiHealth> {
  const { data } = await apiClient.get<AiHealth>(`/ai/projects/${projectId}/health`);
  return data;
}
