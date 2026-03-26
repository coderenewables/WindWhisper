export interface Flag {
  id: string;
  dataset_id: string;
  name: string;
  color: string | null;
  description: string | null;
  rule_count: number;
  flagged_count: number;
}

export interface FlagCreatePayload {
  name: string;
  color?: string | null;
  description?: string | null;
}

export interface FlagRule {
  id: string;
  flag_id: string;
  column_id: string;
  operator: "==" | "!=" | "<" | ">" | "<=" | ">=" | "between" | "is_null";
  value: unknown;
  logic: "AND" | null;
}

export interface FlagRuleCreatePayload {
  column_id: string;
  operator: FlagRule["operator"];
  value?: unknown;
  logic?: "AND";
}

export interface FlagRuleUpdatePayload extends FlagRuleCreatePayload {}

export interface FlaggedRange {
  id: string;
  flag_id: string;
  start_time: string;
  end_time: string;
  applied_by: string;
  column_ids: string[] | null;
}

export interface ManualFlagRequestPayload {
  start_time: string;
  end_time: string;
  column_ids?: string[] | null;
}
