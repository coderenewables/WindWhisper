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
  logic: "AND" | "OR" | null;
  group_index: number;
  order_index: number;
}

export interface FlagRuleCreatePayload {
  column_id: string;
  operator: FlagRule["operator"];
  value?: unknown;
  logic?: "AND" | "OR";
  group_index?: number;
  order_index?: number;
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

export type TowerShadowMethod = "manual" | "auto";

export interface TowerShadowSector {
  direction_start: number;
  direction_end: number;
  affected_column_ids: string[];
  affected_column_names: string[];
  point_count: number;
  range_count: number;
}

export interface TowerShadowRequestPayload {
  method: TowerShadowMethod;
  boom_orientations?: number[];
  direction_column_id?: string;
  shadow_width?: number;
  apply?: boolean;
  flag_name?: string;
}

export interface TowerShadowResponse {
  method: TowerShadowMethod;
  direction_column_id: string;
  sectors: TowerShadowSector[];
  preview_point_count: number;
  applied: boolean;
  flag_id: string | null;
  flag_name: string | null;
}
