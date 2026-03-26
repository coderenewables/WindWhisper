import { ArrowLeft, Database, MapPin, Radar } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useProjectStore } from "../stores/projectStore";

export function ProjectPage() {
  const params = useParams();
  const { activeProject, projects, error, fetchProject } = useProjectStore();

  const project = activeProject?.id === params.id ? activeProject : projects.find((item) => item.id === params.id) ?? null;

  useEffect(() => {
    if (params.id) {
      void fetchProject(params.id);
    }
  }, [fetchProject, params.id]);

  if (!project && !error) {
    return (
      <section className="panel-surface p-6">
        <LoadingSpinner label="Loading project details" />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="panel-surface p-6 sm:p-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-600 transition hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        {project ? (
          <>
            <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.32em] text-teal-500">Project detail</p>
                <h1 className="mt-4 text-4xl font-semibold text-ink-900">{project.name}</h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-600">
                  {project.description || "No description has been added yet. This view will grow into the project workspace with data sets, import history, and analysis summaries."}
                </p>
              </div>

              <div className="rounded-3xl border border-ink-100 bg-ink-900 px-5 py-4 text-white">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember-300">Created</p>
                <p className="mt-2 text-lg font-medium">{new Date(project.created_at).toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="panel-muted px-4 py-4">
                <div className="flex items-center gap-3 text-sm font-medium text-ink-700">
                  <MapPin className="h-4 w-4 text-teal-500" />
                  Location
                </div>
                <p className="mt-3 text-sm leading-7 text-ink-600">
                  {project.latitude != null && project.longitude != null
                    ? `${project.latitude.toFixed(3)}, ${project.longitude.toFixed(3)}`
                    : "Coordinates not set"}
                </p>
                <p className="text-sm leading-7 text-ink-600">
                  {project.elevation != null ? `${project.elevation.toFixed(1)} m elevation` : "Elevation not set"}
                </p>
              </div>
              <div className="panel-muted px-4 py-4">
                <div className="flex items-center gap-3 text-sm font-medium text-ink-700">
                  <Database className="h-4 w-4 text-teal-500" />
                  Data inventory
                </div>
                <p className="mt-3 text-3xl font-semibold text-ink-900">{project.dataset_count}</p>
                <p className="mt-1 text-sm leading-7 text-ink-600">Imported data sets currently attached to this project.</p>
              </div>
              <div className="panel-muted px-4 py-4">
                <div className="flex items-center gap-3 text-sm font-medium text-ink-700">
                  <Radar className="h-4 w-4 text-teal-500" />
                  Next task
                </div>
                <p className="mt-3 text-sm leading-7 text-ink-600">
                  Task 8 will connect this workspace to the upload and preview flow so datasets can be imported here.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error || "Project not found"}</div>
        )}
      </section>
    </div>
  );
}