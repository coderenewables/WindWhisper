import { create } from "zustand";

import { createProject, deleteProject, getProject, listProjects, updateProject } from "../api/projects";
import type { Project, ProjectPayload } from "../types/project";

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  total: number;
  isLoadingProjects: boolean;
  isSubmitting: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (payload: ProjectPayload) => Promise<Project>;
  updateProject: (id: string, payload: ProjectPayload) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  total: 0,
  isLoadingProjects: false,
  isSubmitting: false,
  error: null,
  clearError: () => set({ error: null }),
  fetchProjects: async () => {
    set({ isLoadingProjects: true, error: null });
    try {
      const response = await listProjects();
      set({ projects: response.projects, total: response.total, isLoadingProjects: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to load projects", isLoadingProjects: false });
    }
  },
  fetchProject: async (id) => {
    set({ error: null });
    try {
      const project = await getProject(id);
      set({ activeProject: project });

      const existing = get().projects;
      if (existing.some((item) => item.id === project.id)) {
        set({ projects: existing.map((item) => (item.id === project.id ? project : item)) });
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to load project", activeProject: null });
    }
  },
  createProject: async (payload) => {
    set({ isSubmitting: true, error: null });
    try {
      const project = await createProject(payload);
      set((state) => ({
        projects: [project, ...state.projects],
        total: state.total + 1,
        isSubmitting: false,
      }));
      return project;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create project";
      set({ error: message, isSubmitting: false });
      throw new Error(message);
    }
  },
  updateProject: async (id, payload) => {
    set({ isSubmitting: true, error: null });
    try {
      const project = await updateProject(id, payload);
      set((state) => ({
        projects: state.projects.map((item) => (item.id === id ? project : item)),
        activeProject: state.activeProject?.id === id ? project : state.activeProject,
        isSubmitting: false,
      }));
      return project;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update project";
      set({ error: message, isSubmitting: false });
      throw new Error(message);
    }
  },
  deleteProject: async (id) => {
    set({ isSubmitting: true, error: null });
    try {
      await deleteProject(id);
      set((state) => ({
        projects: state.projects.filter((item) => item.id !== id),
        activeProject: state.activeProject?.id === id ? null : state.activeProject,
        total: Math.max(0, state.total - 1),
        isSubmitting: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete project";
      set({ error: message, isSubmitting: false });
      throw new Error(message);
    }
  },
}));