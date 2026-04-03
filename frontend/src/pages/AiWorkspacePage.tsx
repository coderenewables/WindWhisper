/* AI Workspace page – central hub for AI interactions, health, actions, memory */

import { Bot, Brain, Eye, EyeOff, History, Key, MessageSquare, Save, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { useAiStore } from "../stores/aiStore";
import { useProjectStore } from "../stores/projectStore";
import { ActionCard } from "../components/ai/ActionCard";
import { ProjectHealth } from "../components/ai/ProjectHealth";
import { InsightBanner } from "../components/ai/InsightBanner";

type Tab = "overview" | "actions" | "memory" | "settings";

export function AiWorkspacePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const { projects, fetchProjects } = useProjectStore();
  const { status, health, actions, fetchStatus, fetchHealth, fetchActions, approve, reject, setChatOpen, configureAi, toggleAiEnabled } = useAiStore();

  const activeProject = projects[0]; // Use first project as context

  useEffect(() => {
    fetchStatus();
    fetchProjects();
  }, [fetchStatus, fetchProjects]);

  useEffect(() => {
    if (activeProject?.id) {
      fetchHealth(activeProject.id);
      fetchActions(activeProject.id);
    }
  }, [activeProject?.id, fetchHealth, fetchActions]);

  const pendingActions = actions.filter((a) => a.status === "pending");
  const recentActions = actions.slice(0, 10);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "actions", label: `Actions${pendingActions.length ? ` (${pendingActions.length})` : ""}` },
    { id: "memory", label: "Memory" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="space-y-3">
      {/* Compact header */}
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="h-4 w-4 text-teal-500" />
        <h1 className="text-sm font-semibold text-ink-900 dark:text-white">AI Workspace</h1>
        <span className="text-[11px] text-ink-400">
          {status?.ai_enabled ? `${status.llm_model || "LLM"}` : "Disabled"}
        </span>
        {status?.ai_enabled && (
          <button onClick={() => setChatOpen(true)} className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-700">
            <MessageSquare className="inline h-3 w-3" /> Chat
          </button>
        )}
      </div>

      {!status?.ai_enabled && (
        <InsightBanner message="Set LLM_API_KEY and AI_ENABLED=true to activate AI." severity="warning" />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink-100 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-medium transition",
              tab === t.id ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="space-y-3">
          {health && <ProjectHealth health={health} />}
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800"><span className="text-lg font-bold text-ink-900 dark:text-white">{actions.length}</span> actions</span>
            <span className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800"><span className="text-lg font-bold text-amber-600">{pendingActions.length}</span> pending</span>
            <span className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800"><span className="text-lg font-bold text-green-600">{actions.filter(a => a.status === "approved").length}</span> approved</span>
            <span className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800"><span className="text-lg font-bold text-ink-900 dark:text-white">{projects.length}</span> projects</span>
          </div>
          {recentActions.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink-900 dark:text-white">
                <History className="h-3.5 w-3.5 text-ink-400" /> Recent
              </h3>
              {recentActions.slice(0, 4).map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onApprove={(id) => { approve(id); if (activeProject) fetchActions(activeProject.id); }}
                  onReject={(id) => { reject(id); if (activeProject) fetchActions(activeProject.id); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "actions" && (
        <div className="space-y-2">
          {actions.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <Zap className="mb-2 h-8 w-8 text-ink-300" />
              <p className="text-xs text-ink-500">No actions yet.</p>
            </div>
          ) : (
            actions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onApprove={(id) => { approve(id); if (activeProject) fetchActions(activeProject.id); }}
                onReject={(id) => { reject(id); if (activeProject) fetchActions(activeProject.id); }}
              />
            ))
          )}
        </div>
      )}

      {tab === "memory" && (
        <div className="flex flex-col items-center py-8">
          <Brain className="mb-2 h-8 w-8 text-ink-300" />
          <p className="text-xs text-ink-500">Memory entries appear as you interact.</p>
        </div>
      )}

      {tab === "settings" && <AiSettingsForm status={status} onConfigure={configureAi} onToggle={toggleAiEnabled} onRefresh={fetchStatus} />}
    </div>
  );
}

function AiSettingsForm({ status, onConfigure, onToggle, onRefresh }: {
  status: ReturnType<typeof useAiStore.getState>["status"];
  onConfigure: (c: { llm_api_key?: string; llm_provider?: string; llm_model?: string; llm_base_url?: string }) => Promise<void>;
  onToggle: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState(status?.llm_provider || "openai");
  const [model, setModel] = useState(status?.llm_model || "gpt-4o-mini");
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProvider(status?.llm_provider || "openai");
    setModel(status?.llm_model || "gpt-4o-mini");
  }, [status?.llm_provider, status?.llm_model]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const config: Record<string, string> = {};
    if (apiKey) config.llm_api_key = apiKey;
    if (provider) config.llm_provider = provider;
    if (model) config.llm_model = model;
    if (baseUrl) config.llm_base_url = baseUrl;
    await onConfigure(config);
    setSaving(false);
    setSaved(true);
    setApiKey("");
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="panel-surface max-w-lg space-y-6 p-6">
      <h3 className="text-sm font-semibold text-ink-900 dark:text-white">AI Configuration</h3>

      {/* Toggle */}
      <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-3 dark:bg-ink-800">
        <span className="text-sm text-ink-700 dark:text-ink-300">AI Features</span>
        <button
          onClick={() => void onToggle()}
          className={`relative h-6 w-11 rounded-full transition ${status?.ai_enabled ? "bg-teal-500" : "bg-ink-300"}`}
        >
          <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${status?.ai_enabled ? "translate-x-[22px]" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-sm font-medium text-ink-700 dark:text-ink-300">
          <Key className="h-3.5 w-3.5" />
          API Key
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.has_api_key ? "••••••••  (key set)" : "Enter your LLM API key"}
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 pr-9 text-sm text-ink-900 outline-none focus:border-teal-400 dark:border-ink-600 dark:bg-ink-800 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {status?.has_api_key && (
          <p className="text-xs text-green-600">Key is configured</p>
        )}
      </div>

      {/* Provider */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink-700 dark:text-ink-300">Provider</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-teal-400 dark:border-ink-600 dark:bg-ink-800 dark:text-white"
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="azure">Azure OpenAI</option>
          <option value="ollama">Ollama (local)</option>
          <option value="openrouter">OpenRouter</option>
        </select>
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink-700 dark:text-ink-300">Model</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o-mini"
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-teal-400 dark:border-ink-600 dark:bg-ink-800 dark:text-white"
        />
      </div>

      {/* Base URL (optional) */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink-700 dark:text-ink-300">Base URL <span className="text-ink-400">(optional)</span></label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-teal-400 dark:border-ink-600 dark:bg-ink-800 dark:text-white"
        />
      </div>

      {/* Save + Status */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => void onRefresh()}
          className="rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-50 dark:border-ink-600 dark:text-ink-300"
        >
          Test connection
        </button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
      </div>

      {/* Connection status */}
      <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-3 dark:bg-ink-800">
        <span className="text-sm text-ink-700 dark:text-ink-300">Connection</span>
        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${status?.connected ? "text-green-600" : "text-ink-400"}`}>
          <span className={`h-2 w-2 rounded-full ${status?.connected ? "bg-green-500" : "bg-ink-300"}`} />
          {status?.connected ? "Connected" : "Not connected"}
        </span>
      </div>
    </div>
  );
}
