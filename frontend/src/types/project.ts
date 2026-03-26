export interface Project {
  id: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
  created_at: string;
  updated_at: string;
  dataset_count: number;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
}

export interface ProjectPayload {
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  elevation?: number | null;
}