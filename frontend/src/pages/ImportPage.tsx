import { AlertTriangle, ArrowRight, Bot, CheckCircle2, FileUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAi } from "../ai/AiProvider";
import { InsightBanner } from "../components/ai/InsightBanner";
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
  const [importInsight, setImportInsight] = useState<string | null>(null);
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
  const { sendPrompt } = useAi();

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
      // Check for potential issues to surface as insight
      const unmapped = uploadPreview.columns.filter((col) => col.measurement_type === null).length;
      const total = uploadPreview.columns.length;
      if (unmapped > 0 && unmapped >= total / 2) {
        setImportInsight(`${unmapped} of ${total} columns have no detected measurement type. AI can help identify the correct mappings.`);
      } else {
        setImportInsight(null);
      }
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
    <div className="space-y-3">
      {/* Compact toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold text-ink-900">Import</h1>
        <select value={activeProjectId ?? ""} onChange={(event) => handleProjectChange(event.target.value)} className="rounded-lg border-ink-200 bg-white py-1 text-xs">
          <option value="">Project</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        {selectedProject ? <span className="text-[11px] text-ink-400">{selectedProject.dataset_count} dataset(s)</span> : null}
      </div>

      {/* Compact step indicator */}
      <div className="flex gap-1">
        {[
          { id: 1, label: "Upload", icon: FileUp },
          { id: 2, label: "Map", icon: ArrowRight },
          { id: 3, label: "Confirm", icon: CheckCircle2 },
        ].map((item) => {
          const active = step === item.id;
          const complete = step > item.id;
          return (
            <div key={item.id} className={["flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition", complete ? "bg-ink-900 text-white" : active ? "bg-teal-500 text-white" : "bg-ink-50 text-ink-400"].join(" ")}>
              <item.icon className="h-3 w-3" />
              {item.label}
            </div>
          );
        })}
      </div>

      {!activeProjectId ? <p className="py-6 text-center text-xs text-ink-400">Select a project to start importing.</p> : null}

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
        <>
          {importInsight ? (
            <InsightBanner
              message={importInsight}
              severity="warning"
              actionLabel="AI Suggest"
              onAction={() => { void sendPrompt(activeProjectId, `Review the column mapping for the uploaded file "${uploadPreview.file_name}". Check for naming convention issues, incorrect measurement types, missing sensor heights, and suggest corrections.`); setImportInsight(null); }}
              onDismiss={() => setImportInsight(null)}
            />
          ) : null}
          <AiImportSuggest projectId={activeProjectId} fileName={uploadPreview.file_name} />
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
        </>
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
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
          <span>{uploadPreview.file_name}</span>
          <span>{includedCount} channels</span>
          <span>{uploadPreview.preview_rows.length} preview rows</span>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- AI Suggest button for column mapping (hidden when AI disabled) ---------- */

function AiImportSuggest({ projectId, fileName }: { projectId: string; fileName: string }) {
  const { enabled, sendPrompt } = useAi();
  if (!enabled) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2 dark:border-teal-800 dark:bg-teal-900/10">
      <Bot className="h-3.5 w-3.5 text-teal-600" />
      <span className="flex-1 text-xs text-ink-600 dark:text-ink-300">AI can review detected columns and suggest corrections.</span>
      <button
        type="button"
        onClick={() => void sendPrompt(projectId, `Review the column mapping for the uploaded file "${fileName}". Check for naming convention issues, incorrect measurement types, missing sensor heights, and suggest corrections.`)}
        className="rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-teal-700"
      >
        AI Suggest
      </button>
    </div>
  );
}
