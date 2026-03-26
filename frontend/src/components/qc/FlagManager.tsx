import { Eye, EyeOff, Play, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import type { Flag, FlaggedRange } from "../../types/qc";

interface FlagManagerProps {
  flags: Flag[];
  flaggedRanges: FlaggedRange[];
  activeFlagId: string | null;
  flagVisibility: Record<string, boolean>;
  isBusy?: boolean;
  onSelectFlag: (flagId: string) => void;
  onToggleVisibility: (flagId: string) => void;
  onCreateFlag: (payload: { name: string; color: string; description: string }) => Promise<void>;
  onApplyRules: (flagId: string) => Promise<void>;
  onDeleteFlag: (flagId: string) => Promise<void>;
  onDeleteRange: (rangeId: string) => Promise<void>;
}

export function FlagManager({
  flags,
  flaggedRanges,
  activeFlagId,
  flagVisibility,
  isBusy = false,
  onSelectFlag,
  onToggleVisibility,
  onCreateFlag,
  onApplyRules,
  onDeleteFlag,
  onDeleteRange,
}: FlagManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#1f8f84");
  const [description, setDescription] = useState("");

  const rangesByFlagId = useMemo(
    () =>
      flaggedRanges.reduce<Record<string, FlaggedRange[]>>((groups, flaggedRange) => {
        groups[flaggedRange.flag_id] ??= [];
        groups[flaggedRange.flag_id].push(flaggedRange);
        return groups;
      }, {}),
    [flaggedRanges],
  );

  async function submitCreateFlag() {
    if (!name.trim()) {
      return;
    }
    await onCreateFlag({ name: name.trim(), color, description: description.trim() });
    setName("");
    setColor("#1f8f84");
    setDescription("");
    setIsCreating(false);
  }

  return (
    <section className="panel-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-teal-500">Flags</p>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">Manage QC flags</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating((current) => !current)}
          className="inline-flex items-center gap-2 rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-700"
        >
          <Plus className="h-4 w-4" />
          Add flag
        </button>
      </div>

      {isCreating ? (
        <div className="panel-muted mt-5 grid gap-3 p-4">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Flag name" className="rounded-2xl border-ink-200 bg-white" />
          <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            <input value={color} onChange={(event) => setColor(event.target.value)} type="color" className="h-12 rounded-2xl border-ink-200 bg-white p-2" />
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" className="rounded-2xl border-ink-200 bg-white" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setIsCreating(false)} className="rounded-2xl border border-ink-200 px-4 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-900">
              Cancel
            </button>
            <button type="button" disabled={isBusy} onClick={() => void submitCreateFlag()} className="rounded-2xl bg-ember-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-ember-400 disabled:opacity-60">
              Create flag
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {flags.length === 0 ? (
          <div className="panel-muted px-4 py-4 text-sm text-ink-600">No flags yet. Create one, then add rules or manually select ranges from the chart.</div>
        ) : null}

        {flags.map((flag) => {
          const isActive = activeFlagId === flag.id;
          const flagRanges = rangesByFlagId[flag.id] ?? [];
          const isVisible = flagVisibility[flag.id] ?? true;

          return (
            <div key={flag.id} className="panel-muted overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-4">
                <button type="button" onClick={() => onSelectFlag(flag.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: flag.color ?? "#1f8f84" }} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">{flag.name}</p>
                    <p className="text-xs text-ink-500">{flag.flagged_count} ranges · {flag.rule_count} rules</p>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleVisibility(flag.id)}
                    className="rounded-full border border-ink-200 p-2 text-ink-600 transition hover:border-ink-400 hover:text-ink-900"
                    aria-label={`${isVisible ? "Hide" : "Show"} flag ${flag.name}`}
                  >
                    {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <span className="text-xs uppercase tracking-[0.18em] text-ink-400">{isActive ? "Open" : "View"}</span>
                </div>
              </div>

              {isActive ? (
                <div className="border-t border-ink-100 px-4 py-4">
                  {flag.description ? <p className="text-sm leading-7 text-ink-600">{flag.description}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={() => void onApplyRules(flag.id)} className="inline-flex items-center gap-2 rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-ink-700">
                      <Play className="h-4 w-4" />
                      Apply rules
                    </button>
                    <button type="button" onClick={() => void onDeleteFlag(flag.id)} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 px-4 py-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                      Delete flag
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-500">Flagged ranges</p>
                    {flagRanges.length === 0 ? (
                      <p className="text-sm text-ink-500">No ranges have been generated yet.</p>
                    ) : (
                      flagRanges.map((flaggedRange) => (
                        <div key={flaggedRange.id} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white/70 px-3 py-3 text-sm text-ink-700">
                          <div>
                            <p>{new Date(flaggedRange.start_time).toLocaleString()}</p>
                            <p className="text-xs text-ink-500">to {new Date(flaggedRange.end_time).toLocaleString()} · {flaggedRange.applied_by}</p>
                          </div>
                          <button type="button" onClick={() => void onDeleteRange(flaggedRange.id)} className="rounded-full border border-ink-200 p-2 text-ink-500 transition hover:border-red-300 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {isBusy ? <div className="mt-4"><LoadingSpinner label="Updating QC state" /></div> : null}
    </section>
  );
}
