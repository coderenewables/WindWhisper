import { apiClient } from "./client";
import type { Project, ProjectListResponse, ProjectPayload } from "../types/project";

export async function listProjects(skip = 0, limit = 50): Promise<ProjectListResponse> {
  const response = await apiClient.get<ProjectListResponse>("/projects", {
    params: { skip, limit },
  });
  return response.data;
}

export async function getProject(id: string): Promise<Project> {
  const response = await apiClient.get<Project>(`/projects/${id}`);
  return response.data;
}

export async function createProject(payload: ProjectPayload): Promise<Project> {
  const response = await apiClient.post<Project>("/projects", payload);
  return response.data;
}

export async function updateProject(id: string, payload: ProjectPayload): Promise<Project> {
  const response = await apiClient.put<Project>(`/projects/${id}`, payload);
  return response.data;
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`);
}