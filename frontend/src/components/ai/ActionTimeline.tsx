/* Pending actions timeline sidebar section */

import { useAiStore } from "../../stores/aiStore";
import { ActionCard } from "./ActionCard";

interface ActionTimelineProps {
  projectId: string;
}

export function ActionTimeline({ projectId }: ActionTimelineProps) {
  const { actions, approve, reject, fetchActions } = useAiStore();
  const pending = actions.filter((a) => a.status === "pending");

  if (pending.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
        Pending Actions ({pending.length})
      </h3>
      <div className="space-y-2">
        {pending.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            onApprove={async (id) => { await approve(id); fetchActions(projectId); }}
            onReject={async (id) => { await reject(id); fetchActions(projectId); }}
          />
        ))}
      </div>
    </div>
  );
}
