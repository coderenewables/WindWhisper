import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { downloadProjectKmlExport } from "../api/export";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { ProjectMap } from "../components/projects/ProjectMap";
import { ProjectList } from "../components/projects/ProjectList";
import { useProjectStore } from "../stores/projectStore";

const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(255, "Project name is too long"),
  description: z.string().optional(),
  latitude: z.union([z.literal(""), z.coerce.number().min(-90).max(90)]),
  longitude: z.union([z.literal(""), z.coerce.number().min(-180).max(180)]),
  elevation: z.union([z.literal(""), z.coerce.number()]),
});

type ProjectFormInput = z.input<typeof projectFormSchema>;
type ProjectFormValues = z.output<typeof projectFormSchema>;

export function DashboardPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDownloadingKml, setIsDownloadingKml] = useState(false);
  const { projects, total, error, isLoadingProjects, isSubmitting, fetchProjects, createProject, clearError } = useProjectStore();
  const projectsWithCoordinates = projects.filter((project) => project.latitude !== null && project.longitude !== null).length;

  const form = useForm<ProjectFormInput, unknown, ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
      description: "",
      latitude: "",
      longitude: "",
      elevation: "",
    },
  });

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  async function onSubmit(values: ProjectFormValues) {
    await createProject({
      name: values.name.trim(),
      description: values.description?.trim() || null,
      latitude: values.latitude === "" ? null : values.latitude,
      longitude: values.longitude === "" ? null : values.longitude,
      elevation: values.elevation === "" ? null : values.elevation,
    });
    form.reset();
    setIsModalOpen(false);
  }

  async function handleDownloadKml() {
    setIsDownloadingKml(true);
    clearError();

    try {
      const download = await downloadProjectKmlExport({
        project_ids: projects.map((project) => project.id),
      });

      const url = window.URL.createObjectURL(download.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = download.fileName;
      document.body.append(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : "Unable to export project KML";
      useProjectStore.setState({ error: message });
    } finally {
      setIsDownloadingKml(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Compact header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink-900">Projects</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-400">{total} project{total !== 1 ? "s" : ""}</span>
          <button
            type="button"
            onClick={() => { clearError(); setIsModalOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ink-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 p-3 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Map */}
      <ProjectMap projects={projects} isDownloadingKml={isDownloadingKml} onDownloadKml={() => void handleDownloadKml()} />

      {/* Project list */}
      {isLoadingProjects ? (
        <div className="panel-surface p-6">
          <LoadingSpinner label="Loading projects" />
        </div>
      ) : projects.length > 0 ? (
        <ProjectList projects={projects} />
      ) : (
        <div className="panel-surface flex flex-col items-center py-12 text-center">
          <Sparkles className="h-5 w-5 text-ember-500" />
          <p className="mt-3 text-sm text-ink-500">No projects yet</p>
          <button
            type="button"
            onClick={() => { clearError(); setIsModalOpen(true); }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-ember-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-ember-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Create project
          </button>
        </div>
      )}

      <Modal
        open={isModalOpen}
        title="New project"
        description=""
        onClose={() => { setIsModalOpen(false); form.reset(); }}
      >
        <form className="grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-1">
            <label htmlFor="name" className="text-xs font-medium text-ink-800">Name</label>
            <input id="name" className="rounded-lg border-ink-200 bg-white text-sm" {...form.register("name")} />
            {form.formState.errors.name ? <p className="text-xs text-red-600">{form.formState.errors.name.message}</p> : null}
          </div>

          <div className="grid gap-1">
            <label htmlFor="description" className="text-xs font-medium text-ink-800">Description</label>
            <textarea id="description" rows={2} className="rounded-lg border-ink-200 bg-white text-sm" {...form.register("description")} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1">
              <label htmlFor="latitude" className="text-xs font-medium text-ink-800">Lat</label>
              <input id="latitude" type="number" step="any" className="rounded-lg border-ink-200 bg-white text-sm" {...form.register("latitude")} />
              {form.formState.errors.latitude ? <p className="text-xs text-red-600">{form.formState.errors.latitude.message}</p> : null}
            </div>
            <div className="grid gap-1">
              <label htmlFor="longitude" className="text-xs font-medium text-ink-800">Lon</label>
              <input id="longitude" type="number" step="any" className="rounded-lg border-ink-200 bg-white text-sm" {...form.register("longitude")} />
              {form.formState.errors.longitude ? <p className="text-xs text-red-600">{form.formState.errors.longitude.message}</p> : null}
            </div>
            <div className="grid gap-1">
              <label htmlFor="elevation" className="text-xs font-medium text-ink-800">Elev (m)</label>
              <input id="elevation" type="number" step="any" className="rounded-lg border-ink-200 bg-white text-sm" {...form.register("elevation")} />
            </div>
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => { setIsModalOpen(false); form.reset(); }} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:border-ink-400">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ink-700 disabled:opacity-60">
              {isSubmitting ? <LoadingSpinner label="" /> : <><Plus className="h-3.5 w-3.5" />Create</>}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}