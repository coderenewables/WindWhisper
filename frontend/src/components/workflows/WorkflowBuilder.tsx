import {
  AlertTriangle,
  GripVertical,
  Play,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { DatasetColumn, DatasetDetail, DatasetSummary } from "../../types/dataset";
import type {
  Workflow,
  WorkflowExecutionLogEntry,
  WorkflowStepDefinition,
  WorkflowStepType,
} from "../../types/workflow";


const stepTypeLabels: Record<WorkflowStepType, string> = {
  import_file: "Import file",
  apply_qc_rules: "Apply QC rules",
  reconstruct_gaps: "Reconstruct gaps",
  calculate_shear: "Calculate shear",
  run_mcp: "Run MCP",
  generate_report: "Generate report",
  export_data: "Export data",
};

const reportSectionOptions = [
  "title_page",
  "executive_summary",
  "site_description",
  "data_summary",
  "qc_summary",
  "wind_rose",
  "frequency_distribution",
  "wind_shear",
  "turbulence",
  "air_density",
  "extreme_wind",
  "long_term_adjustment",
  "energy_estimate",
];

const defaultStepType: WorkflowStepType = "import_file";

function normalizeSteps(steps: WorkflowStepDefinition[]) {
  return steps.map((step, index) => ({
    ...step,
    order: index + 1,
  }));
}

function createEmptyStep(stepType: WorkflowStepType): WorkflowStepDefinition {
  return {
    order: 1,
    step_type: stepType,
    params: {},
  };
}

function parseMultiSelectValue(event: React.ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.target.selectedOptions, (option) => option.value);
}

interface WorkflowBuilderProps {
  projectName: string | null;
  datasets: DatasetSummary[];
  datasetDetails: Record<string, DatasetDetail>;
  workflows: Workflow[];
  selectedWorkflow: Workflow | null;
  runResult: WorkflowExecutionLogEntry[];
  workflowError: string | null;
  isSaving: boolean;
  isRunning: boolean;
  isDeleting: boolean;
  onSelectWorkflow: (workflowId: string) => void;
  onCreateWorkflow: () => void;
  onSaveWorkflow: (payload: { workflowId: string; name: string; steps: WorkflowStepDefinition[] }) => void;
  onDeleteWorkflow: (workflowId: string) => void;
  onRunWorkflow: (workflowId: string) => void;
}

export function WorkflowBuilder({
  projectName,
  datasets,
  datasetDetails,
  workflows,
  selectedWorkflow,
  runResult,
  workflowError,
  isSaving,
  isRunning,
  isDeleting,
  onSelectWorkflow,
  onCreateWorkflow,
  onSaveWorkflow,
  onDeleteWorkflow,
  onRunWorkflow,
}: WorkflowBuilderProps) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<WorkflowStepDefinition[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedWorkflow) {
      setName("");
      setSteps([]);
      return;
    }
    setName(selectedWorkflow.name);
    setSteps(normalizeSteps(selectedWorkflow.steps));
  }, [selectedWorkflow]);

  const effectiveLog = runResult.length > 0 ? runResult : selectedWorkflow?.last_run_log ?? [];

  const isDirty = useMemo(() => {
    if (!selectedWorkflow) {
      return false;
    }
    return name !== selectedWorkflow.name || JSON.stringify(normalizeSteps(steps)) !== JSON.stringify(normalizeSteps(selectedWorkflow.steps));
  }, [name, selectedWorkflow, steps]);

  function getColumns(datasetId: string, predicate?: (column: DatasetColumn) => boolean) {
    const columns = datasetDetails[datasetId]?.columns ?? [];
    return predicate ? columns.filter(predicate) : columns;
  }

  function updateStep(index: number, updater: (current: WorkflowStepDefinition) => WorkflowStepDefinition) {
    setSteps((current) => normalizeSteps(current.map((step, stepIndex) => (stepIndex === index ? updater(step) : step))));
  }

  function updateParam(index: number, key: string, value: unknown) {
    updateStep(index, (current) => ({
      ...current,
      params: {
        ...current.params,
        [key]: value,
      },
    }));
  }

  function removeStep(index: number) {
    setSteps((current) => normalizeSteps(current.filter((_, stepIndex) => stepIndex !== index)));
  }

  function addStep(stepType: WorkflowStepType) {
    setSteps((current) => normalizeSteps([...current, createEmptyStep(stepType)]));
  }

  function handleDrop(index: number) {
    if (dragIndex == null || dragIndex === index) {
      return;
    }

    setSteps((current) => {
      const next = [...current];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return normalizeSteps(next);
    });
    setDragIndex(null);
  }

  function renderDatasetSelect(index: number, field: string, value: string) {
    return (
      <label className="grid gap-2 text-sm font-medium text-ink-800">
        Dataset
        <select
          value={value}
          onChange={(event) => updateParam(index, field, event.target.value)}
          className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800"
        >
          <option value="">Select dataset</option>
          {datasets.map((dataset) => (
            <option key={dataset.id} value={dataset.id}>
              {dataset.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderColumnSelect(index: number, field: string, datasetId: string, value: string, predicate?: (column: DatasetColumn) => boolean, label = "Column") {
    const columns = getColumns(datasetId, predicate);
    return (
      <label className="grid gap-2 text-sm font-medium text-ink-800">
        {label}
        <select
          value={value}
          onChange={(event) => updateParam(index, field, event.target.value)}
          className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800"
        >
          <option value="">Select column</option>
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderMultiColumnSelect(index: number, field: string, datasetId: string, value: string[], predicate?: (column: DatasetColumn) => boolean, label = "Columns") {
    const columns = getColumns(datasetId, predicate);
    return (
      <label className="grid gap-2 text-sm font-medium text-ink-800">
        {label}
        <select
          multiple
          value={value}
          onChange={(event) => updateParam(index, field, parseMultiSelectValue(event))}
          className="min-h-28 rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800"
        >
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderStepFields(step: WorkflowStepDefinition, index: number) {
    const params = step.params;
    const datasetId = typeof params.dataset_id === "string" ? params.dataset_id : "";
    const siteDatasetId = typeof params.site_dataset_id === "string" ? params.site_dataset_id : "";
    const refDatasetId = typeof params.ref_dataset_id === "string" ? params.ref_dataset_id : "";
    const exportFormat = typeof params.format === "string" ? params.format : "csv";
    const reportFormat = typeof params.format === "string" ? params.format : "pdf";

    if (step.step_type === "import_file") {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            File path
            <input value={typeof params.file_path === "string" ? params.file_path : ""} onChange={(event) => updateParam(index, "file_path", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" placeholder="C:/data/site.csv" />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Dataset name
            <input value={typeof params.dataset_name === "string" ? params.dataset_name : ""} onChange={(event) => updateParam(index, "dataset_name", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" placeholder="Imported dataset name" />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Sheet name
            <input value={typeof params.sheet_name === "string" ? params.sheet_name : ""} onChange={(event) => updateParam(index, "sheet_name", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" placeholder="Sheet1" />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Source type
            <input value={typeof params.source_type === "string" ? params.source_type : "file_upload"} onChange={(event) => updateParam(index, "source_type", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" placeholder="file_upload" />
          </label>
        </div>
      );
    }

    if (step.step_type === "apply_qc_rules") {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {renderDatasetSelect(index, "dataset_id", datasetId)}
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Flag names
            <input value={Array.isArray(params.flag_names) ? params.flag_names.join(", ") : ""} onChange={(event) => updateParam(index, "flag_names", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" placeholder="Icing, Tower Shadow" />
          </label>
        </div>
      );
    }

    if (step.step_type === "reconstruct_gaps") {
      return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {renderDatasetSelect(index, "dataset_id", datasetId)}
          {renderColumnSelect(index, "column_id", datasetId, typeof params.column_id === "string" ? params.column_id : "", undefined, "Target column")}
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Method
            <select value={typeof params.method === "string" ? params.method : "interpolation"} onChange={(event) => updateParam(index, "method", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800">
              <option value="interpolation">Interpolation</option>
              <option value="knn">KNN</option>
              <option value="correlation">Correlation</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Save mode
            <select value={typeof params.save_mode === "string" ? params.save_mode : "preview"} onChange={(event) => updateParam(index, "save_mode", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800">
              <option value="preview">Preview</option>
              <option value="new_column">New column</option>
              <option value="overwrite">Overwrite</option>
            </select>
          </label>
          {renderMultiColumnSelect(index, "predictor_column_ids", datasetId, Array.isArray(params.predictor_column_ids) ? params.predictor_column_ids as string[] : [], undefined, "Predictor columns")}
          {renderDatasetSelect(index, "reference_dataset_id", typeof params.reference_dataset_id === "string" ? params.reference_dataset_id : "")}
          {renderColumnSelect(index, "reference_column_id", typeof params.reference_dataset_id === "string" ? params.reference_dataset_id : "", typeof params.reference_column_id === "string" ? params.reference_column_id : "", undefined, "Reference column")}
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Max gap hours
            <input type="number" value={typeof params.max_gap_hours === "number" ? params.max_gap_hours : 6} onChange={(event) => updateParam(index, "max_gap_hours", Number(event.target.value))} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" min={1} max={168} />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Neighbors
            <input type="number" value={typeof params.n_neighbors === "number" ? params.n_neighbors : 5} onChange={(event) => updateParam(index, "n_neighbors", Number(event.target.value))} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" min={1} max={50} />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            New column name
            <input value={typeof params.new_column_name === "string" ? params.new_column_name : ""} onChange={(event) => updateParam(index, "new_column_name", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" placeholder="Speed_80m_filled" />
          </label>
        </div>
      );
    }

    if (step.step_type === "calculate_shear") {
      return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {renderDatasetSelect(index, "dataset_id", datasetId)}
          {renderMultiColumnSelect(index, "speed_column_ids", datasetId, Array.isArray(params.speed_column_ids) ? params.speed_column_ids as string[] : [], (column) => column.measurement_type === "speed" && column.height_m != null, "Speed columns")}
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Target height (m)
            <input type="number" value={typeof params.target_height === "number" ? params.target_height : 100} onChange={(event) => updateParam(index, "target_height", Number(event.target.value))} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" min={1} />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Method
            <select value={typeof params.method === "string" ? params.method : "power"} onChange={(event) => updateParam(index, "method", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800">
              <option value="power">Power law</option>
              <option value="log">Log law</option>
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800">
            <input type="checkbox" checked={Boolean(params.create_column)} onChange={(event) => updateParam(index, "create_column", event.target.checked)} />
            Save extrapolated channel
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Column name
            <input value={typeof params.column_name === "string" ? params.column_name : ""} onChange={(event) => updateParam(index, "column_name", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" placeholder="Speed_120m_power" />
          </label>
        </div>
      );
    }

    if (step.step_type === "run_mcp") {
      return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {renderDatasetSelect(index, "site_dataset_id", siteDatasetId)}
          {renderColumnSelect(index, "site_column_id", siteDatasetId, typeof params.site_column_id === "string" ? params.site_column_id : "", (column) => column.measurement_type === "speed", "Site column")}
          {renderMultiColumnSelect(index, "site_column_ids", siteDatasetId, Array.isArray(params.site_column_ids) ? params.site_column_ids as string[] : [], (column) => column.measurement_type === "speed", "Extra site columns")}
          {renderDatasetSelect(index, "ref_dataset_id", refDatasetId)}
          {renderColumnSelect(index, "ref_column_id", refDatasetId, typeof params.ref_column_id === "string" ? params.ref_column_id : "", (column) => column.measurement_type === "speed", "Reference column")}
          {renderMultiColumnSelect(index, "ref_column_ids", refDatasetId, Array.isArray(params.ref_column_ids) ? params.ref_column_ids as string[] : [], (column) => column.measurement_type === "speed", "Extra ref columns")}
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Method
            <select value={typeof params.method === "string" ? params.method : "linear"} onChange={(event) => updateParam(index, "method", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800">
              <option value="linear">Linear</option>
              <option value="variance_ratio">Variance ratio</option>
              <option value="matrix">Matrix</option>
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800">
            <input type="checkbox" checked={Boolean(params.compare_methods)} onChange={(event) => updateParam(index, "compare_methods", event.target.checked)} />
            Include method comparison
          </label>
        </div>
      );
    }

    if (step.step_type === "generate_report") {
      return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {renderDatasetSelect(index, "dataset_id", datasetId)}
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Format
            <select value={reportFormat} onChange={(event) => updateParam(index, "format", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800">
              <option value="pdf">PDF</option>
              <option value="docx">Word</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Title
            <input value={typeof params.title === "string" ? params.title : ""} onChange={(event) => updateParam(index, "title", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" placeholder="Automated workflow report" />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink-800 md:col-span-2 xl:col-span-3">
            Sections
            <select
              multiple
              value={Array.isArray(params.sections) ? params.sections as string[] : []}
              onChange={(event) => updateParam(index, "sections", parseMultiSelectValue(event))}
              className="min-h-32 rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800"
            >
              {reportSectionOptions.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </label>
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {renderDatasetSelect(index, "dataset_id", datasetId)}
        <label className="grid gap-2 text-sm font-medium text-ink-800">
          Format
          <select value={exportFormat} onChange={(event) => updateParam(index, "format", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800">
            <option value="csv">CSV</option>
            <option value="wasp_tab">WAsP TAB</option>
            <option value="iea_json">IEA JSON</option>
            <option value="openwind">Openwind</option>
          </select>
        </label>
        {renderMultiColumnSelect(index, "column_ids", datasetId, Array.isArray(params.column_ids) ? params.column_ids as string[] : [], undefined, "Included columns")}
        {exportFormat === "wasp_tab" ? renderColumnSelect(index, "speed_column_id", datasetId, typeof params.speed_column_id === "string" ? params.speed_column_id : "", (column) => column.measurement_type === "speed", "Speed column") : null}
        {exportFormat === "wasp_tab" ? renderColumnSelect(index, "direction_column_id", datasetId, typeof params.direction_column_id === "string" ? params.direction_column_id : "", (column) => column.measurement_type === "direction", "Direction column") : null}
        <label className="grid gap-2 text-sm font-medium text-ink-800">
          Resample
          <input value={typeof params.resample === "string" ? params.resample : ""} onChange={(event) => updateParam(index, "resample", event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800" placeholder="1H" />
        </label>
        {exportFormat === "wasp_tab" ? (
          <label className="grid gap-2 text-sm font-medium text-ink-800">
            Sector count
            <select value={typeof params.num_sectors === "number" ? String(params.num_sectors) : "12"} onChange={(event) => updateParam(index, "num_sectors", Number(event.target.value))} className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800">
              <option value="12">12</option>
              <option value="16">16</option>
              <option value="36">36</option>
            </select>
          </label>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="panel-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Workflow library</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink-900">{projectName ?? "Project workflows"}</h2>
          </div>
          <button type="button" onClick={onCreateWorkflow} className="inline-flex items-center gap-2 rounded-2xl bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-800">
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {workflows.length > 0 ? workflows.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              onClick={() => onSelectWorkflow(workflow.id)}
              className={[
                "w-full rounded-3xl border px-4 py-4 text-left transition",
                selectedWorkflow?.id === workflow.id ? "border-teal-300 bg-teal-50/70 shadow-sm" : "border-ink-100 bg-white hover:border-ink-200",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink-900">{workflow.name}</p>
                <span className={[
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                  workflow.status === "completed" ? "bg-teal-100 text-teal-700" : workflow.status === "failed" ? "bg-rose-100 text-rose-700" : workflow.status === "running" ? "bg-amber-100 text-amber-700" : "bg-ink-100 text-ink-600",
                ].join(" ")}>{workflow.status}</span>
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">{workflow.steps.length} steps</p>
              <p className="mt-3 text-sm text-ink-600">{workflow.last_run ? `Last run ${new Date(workflow.last_run).toLocaleString()}` : "Not run yet"}</p>
            </button>
          )) : (
            <div className="rounded-3xl border border-dashed border-ink-200 px-4 py-5 text-sm text-ink-600">No workflows saved for this project yet.</div>
          )}
        </div>
      </aside>

      <section className="panel-surface p-5 sm:p-6">
        {selectedWorkflow ? (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <label className="grid gap-2 text-sm font-medium text-ink-800">
                  Workflow name
                  <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900" placeholder="Workflow name" />
                </label>
                <p className="mt-3 text-sm leading-7 text-ink-600">
                  Build an ordered automation chain for import, QC, shear, MCP, reporting, and exports. Drag steps to reorder them before saving or running.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={!isDirty || isSaving || !name.trim()} onClick={() => onSaveWorkflow({ workflowId: selectedWorkflow.id, name: name.trim(), steps: normalizeSteps(steps) })} className="inline-flex items-center gap-2 rounded-2xl bg-teal-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-teal-300">
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving" : "Save"}
                </button>
                <button type="button" disabled={isRunning || isDirty || steps.length === 0} onClick={() => onRunWorkflow(selectedWorkflow.id)} className="inline-flex items-center gap-2 rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-400">
                  <Play className="h-4 w-4" />
                  {isRunning ? "Running" : "Run workflow"}
                </button>
                <button type="button" disabled={isDeleting} onClick={() => onDeleteWorkflow(selectedWorkflow.id)} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>

            {workflowError ? (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{workflowError}</span>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              {(Object.keys(stepTypeLabels) as WorkflowStepType[]).map((stepType) => (
                <button key={stepType} type="button" onClick={() => addStep(stepType)} className="rounded-full border border-ink-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-700 transition hover:border-ink-300 hover:bg-ink-50">
                  Add {stepTypeLabels[stepType]}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              {steps.length > 0 ? steps.map((step, index) => (
                <article
                  key={`${step.order}-${index}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  className="rounded-3xl border border-ink-100 bg-white px-4 py-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-ink-100 text-sm font-semibold text-ink-700">{step.order}</span>
                      <GripVertical className="h-4 w-4 text-ink-400" />
                      <label className="grid gap-1 text-sm font-medium text-ink-800">
                        Step type
                        <select
                          value={step.step_type}
                          onChange={(event) => updateStep(index, (current) => ({ ...createEmptyStep(event.target.value as WorkflowStepType), order: current.order, params: {} }))}
                          className="rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800"
                        >
                          {(Object.keys(stepTypeLabels) as WorkflowStepType[]).map((stepType) => (
                            <option key={stepType} value={stepType}>
                              {stepTypeLabels[stepType]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <button type="button" onClick={() => removeStep(index)} className="inline-flex items-center gap-2 self-start rounded-2xl border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 transition hover:border-rose-200 hover:text-rose-700">
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>

                  <div className="mt-5">{renderStepFields(step, index)}</div>
                </article>
              )) : (
                <div className="rounded-3xl border border-dashed border-ink-200 px-5 py-6 text-sm text-ink-600">Add steps above to define an automated workflow.</div>
              )}
            </div>

            <div className="mt-8 rounded-3xl border border-ink-100 bg-ink-950 px-5 py-5 text-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-300">Execution log</p>
                  <h3 className="mt-2 text-xl font-semibold">Latest run</h3>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/70">
                  {selectedWorkflow.status}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {effectiveLog.length > 0 ? effectiveLog.map((entry) => (
                  <div key={`${entry.order}-${entry.started_at}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">Step {entry.order}: {stepTypeLabels[entry.step_type]}</p>
                        <p className="mt-1 text-sm text-white/70">{entry.message}</p>
                      </div>
                      <span className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                        entry.status === "completed" ? "bg-teal-500/20 text-teal-200" : "bg-rose-500/20 text-rose-200",
                      ].join(" ")}>{entry.status}</span>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/45">
                      {new Date(entry.started_at).toLocaleString()} to {new Date(entry.finished_at).toLocaleString()}
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/20 p-3 text-xs leading-6 text-white/80">{JSON.stringify(entry.details, null, 2)}</pre>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/15 px-4 py-5 text-sm text-white/65">This workflow has not produced a run log yet.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-ink-200 px-6 py-8 text-sm text-ink-600">Select or create a workflow to begin building automation steps.</div>
        )}
      </section>
    </div>
  );
}