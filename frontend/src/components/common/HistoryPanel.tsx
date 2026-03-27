import { History, RotateCcw } from "lucide-react";

import { LoadingSpinner } from "./LoadingSpinner";
import type { ChangeLogEntry } from "../../types/history";

interface HistoryPanelProps {
  changes: ChangeLogEntry[];
  isLoading?: boolean;
  isUndoing?: boolean;
  onUndoLatest?: () => Promise<void>;
}

function formatActionLabel(actionType: string) {
  return actionType.replace(/_/g, " ");
}

export function HistoryPanel({ changes, isLoading = false, isUndoing = false, onUndoLatest }: HistoryPanelProps) {
  const latestChange = changes[0] ?? null;

  return (
    <section className="panel-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-ink-700">
            <History className="h-4 w-4 text-teal-500" />
            History
          </div>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">Change timeline</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-600">
            Review dataset modifications and undo the latest reversible change without leaving the QC workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onUndoLatest?.()}
          disabled={!latestChange || !onUndoLatest || isUndoing}
          className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900 disabled:opacity-60"
        >
          <RotateCcw className="h-4 w-4" />
          Undo latest change
        </button>
      </div>

      {isLoading ? (
        <div className="mt-5"><LoadingSpinner label="Loading change history" /></div>
      ) : null}

      {!isLoading ? (
        <div className="mt-5 space-y-3">
          {changes.length === 0 ? (
            <div className="panel-muted px-4 py-4 text-sm text-ink-600">No reversible dataset changes have been recorded yet.</div>
          ) : null}

          {changes.map((change, index) => (
            <div key={change.id} className="panel-muted flex items-start justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-ink-200 bg-white/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-600">
                    {formatActionLabel(change.action_type)}
                  </span>
                  {index === 0 ? (
                    <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-teal-700">Latest</span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-medium text-ink-900">{change.description}</p>
                <p className="mt-1 text-xs text-ink-500">{new Date(change.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}