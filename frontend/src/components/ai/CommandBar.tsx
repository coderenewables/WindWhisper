/* Command bar – Cmd+K / Ctrl+K quick action palette */

import { Bot, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAiStore } from "../../stores/aiStore";

interface CommandBarProps {
  projectId?: string;
}

const quickActions = [
  { label: "Run Weibull analysis", query: "Run Weibull analysis on the primary dataset" },
  { label: "Check data quality", query: "Review data quality and suggest QC flags" },
  { label: "Summarize project", query: "Give me a summary of this project's current state" },
  { label: "Estimate energy yield", query: "Run an energy estimate with the default power curve" },
  { label: "Compute wind shear", query: "Compute wind shear profile for available heights" },
];

export function CommandBar({ projectId }: CommandBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { setChatOpen, startConversation, send, status } = useAiStore();

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim() || !projectId) return;
    setOpen(false);
    setChatOpen(true);
    const conv = await startConversation(projectId);
    await send(conv.id, text.trim());
  }, [projectId, setChatOpen, startConversation, send]);

  if (!open) return null;

  const filtered = query.trim()
    ? quickActions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
    : quickActions;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-ink-200 bg-white shadow-2xl dark:border-ink-600 dark:bg-ink-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-ink-200 px-4 py-3 dark:border-ink-700">
          {status?.ai_enabled ? (
            <Bot className="h-4 w-4 text-teal-500" />
          ) : (
            <Search className="h-4 w-4 text-ink-400" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit(query);
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder={status?.ai_enabled ? "Ask AI or type a command…" : "Quick actions…"}
            className="flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-white"
          />
          <kbd className="hidden rounded border border-ink-200 px-1.5 py-0.5 font-mono text-[10px] text-ink-400 sm:inline dark:border-ink-600">ESC</kbd>
        </div>

        <ul className="max-h-64 overflow-y-auto py-2">
          {filtered.map((action) => (
            <li key={action.label}>
              <button
                onClick={() => handleSubmit(action.query)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink-700 transition hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700"
              >
                <Bot className="h-3.5 w-3.5 text-ink-400" />
                <span>{action.label}</span>
              </button>
            </li>
          ))}
          {query.trim() && filtered.length === 0 && (
            <li>
              <button
                onClick={() => handleSubmit(query)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-teal-600 transition hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-900/20"
              >
                <Bot className="h-3.5 w-3.5" />
                <span>Ask: "{query}"</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
