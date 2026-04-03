/* Zustand store for AI state */

import { create } from "zustand";

import {
  approveAction,
  configureAi,
  createConversation,
  getAiStatus,
  getConversation,
  getProjectHealth,
  listActions,
  listConversations,
  rejectAction,
  sendMessage,
  toggleAi,
} from "../api/ai";
import type {
  AiAction,
  AiConversation,
  AiHealth,
  AiMessage,
  AiStatus,
} from "../types/ai";

interface AiState {
  // Status
  status: AiStatus | null;
  fetchStatus: () => Promise<void>;
  toggleAiEnabled: () => Promise<void>;
  configureAi: (config: { llm_api_key?: string; llm_provider?: string; llm_model?: string; llm_base_url?: string }) => Promise<void>;

  // Chat panel
  chatOpen: boolean;
  toggleChat: () => void;
  setChatOpen: (open: boolean) => void;

  // Conversations
  conversations: AiConversation[];
  activeConversationId: string | null;
  messages: AiMessage[];
  isSending: boolean;
  fetchConversations: (projectId: string) => Promise<void>;
  startConversation: (projectId: string) => Promise<AiConversation>;
  loadConversation: (conversationId: string) => Promise<void>;
  send: (conversationId: string, content: string) => Promise<AiMessage | null>;

  // Actions
  actions: AiAction[];
  fetchActions: (projectId: string) => Promise<void>;
  approve: (actionId: string) => Promise<void>;
  reject: (actionId: string, reason?: string) => Promise<void>;

  // Health
  health: AiHealth | null;
  fetchHealth: (projectId: string) => Promise<void>;

  // Error
  error: string | null;
  clearError: () => void;
}

export const useAiStore = create<AiState>((set, get) => ({
  status: null,
  chatOpen: false,
  conversations: [],
  activeConversationId: null,
  messages: [],
  isSending: false,
  actions: [],
  health: null,
  error: null,

  clearError: () => set({ error: null }),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  setChatOpen: (open) => set({ chatOpen: open }),

  fetchStatus: async () => {
    try {
      const status = await getAiStatus();
      set({ status });
    } catch {
      set({ status: { ai_enabled: false, llm_provider: null, llm_model: null, has_api_key: false, connected: false } });
    }
  },

  toggleAiEnabled: async () => {
    try {
      const status = await toggleAi();
      set({ status });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to toggle AI" });
    }
  },

  configureAi: async (config) => {
    try {
      const status = await configureAi(config);
      set({ status });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to configure AI" });
    }
  },

  fetchConversations: async (projectId) => {
    try {
      const conversations = await listConversations(projectId);
      set({ conversations });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to load conversations" });
    }
  },

  startConversation: async (projectId) => {
    const conv = await createConversation(projectId);
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: conv.id,
      messages: [],
    }));
    return conv;
  },

  loadConversation: async (conversationId) => {
    try {
      const detail = await getConversation(conversationId);
      set({
        activeConversationId: detail.id,
        messages: detail.messages.filter((m) => m.role === "user" || m.role === "assistant"),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to load conversation" });
    }
  },

  send: async (conversationId, content) => {
    set((s) => ({
      isSending: true,
      messages: [...s.messages, { id: `temp-${Date.now()}`, conversation_id: conversationId, role: "user" as const, content, created_at: new Date().toISOString() }],
    }));
    try {
      const reply = await sendMessage(conversationId, content);
      set((s) => ({
        isSending: false,
        messages: [...s.messages, reply],
      }));
      return reply;
    } catch (e) {
      set((s) => ({
        isSending: false,
        error: e instanceof Error ? e.message : "Failed to send message",
        messages: [...s.messages, { id: `err-${Date.now()}`, conversation_id: conversationId, role: "assistant" as const, content: "Sorry, something went wrong. Please try again.", created_at: new Date().toISOString() }],
      }));
      return null;
    }
  },

  fetchActions: async (projectId) => {
    try {
      const actions = await listActions(projectId);
      set({ actions });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to load actions" });
    }
  },

  approve: async (actionId) => {
    try {
      const updated = await approveAction(actionId);
      set((s) => ({ actions: s.actions.map((a) => (a.id === actionId ? updated : a)) }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to approve action" });
    }
  },

  reject: async (actionId, reason) => {
    try {
      const updated = await rejectAction(actionId, reason);
      set((s) => ({ actions: s.actions.map((a) => (a.id === actionId ? updated : a)) }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to reject action" });
    }
  },

  fetchHealth: async (projectId) => {
    try {
      const health = await getProjectHealth(projectId);
      set({ health });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to load health" });
    }
  },
}));
