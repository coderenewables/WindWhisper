/* Unified Workspace Page — project-centric view with map, datasets, AI, and analysis in one layout */

import { ArrowLeft, Map, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { listProjectDatasets } from "../api/datasets";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ProjectMap } from "../components/projects/ProjectMap";
import { DataArrivalPanel } from "../components/workspace/DataArrivalPanel";
import { WorkspaceCanvas } from "../components/workspace/WorkspaceCanvas";
import { useAiStore } from "../stores/aiStore";
import { useProjectStore } from "../stores/projectStore";
import type { Project } from "../types/project";

export function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, fetchProjects, fetchProject } = useProjectStore();
  const { health, actions, fetchHealth, fetchActions, approve, reject } = useAiStore();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<Array<{ id: string; message: string; created_at: string }>>([]);

  // Load project
  useEffect(() => {
    if (!projectId) return;
    setIsLoading(true);
    fetchProject(projectId)
      .then(() => {
        const found = useProjectStore.getState().projects.find((p) => p.id === projectId);
        setProject(found ?? null);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [projectId, fetchProject]);

  // Load AI data
  useEffect(() => {
    if (!projectId) return;
    fetchHealth(projectId);
    fetchActions(projectId);
  }, [projectId, fetchHealth, fetchActions]);

  // Build recent activity from actions
  useEffect(() => {
    const activity = actions
      .filter((a) => a.status !== "pending")
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        message: `${a.title} — ${a.status}`,
        created_at: a.resolved_at ?? a.created_at,
      }));
    setRecentActivity(activity);
  }, [actions]);

  function handleApprove(actionId: string) {
    approve(actionId).then(() => {
      if (projectId) fetchActions(projectId);
    });
  }

  function handleReject(actionId: string) {
    reject(actionId).then(() => {
      if (projectId) fetchActions(projectId);
    });
  }

  function handleRefreshHealth() {
    if (projectId) fetchHealth(projectId);
  }

  if (isLoading) {
    return (
      <div className="panel-surface p-8">
        <LoadingSpinner label="Loading workspace" />
      </div>
    );
  }

  if (!project || !projectId) {
    return (
      <div className="panel-surface p-8 text-center">
        <p className="text-sm text-ink-500">Project not found</p>
        <Link to="/" className="mt-2 inline-block text-xs text-teal-600 hover:text-teal-700">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/" className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-sm font-semibold text-ink-900 dark:text-white">{project.name}</h1>
        {project.latitude != null && project.longitude != null && (
          <span className="text-[11px] text-ink-400">
            {project.latitude.toFixed(2)}°, {project.longitude.toFixed(2)}°
            {project.elevation != null ? ` · ${project.elevation}m` : ""}
          </span>
        )}
        <button
          type="button"
          onClick={handleRefreshHealth}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 text-[11px] text-ink-500 hover:border-ink-400 hover:text-ink-700 dark:border-ink-600 dark:hover:border-ink-500"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* Three-column layout on desktop */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Left column — map + datasets */}
        <aside className="space-y-4">
          {/* Project map (single project) */}
          <div className="overflow-hidden rounded-lg border border-ink-100 dark:border-ink-700">
            <div className="flex items-center gap-1.5 bg-ink-50 px-3 py-2 text-xs font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-300">
              <Map className="h-3 w-3" /> Location
            </div>
            <div className="h-48">
              <ProjectMap projects={[project]} />
            </div>
          </div>

          {/* Dataset inventory */}
          <DataArrivalPanel projectId={projectId} />
        </aside>

        {/* Center column — tabbed workspace */}
        <div className="min-w-0">
          <WorkspaceCanvas
            projectId={projectId}
            health={health}
            actions={actions}
            recentActivity={recentActivity}
            onApproveAction={handleApprove}
            onRejectAction={handleReject}
          />
        </div>
      </div>
    </div>
  );
}
