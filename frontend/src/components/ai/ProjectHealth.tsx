/* Project Health badge component */

import { Activity, AlertTriangle, CheckCircle2, Info } from "lucide-react";

import type { AiHealth, AiHealthIssue } from "../../types/ai";

interface ProjectHealthProps {
  health: AiHealth;
  compact?: boolean;
}

const severityIcon = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

const severityColor = {
  critical: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800";
  if (score >= 50) return "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800";
  return "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800";
}

export function ProjectHealth({ health, compact }: ProjectHealthProps) {
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 ${scoreBg(health.health_score)}`}>
        <Activity className={`h-3.5 w-3.5 ${scoreColor(health.health_score)}`} />
        <span className={`text-xs font-semibold ${scoreColor(health.health_score)}`}>{health.health_score.toFixed(0)}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${scoreBg(health.health_score)}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={`h-5 w-5 ${scoreColor(health.health_score)}`} />
          <span className="text-sm font-semibold text-ink-900 dark:text-white">Project Health</span>
        </div>
        <span className={`text-2xl font-bold ${scoreColor(health.health_score)}`}>{health.health_score.toFixed(0)}</span>
      </div>

      {health.issues.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {health.issues.slice(0, 4).map((issue, i) => {
            const Icon = severityIcon[issue.severity] || Info;
            return (
              <li key={i} className="flex items-start gap-2 text-xs text-ink-700 dark:text-ink-300">
                <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${severityColor[issue.severity]}`} />
                <span>{issue.message}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
