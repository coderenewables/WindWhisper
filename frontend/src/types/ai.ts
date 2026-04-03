/* AI type definitions for GoKaatru v2 */

export interface AiConversation {
  id: string;
  project_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls?: unknown;
  tool_call_id?: string | null;
  token_count?: number | null;
  created_at: string;
}

export interface AiConversationDetail extends AiConversation {
  messages: AiMessage[];
}

export interface AiImpactMetric {
  metric: string;
  current: number;
  projected: number;
  change_pct: number;
  direction: string;
}

export interface AiImpactSummary {
  affected_metrics: AiImpactMetric[];
  data_affected_pct: number;
  confidence: string;
}

export interface AiAction {
  id: string;
  project_id: string;
  conversation_id: string | null;
  action_type: string;
  title: string;
  description: string | null;
  reasoning: string | null;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "failed";
  impact_summary: AiImpactSummary | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AiMemory {
  id: string;
  project_id: string;
  memory_type: string;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AiHealthIssue {
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  suggested_action: string;
}

export interface AiHealth {
  id: string;
  project_id: string;
  health_score: number;
  summary: string;
  issues: AiHealthIssue[];
  metrics: Record<string, unknown>;
  created_at: string;
}

export interface AiStatus {
  ai_enabled: boolean;
  llm_provider: string | null;
  llm_model: string | null;
  has_api_key: boolean;
  connected: boolean;
}
