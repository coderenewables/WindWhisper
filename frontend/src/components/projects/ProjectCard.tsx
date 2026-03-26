import { MapPin, MoveVertical, PackageOpen } from "lucide-react";
import { Link } from "react-router-dom";

import type { Project } from "../../types/project";

interface ProjectCardProps {
  project: Project;
}

function formatLocation(project: Project) {
  if (project.latitude == null || project.longitude == null) {
    return "Coordinates pending";
  }

  return `${project.latitude.toFixed(3)}, ${project.longitude.toFixed(3)}`;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      to={`/project/${project.id}`}
      className="group panel-surface block overflow-hidden p-5 transition duration-300 hover:-translate-y-1 hover:border-ember-300/70"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-teal-500">Project</p>
          <h3 className="mt-3 text-xl font-semibold text-ink-900 transition group-hover:text-ember-500">{project.name}</h3>
          <p className="mt-2 line-clamp-2 min-h-[3rem] text-sm leading-6 text-ink-600">
            {project.description || "No description yet. Add campaign context, sensors, and site notes to anchor the analysis."}
          </p>
        </div>
        <span className="rounded-full border border-ember-200 bg-ember-300/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.26em] text-ember-500">
          {project.dataset_count} data sets
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="panel-muted flex items-center gap-3 px-3 py-3 text-sm text-ink-700">
          <MapPin className="h-4 w-4 text-teal-500" />
          <span>{formatLocation(project)}</span>
        </div>
        <div className="panel-muted flex items-center gap-3 px-3 py-3 text-sm text-ink-700">
          <PackageOpen className="h-4 w-4 text-teal-500" />
          <span>{project.dataset_count} imported</span>
        </div>
        <div className="panel-muted flex items-center gap-3 px-3 py-3 text-sm text-ink-700">
          <MoveVertical className="h-4 w-4 text-teal-500" />
          <span>{new Date(project.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}