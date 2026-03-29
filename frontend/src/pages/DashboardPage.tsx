import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, MapPinned, Plus, Sparkles } from "lucide-react";
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
    <div className="space-y-6">
      <section className="panel-surface overflow-hidden px-6 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <span className="font-mono text-xs uppercase tracking-[0.34em] text-ember-500">Dashboard</span>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">Project workspaces</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600 sm:text-base">
              Keep site setup, imports, QC, and downstream analysis anchored to a clean project list.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:min-w-[420px] xl:justify-end">
            <div className="panel-muted min-w-[160px] px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Projects</p>
              <p className="mt-2 text-3xl font-semibold text-ink-900">{total}</p>
            </div>
            <div className="panel-muted min-w-[160px] px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Mapped sites</p>
              <p className="mt-2 text-3xl font-semibold text-ink-900">{projectsWithCoordinates}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearError();
                setIsModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-900 px-5 py-4 text-sm font-medium text-white transition hover:bg-ink-700"
            >
              <Plus className="h-4 w-4" />
              New project
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {error ? (
            <div className="panel-surface flex items-start gap-3 border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {isLoadingProjects ? (
            <div className="panel-surface p-6">
              <LoadingSpinner label="Loading projects" />
            </div>
          ) : projects.length > 0 ? (
            <ProjectList projects={projects} />
          ) : (
            <div className="panel-surface p-8">
              <Sparkles className="h-5 w-5 text-ember-500" />
              <h2 className="mt-4 text-2xl font-semibold text-ink-900">Create your first campaign workspace</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-ink-600">Add a project, then bring in logger or spreadsheet data when you are ready.</p>
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setIsModalOpen(true);
                }}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-ember-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-ember-400"
              >
                <Plus className="h-4 w-4" />
                Create project
              </button>
            </div>
          )}

          <ProjectMap projects={projects} isDownloadingKml={isDownloadingKml} onDownloadKml={() => void handleDownloadKml()} />
        </div>

        <aside className="panel-surface p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Quick start</p>
              <h2 className="mt-3 text-2xl font-semibold text-ink-900">What happens next</h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
              <MapPinned className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-sm leading-7 text-ink-600">Build the workspace once, then move through the rest of the flow in order.</p>
          <div className="mt-6 space-y-3">
            {[
              "Create or select a project",
              "Import logger or spreadsheet files",
              "Review channel mapping and metadata",
              "Continue into QC and analysis",
            ].map((step, index) => (
              <div key={step} className="panel-muted flex items-center gap-3 px-3 py-3 text-sm text-ink-700">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <Modal
        open={isModalOpen}
        title="Create a project"
        description="Capture the site name and optional location metadata. You can refine the project details later."
        onClose={() => {
          setIsModalOpen(false);
          form.reset();
        }}
      >
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-2">
            <label htmlFor="name" className="text-sm font-medium text-ink-800">
              Project name
            </label>
            <input id="name" className="rounded-2xl border-ink-200 bg-white" {...form.register("name")} />
            {form.formState.errors.name ? <p className="text-sm text-red-600">{form.formState.errors.name.message}</p> : null}
          </div>

          <div className="grid gap-2">
            <label htmlFor="description" className="text-sm font-medium text-ink-800">
              Description
            </label>
            <textarea id="description" rows={4} className="rounded-2xl border-ink-200 bg-white" {...form.register("description")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <label htmlFor="latitude" className="text-sm font-medium text-ink-800">
                Latitude
              </label>
              <input id="latitude" type="number" step="any" className="rounded-2xl border-ink-200 bg-white" {...form.register("latitude")} />
              {form.formState.errors.latitude ? <p className="text-sm text-red-600">{form.formState.errors.latitude.message}</p> : null}
            </div>

            <div className="grid gap-2">
              <label htmlFor="longitude" className="text-sm font-medium text-ink-800">
                Longitude
              </label>
              <input id="longitude" type="number" step="any" className="rounded-2xl border-ink-200 bg-white" {...form.register("longitude")} />
              {form.formState.errors.longitude ? <p className="text-sm text-red-600">{form.formState.errors.longitude.message}</p> : null}
            </div>

            <div className="grid gap-2">
              <label htmlFor="elevation" className="text-sm font-medium text-ink-800">
                Elevation (m)
              </label>
              <input id="elevation" type="number" step="any" className="rounded-2xl border-ink-200 bg-white" {...form.register("elevation")} />
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                form.reset();
              }}
              className="rounded-2xl border border-ink-200 px-5 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <LoadingSpinner label="Creating" /> : <><Plus className="h-4 w-4" />Create project</>}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}