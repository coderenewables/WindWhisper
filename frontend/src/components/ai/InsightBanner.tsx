/* Insight Banner – shows AI-generated insights at the top of pages */

import { AlertTriangle, Info, Lightbulb, X } from "lucide-react";
import { useEffect, useState } from "react";

export type InsightSeverity = "info" | "success" | "warning" | "critical";

interface InsightBannerProps {
  id?: string;
  message: string;
  severity?: InsightSeverity;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  autoDismissMs?: number;
}

const bgMap: Record<InsightSeverity, string> = {
  info: "border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-900/10",
  success: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/10",
  warning: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10",
  critical: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10",
};

const iconColor: Record<InsightSeverity, string> = {
  info: "text-teal-500",
  success: "text-green-500",
  warning: "text-amber-500",
  critical: "text-red-500",
};

const IconComponent: Record<InsightSeverity, typeof Lightbulb> = {
  info: Info,
  success: Lightbulb,
  warning: Lightbulb,
  critical: AlertTriangle,
};

export function InsightBanner({ message, severity = "info", actionLabel, onAction, onDismiss, autoDismissMs }: InsightBannerProps) {
  const [visible, setVisible] = useState(true);

  // Auto-dismiss: 30s for info, never for critical/warning, or custom
  const timeout = autoDismissMs ?? (severity === "info" ? 30_000 : 0);

  useEffect(() => {
    if (timeout <= 0) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, timeout);
    return () => window.clearTimeout(timer);
  }, [timeout, onDismiss]);

  if (!visible) return null;

  const Icon = IconComponent[severity];

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${bgMap[severity]}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor[severity]}`} />
      <p className="flex-1 text-sm text-ink-700 dark:text-ink-300">{message}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-lg bg-ink-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100"
        >
          {actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => { setVisible(false); onDismiss?.(); }}
        className="shrink-0 rounded-lg p-1 text-ink-400 transition hover:text-ink-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
