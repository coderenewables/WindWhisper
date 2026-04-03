/* Workspace canvas — center column with tabbed views (Overview, Analysis, QC, MCP, Energy, Timeline) */

import { BarChart3, Clock, DatabaseZap, Gauge, History, LayoutGrid, ShieldCheck } from "lucide-react";
import { Suspense, lazy, useState } from "react";

import { LoadingSpinner } from "../common/LoadingSpinner";
import { ProjectHealth } from "../ai/ProjectHealth";
import { IssueTracker } from "./IssueTracker";
import { ScenarioManager } from "./ScenarioManager";
import type { AiAction, AiHealth } from "../../types/ai";

const AnalysisPage = lazy(async () => {
  const module = await import("../../pages/AnalysisPage");
  return { default: module.AnalysisPage };
});

const QCPage = lazy(async () => {
  const module = await import("../../pages/QCPage");
  return { default: module.QCPage };
});

const MCPPage = lazy(async () => {
  const module = await import("../../pages/MCPPage");
  return { default: module.MCPPage };
});

const EnergyPage = lazy(async () => {
  const module = await import("../../pages/EnergyPage");
  return { default: module.EnergyPage };
});

type CanvasTab = "overview" | "analysis" | "qc" | "mcp" | "energy" | "scenarios" | "timeline";

interface WorkspaceCanvasProps {
  projectId: string;
  health: AiHealth | null;
  actions: AiAction[];
  recentActivity: Array<{ id: string; message: string; created_at: string }>;
  onApproveAction: (actionId: string) => void;
  onRejectAction: (actionId: string, reason?: string) => void;
}

const tabs: Array<{ id: CanvasTab; label: string; icon: typeof LayoutGrid }> = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "analysis", label: "Analysis", icon: BarChart3 },
  { id: "qc", label: "QC", icon: ShieldCheck },
  { id: "mcp", label: "MCP", icon: DatabaseZap },
  { id: "energy", label: "Energy", icon: Gauge },
  { id: "scenarios", label: "Scenarios", icon: Clock },
  { id: "timeline", label: "Timeline", icon: History },
];

function TabFallback() {
  return (
    <div className="py-8">
      <LoadingSpinner label="Loading" />
    </div>
  );
}

export function WorkspaceCanvas({
  projectId,
  health,
  actions,
  recentActivity,
  onApproveAction,
  onRejectAction,
}: WorkspaceCanvasProps) {
  const [activeTab, setActiveTab] = useState<CanvasTab>("overview");

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-ink-100 pb-1 dark:border-ink-700">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={[
                "inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                activeTab === t.id
                  ? "bg-ink-900 text-white dark:bg-teal-600"
                  : "text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-700 dark:hover:text-white",
              ].join(" ")}
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab
          health={health}
          actions={actions}
          recentActivity={recentActivity}
          onApproveAction={onApproveAction}
          onRejectAction={onRejectAction}
        />
      )}

      {activeTab === "analysis" && (
        <Suspense fallback={<TabFallback />}>
          <AnalysisPage />
        </Suspense>
      )}

      {activeTab === "qc" && (
        <Suspense fallback={<TabFallback />}>
          <QCPage />
        </Suspense>
      )}

      {activeTab === "mcp" && (
        <Suspense fallback={<TabFallback />}>
          <MCPPage />
        </Suspense>
      )}

      {activeTab === "energy" && (
        <Suspense fallback={<TabFallback />}>
          <EnergyPage />
        </Suspense>
      )}

      {activeTab === "scenarios" && <ScenarioManager projectId={projectId} />}

      {activeTab === "timeline" && <TimelineTab recentActivity={recentActivity} />}
    </div>
  );
}

/* ── Overview tab ───────────────────────────────────────────────────── */

function OverviewTab({
  health,
  actions,
  recentActivity,
  onApproveAction,
  onRejectAction,
}: {
  health: AiHealth | null;
  actions: AiAction[];
  recentActivity: Array<{ id: string; message: string; created_at: string }>;
  onApproveAction: (id: string) => void;
  onRejectAction: (id: string, reason?: string) => void;
}) {
  return (
    <div className="space-y-4">
      {health && <ProjectHealth health={health} />}

      <IssueTracker
        actions={actions}
        issues={health?.issues ?? []}
        onApprove={onApproveAction}
        onReject={onRejectAction}
      />

      {/* Recent activity feed */}
      {recentActivity.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink-700 dark:text-ink-300">
            <History className="h-3.5 w-3.5" /> Recent Activity
          </h3>
          {recentActivity.slice(0, 10).map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-ink-100 bg-white px-3 py-2 text-xs dark:border-ink-700 dark:bg-ink-800"
            >
              <span className="text-ink-700 dark:text-ink-300">{entry.message}</span>
              <span className="ml-2 text-ink-400">
                {new Date(entry.created_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Timeline tab ───────────────────────────────────────────────────── */

function TimelineTab({ recentActivity }: { recentActivity: Array<{ id: string; message: string; created_at: string }> }) {
  if (recentActivity.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <History className="h-6 w-6 text-ink-300" />
        <p className="mt-2 text-xs text-ink-500">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {recentActivity.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-2 rounded-lg border border-ink-100 bg-white px-3 py-2 dark:border-ink-700 dark:bg-ink-800"
        >
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
          <div className="min-w-0">
            <p className="text-xs text-ink-700 dark:text-ink-300">{entry.message}</p>
            <p className="text-[10px] text-ink-400">
              {new Date(entry.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
