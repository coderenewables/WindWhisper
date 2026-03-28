export type WorkflowStatus = "draft" | "running" | "completed" | "failed";

export type WorkflowStepType =
  | "import_file"
  | "apply_qc_rules"
  | "reconstruct_gaps"
  | "calculate_shear"
  | "run_mcp"
  | "generate_report"
  | "export_data";

export type WorkflowStepResultStatus = "completed" | "failed";

export interface WorkflowStepDefinition {
  order: number;
  step_type: WorkflowStepType;
  params: Record<string, unknown>;
}

export interface WorkflowExecutionLogEntry {
  order: number;
  step_type: WorkflowStepType;
  status: WorkflowStepResultStatus;
  started_at: string;
  finished_at: string;
  message: string;
  details: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  project_id: string;
  name: string;
  steps: WorkflowStepDefinition[];
  status: WorkflowStatus;
  last_run: string | null;
  last_run_log: WorkflowExecutionLogEntry[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowListResponse {
  items: Workflow[];
  total: number;
}

export interface WorkflowCreateRequest {
  name: string;
  steps: WorkflowStepDefinition[];
}

export interface WorkflowUpdateRequest {
  name?: string;
  steps?: WorkflowStepDefinition[];
}

export interface WorkflowRunResponse {
  workflow: Workflow;
  started_at: string;
  finished_at: string;
  status: WorkflowStatus;
  step_results: WorkflowExecutionLogEntry[];
  error: string | null;
}