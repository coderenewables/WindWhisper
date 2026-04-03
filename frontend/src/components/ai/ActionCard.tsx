/* Action Card – displays a pending AI action for approval/rejection */

import { Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import type { AiAction } from "../../types/ai";

interface ActionCardProps {
  action: AiAction;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const statusColors: Record<string, string> = {
  pending: "border-amber-400 bg-amber-50 dark:bg-amber-900/10",
  approved: "border-green-400 bg-green-50 dark:bg-green-900/10",
  rejected: "border-red-400 bg-red-50 dark:bg-red-900/10",
  failed: "border-red-400 bg-red-50 dark:bg-red-900/10",
};

const statusBadge: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-800/30 dark:text-amber-400",
  approved: "bg-green-100 text-green-700 dark:bg-green-800/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-800/30 dark:text-red-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-800/30 dark:text-red-400",
};

export function ActionCard({ action, onApprove, onReject }: ActionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border p-4 transition ${statusColors[action.status] || "border-ink-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusBadge[action.status]}`}>
              {action.status}
            </span>
            <span className="text-[10px] text-ink-400">{action.action_type.replace(/_/g, " ")}</span>
          </div>
          <h4 className="mt-1.5 text-sm font-medium text-ink-900 dark:text-white">{action.title}</h4>
        </div>

        {action.status === "pending" && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onApprove(action.id)}
              className="rounded-lg bg-green-600 p-1.5 text-white transition hover:bg-green-700"
              title="Approve"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onReject(action.id)}
              className="rounded-lg bg-red-600 p-1.5 text-white transition hover:bg-red-700"
              title="Reject"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {action.description && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-xs text-ink-500 transition hover:text-ink-700"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Less" : "Details"}
        </button>
      )}

      {expanded && action.description && (
        <p className="mt-2 text-xs leading-relaxed text-ink-600 dark:text-ink-400">{action.description}</p>
      )}

      {action.impact_summary && (
        <div className="mt-3 flex flex-wrap gap-2">
          {action.impact_summary.affected_metrics.map((m) => (
            <span
              key={m.metric}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${m.direction === "positive" ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"}`}
            >
              {m.metric}: {m.change_pct > 0 ? "+" : ""}{m.change_pct.toFixed(1)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
