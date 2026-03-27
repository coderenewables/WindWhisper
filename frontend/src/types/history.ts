export interface ChangeLogEntry {
  id: string;
  dataset_id: string;
  action_type: string;
  description: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

export interface ChangeLogListResponse {
  changes: ChangeLogEntry[];
  total: number;
}

export interface UndoResponse {
  undone_change: ChangeLogEntry;
}