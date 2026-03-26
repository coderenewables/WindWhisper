import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Database, FileUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { FileUploader } from "../components/import/FileUploader";
import { ColumnMapper } from "../components/import/ColumnMapper";
import { ImportPreview } from "../components/import/ImportPreview";
import { useDatasetStore } from "../stores/datasetStore";
import { useProjectStore } from "../stores/projectStore";
import type { ColumnInfo } from "../types/dataset";

type ImportStep = 1 | 2 | 3;

function buildDatasetName(fileName: string) {
  const suffixIndex = fileName.lastIndexOf(".");
  return suffixIndex > 0 ? fileName.slice(0, suffixIndex) : fileName;
}

export function ImportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialProjectId = searchParams.get("projectId") ?? (location.state as { projectId?: string } | null)?.projectId ?? null;
  const [step, setStep] = useState<ImportStep>(1);
  const [editableColumns, setEditableColumns] = useState<ColumnInfo[]>([]);
  const [defaultColumns, setDefaultColumns] = useState<ColumnInfo[]>([]);
  const [datasetName, setDatasetName] = useState("");
  const { projects, fetchProjects, fetchProject } = useProjectStore();
  const {
    uploadPreview,
    selectedProjectId,
    lastImportedDataset,
    isUploading,
    uploadProgress,
    isConfirming,
    error,
    clearError,
    setSelectedProject,
    uploadFile,
    clearUploadPreview,
    confirmImport,
  } = useDatasetStore();

  const activeProjectId = selectedProjectId ?? initialProjectId;
  const selectedProject = projects.find((project) => project.id === activeProjectId) ?? null;

  useEffect(() => {
    if (projects.length === 0) {
      void fetchProjects();
    }
  }, [fetchProjects, projects.length]);

  useEffect(() => {
    if (initialProjectId) {
      setSelectedProject(initialProjectId);
    }
  }, [initialProjectId, setSelectedProject]);

  useEffect(() => {
    if (uploadPreview) {
      setDefaultColumns(uploadPreview.columns);
      setEditableColumns(uploadPreview.columns);
      setDatasetName(buildDatasetName(uploadPreview.file_name));
      setStep(2);
    }
  }, [uploadPreview]);

  useEffect(() => {
    if (lastImportedDataset && activeProjectId) {
      void fetchProject(activeProjectId);
    }
  }, [activeProjectId, fetchProject, lastImportedDataset]);

  const includedCount = useMemo(
    () => editableColumns.filter((column) => column.measurement_type !== null).length,
    [editableColumns],
  );

  async function handleUpload(file: File) {
    if (!activeProjectId) {
      return;
    }

    clearError();
    await uploadFile(activeProjectId, file);
  }

  async function handleConfirm() {
    if (!activeProjectId) {
      return;
    }

    const importedDataset = await confirmImport(activeProjectId, datasetName.trim() || null, editableColumns);
    await fetchProject(activeProjectId);
    navigate(`/project/${activeProjectId}`, {
      state: {
        importedDataset,
      },
    });
  }

  function handleProjectChange(projectId: string) {
    setSelectedProject(projectId);
    clearUploadPreview();
    setEditableColumns([]);
    setDefaultColumns([]);
    setDatasetName("");
    setStep(1);
    setSearchParams(projectId ? { projectId } : {});
  }

  return (
    <div className="space-y-6">
      <section className="panel-surface overflow-hidden px-6 py-8 sm:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)] xl:items-end">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.34em] text-ember-500">Task 8</span>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
              Upload, map, and confirm a raw measurement file into a project workspace.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-600 sm:text-base">
              This wizard pushes files through the existing backend import engine, gives you one pass to correct channel
              mapping, and then persists the dataset into the selected project.
            </p>
          </div>

          <div className="panel-muted p-5">
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Target project
              <div className="relative">
                <select
                  value={activeProjectId ?? ""}
                  onChange={(event) => handleProjectChange(event.target.value)}
                  className="w-full appearance-none rounded-2xl border-ink-200 bg-white px-4 py-3 pr-10"
                >
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              </div>
            </label>
            <div className="mt-4 rounded-2xl border border-ink-100 bg-white/60 px-4 py-4 text-sm text-ink-700">
              {selectedProject ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-medium text-ink-900">
                    <Database className="h-4 w-4 text-teal-500" />
                    <span>{selectedProject.name}</span>
                  </div>
                  <p>{selectedProject.dataset_count} dataset(s) currently attached.</p>
                </div>
              ) : (
                <p>Choose a project before starting the upload.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          { id: 1, label: "Upload", icon: FileUp },
          { id: 2, label: "Map columns", icon: ArrowRight },
          { id: 3, label: "Confirm", icon: CheckCircle2 },
        ].map((item) => {
          const active = step === item.id;
          const complete = step > item.id;
          return (
            <div
              key={item.id}
              className={[
                "rounded-3xl border px-5 py-4 transition",
                active ? "border-teal-400 bg-teal-50/70" : "border-white/70 bg-white/60",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <div
                  className={[
                    "flex h-10 w-10 items-center justify-center rounded-full",
                    complete ? "bg-ink-900 text-white" : active ? "bg-teal-500 text-white" : "bg-white text-ink-500",
                  ].join(" ")}
                >
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-500">Step {item.id}</p>
                  <p className="text-sm font-medium text-ink-900">{item.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {!activeProjectId ? (
        <section className="panel-surface p-8">
          <div className="flex items-start gap-3 text-sm text-ink-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-ember-500" />
            <div>
              <h2 className="text-xl font-semibold text-ink-900">Project selection is required</h2>
              <p className="mt-2 max-w-2xl leading-7 text-ink-600">
                Select an existing project to route the import into the correct campaign workspace. If you need one,
                create it from the dashboard first.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="panel-surface flex items-start gap-3 border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {activeProjectId && step === 1 ? (
        <FileUploader disabled={!activeProjectId} isUploading={isUploading} uploadProgress={uploadProgress} error={error} onUpload={handleUpload} />
      ) : null}

      {activeProjectId && step === 2 && uploadPreview ? (
        <ColumnMapper
          columns={editableColumns}
          defaultColumns={defaultColumns}
          onChange={setEditableColumns}
          onBack={() => {
            clearUploadPreview();
            setStep(1);
          }}
          onContinue={() => setStep(3)}
        />
      ) : null}

      {activeProjectId && step === 3 && uploadPreview ? (
        <ImportPreview
          preview={uploadPreview}
          columns={editableColumns}
          datasetName={datasetName}
          isConfirming={isConfirming}
          onDatasetNameChange={setDatasetName}
          onBack={() => setStep(2)}
          onConfirm={handleConfirm}
        />
      ) : null}

      {activeProjectId && uploadPreview ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="panel-muted px-4 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Detected file</p>
            <p className="mt-2 text-lg font-semibold text-ink-900">{uploadPreview.file_name}</p>
          </div>
          <div className="panel-muted px-4 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Included channels</p>
            <p className="mt-2 text-lg font-semibold text-ink-900">{includedCount}</p>
          </div>
          <div className="panel-muted px-4 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Preview rows</p>
            <p className="mt-2 text-lg font-semibold text-ink-900">{uploadPreview.preview_rows.length}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
