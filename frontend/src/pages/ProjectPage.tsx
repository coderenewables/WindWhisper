import { ArrowLeft, CheckCircle2, Database, FileUp, LineChart, MapPin, Radar, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { listProjectDatasets } from "../api/datasets";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import type { DatasetImportResponse, DatasetSummary } from "../types/dataset";
import { useProjectStore } from "../stores/projectStore";

export function ProjectPage() {
  const params = useParams();
  const location = useLocation();
  const { activeProject, projects, error, fetchProject } = useProjectStore();
  const importedDataset = (location.state as { importedDataset?: DatasetImportResponse } | null)?.importedDataset;
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);

  const project = activeProject?.id === params.id ? activeProject : projects.find((item) => item.id === params.id) ?? null;

  useEffect(() => {
    if (params.id) {
      void fetchProject(params.id);
    }
  }, [fetchProject, params.id]);

  useEffect(() => {
    if (!params.id) {
      return;
    }

    let cancelled = false;
    setIsLoadingDatasets(true);
    void listProjectDatasets(params.id)
      .then((response) => {
        if (!cancelled) {
          setDatasets(response.datasets);
          setIsLoadingDatasets(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDatasets([]);
          setIsLoadingDatasets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [importedDataset, params.id]);

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

        {importedDataset ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50/90 p-4 text-sm text-teal-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium text-teal-900">Dataset imported successfully</p>
              <p className="mt-1">
                {importedDataset.name} was added with {importedDataset.column_count} mapped columns and {importedDataset.row_count.toLocaleString()} rows.
              </p>
            </div>
          </div>
        ) : null}

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

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  to={`/import?projectId=${project.id}`}
                  state={{ projectId: project.id }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ember-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-ember-400"
                >
                  <FileUp className="h-4 w-4" />
                  Import dataset
                </Link>
                <div className="rounded-3xl border border-ink-100 bg-ink-900 px-5 py-4 text-white">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ember-300">Created</p>
                  <p className="mt-2 text-lg font-medium">{new Date(project.created_at).toLocaleString()}</p>
                </div>
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
                  Use the import action above to upload raw logger files into this project, review channel detection, and confirm the dataset.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Datasets</p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink-900">Available time-series sources</h2>
                </div>
                {project.dataset_count > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    <Link
                      to={`/time-series?projectId=${project.id}${datasets[0] ? `&datasetId=${datasets[0].id}` : ""}`}
                      className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900"
                    >
                      <LineChart className="h-4 w-4" />
                      Time-series
                    </Link>
                    <Link
                      to={`/qc?projectId=${project.id}${datasets[0] ? `&datasetId=${datasets[0].id}` : ""}`}
                      className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      QC workspace
                    </Link>
                  </div>
                ) : null}
              </div>

              {isLoadingDatasets ? (
                <div className="mt-4 panel-surface p-4">
                  <LoadingSpinner label="Loading datasets" />
                </div>
              ) : datasets.length > 0 ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {datasets.map((dataset) => (
                    <div key={dataset.id} className="panel-muted flex items-center justify-between gap-4 px-4 py-4">
                      <div className="min-w-0">
                        <p className="text-lg font-semibold text-ink-900">{dataset.name}</p>
                        <p className="mt-1 text-sm leading-7 text-ink-600">
                          {dataset.row_count.toLocaleString()} rows · {dataset.column_count} channels
                        </p>
                      </div>
                      <div className="text-right text-xs uppercase tracking-[0.18em] text-ink-500">
                        <p>{dataset.time_step_seconds ? `${Math.round(dataset.time_step_seconds / 60)} min` : "variable step"}</p>
                        <p className="mt-1">{dataset.source_type ?? "uploaded"}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Link
                          to={`/time-series?projectId=${project.id}&datasetId=${dataset.id}`}
                          className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-700 transition hover:border-ink-400 hover:text-ink-900"
                        >
                          <LineChart className="h-4 w-4" />
                          Chart
                        </Link>
                        <Link
                          to={`/qc?projectId=${project.id}&datasetId=${dataset.id}`}
                          className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-700 transition hover:border-ink-400 hover:text-ink-900"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          QC
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 panel-muted px-4 py-4 text-sm text-ink-600">No datasets have been imported for this project yet.</div>
              )}
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error || "Project not found"}</div>
        )}
      </section>
    </div>
  );
}