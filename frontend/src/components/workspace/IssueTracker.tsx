/* Issue tracker — aggregates pending AI actions, QC anomalies, analysis gaps, and data warnings */

import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, Zap } from "lucide-react";
import { useMemo } from "react";

import { ActionCard } from "../ai/ActionCard";
import type { AiAction, AiHealthIssue } from "../../types/ai";

interface IssueTrackerProps {
  actions: AiAction[];
  issues: AiHealthIssue[];
  onApprove: (actionId: string) => void;
  onReject: (actionId: string, reason?: string) => void;
}

const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function IssueTracker({ actions, issues, onApprove, onReject }: IssueTrackerProps) {
  const pendingActions = useMemo(() => actions.filter((a) => a.status === "pending"), [actions]);
  const sortedIssues = useMemo(
    () => [...issues].sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)),
    [issues],
  );

  const totalItems = pendingActions.length + sortedIssues.length;

  if (totalItems === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <CheckCircle2 className="h-6 w-6 text-green-500" />
        <p className="mt-2 text-xs text-ink-500">No outstanding issues</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink-700 dark:text-ink-300">
          <ShieldAlert className="h-3.5 w-3.5" /> Issues &amp; Actions
        </h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
          {totalItems}
        </span>
      </div>

      {/* Pending AI actions */}
      {pendingActions.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <Clock className="h-3 w-3" /> {pendingActions.length} pending action{pendingActions.length !== 1 ? "s" : ""}
          </p>
          {pendingActions.map((action) => (
            <ActionCard key={action.id} action={action} onApprove={onApprove} onReject={onReject} />
          ))}
        </div>
      )}

      {/* Health issues */}
      {sortedIssues.length > 0 && (
        <div className="space-y-1.5">
          {sortedIssues.map((issue, idx) => (
            <IssueRow key={`${issue.category}-${idx}`} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: AiHealthIssue }) {
  const borderColor =
    issue.severity === "critical"
      ? "border-l-red-500"
      : issue.severity === "warning"
        ? "border-l-amber-400"
        : "border-l-blue-400";

  const Icon = issue.severity === "critical" ? AlertTriangle : issue.severity === "warning" ? AlertTriangle : Zap;
  const iconColor =
    issue.severity === "critical" ? "text-red-500" : issue.severity === "warning" ? "text-amber-500" : "text-blue-500";

  return (
    <div className={`rounded-lg border border-ink-100 border-l-4 ${borderColor} bg-white px-3 py-2 dark:border-ink-700 dark:bg-ink-800`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconColor}`} />
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-900 dark:text-white">{issue.message}</p>
          {issue.suggested_action && (
            <p className="mt-0.5 text-[11px] text-ink-500">{issue.suggested_action}</p>
          )}
        </div>
      </div>
    </div>
  );
}
