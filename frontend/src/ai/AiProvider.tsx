/* AiProvider – React context that exposes AI state app-wide */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAiStore } from "../stores/aiStore";
import type { AiAction, AiHealth, AiHealthIssue, AiStatus } from "../types/ai";
import type { InsightSeverity } from "../components/ai/InsightBanner";

/* ------------------------------------------------------------------ */
/*  Insight queue types                                               */
/* ------------------------------------------------------------------ */

export interface InsightItem {
  id: string;
  severity: InsightSeverity;
  category: string;
  message: string;
  actionLabel?: string;
  /** If set, clicking "Take Action" calls sendPrompt with this */
  actionPrompt?: string;
}

/* ------------------------------------------------------------------ */
/*  Context value                                                     */
/* ------------------------------------------------------------------ */

export interface AiContextValue {
  /** Whether the AI subsystem is enabled and connected */
  enabled: boolean;
  connected: boolean;
  status: AiStatus | null;
  /** Current project health snapshot (null if not loaded) */
  health: AiHealth | null;
  /** Pending actions for the active project */
  pendingActions: AiAction[];
  pendingCount: number;
  /** Send a prefilled prompt to the chat panel, opening it if needed */
  sendPrompt: (projectId: string, message: string) => Promise<void>;
  /** Insight queue – banners that pages can show / consume */
  insights: InsightItem[];
  showInsight: (insight: Omit<InsightItem, "id">) => void;
  dismissInsight: (id: string) => void;
}

const AiContext = createContext<AiContextValue>({
  enabled: false,
  connected: false,
  status: null,
  health: null,
  pendingActions: [],
  pendingCount: 0,
  sendPrompt: async () => {},
  insights: [],
  showInsight: () => {},
  dismissInsight: () => {},
});

export function useAi() {
  return useContext(AiContext);
}

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

interface AiProviderProps {
  projectId?: string;
  children: ReactNode;
}

let insightCounter = 0;

export function AiProvider({ projectId, children }: AiProviderProps) {
  const {
    status,
    health,
    actions,
    fetchStatus,
    fetchActions,
    fetchHealth,
    setChatOpen,
    startConversation,
    send,
    activeConversationId,
  } = useAiStore();

  const [insights, setInsights] = useState<InsightItem[]>([]);

  // Fetch AI status on mount
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Fetch project-scoped data when projectId changes
  useEffect(() => {
    if (!projectId || !status?.ai_enabled) return;
    void fetchActions(projectId);
    void fetchHealth(projectId);
  }, [projectId, status?.ai_enabled, fetchActions, fetchHealth]);

  // Surface health issues as insights when health changes
  useEffect(() => {
    if (!health?.issues?.length) return;
    const newInsights: InsightItem[] = health.issues
      .filter((issue) => issue.severity === "critical" || issue.severity === "warning")
      .slice(0, 3)
      .map((issue) => ({
        id: `health-${++insightCounter}`,
        severity: issue.severity,
        category: issue.category,
        message: issue.message,
        actionLabel: "Take Action",
        actionPrompt: issue.suggested_action,
      }));
    if (newInsights.length > 0) {
      setInsights((prev) => [...prev, ...newInsights]);
    }
  }, [health]);

  // Clear insights on project change
  useEffect(() => {
    setInsights([]);
  }, [projectId]);

  const pendingActions = useMemo(
    () => actions.filter((a) => a.status === "pending"),
    [actions],
  );

  const sendPrompt = useCallback(async (pid: string, message: string) => {
    setChatOpen(true);
    let convId = activeConversationId;
    if (!convId) {
      const conv = await startConversation(pid);
      convId = conv.id;
    }
    await send(convId, message);
  }, [setChatOpen, activeConversationId, startConversation, send]);

  const showInsight = useCallback((insight: Omit<InsightItem, "id">) => {
    const id = `insight-${++insightCounter}`;
    setInsights((prev) => [...prev, { ...insight, id }]);
  }, []);

  const dismissInsight = useCallback((id: string) => {
    setInsights((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const value = useMemo<AiContextValue>(
    () => ({
      enabled: status?.ai_enabled ?? false,
      connected: status?.connected ?? false,
      status,
      health,
      pendingActions,
      pendingCount: pendingActions.length,
      sendPrompt,
      insights,
      showInsight,
      dismissInsight,
    }),
    [status, health, pendingActions, sendPrompt, insights, showInsight, dismissInsight],
  );

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
}
