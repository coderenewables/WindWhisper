/**
 * Frontend AI integration test.
 *
 * Exercises the full flow: store actions → API calls → state updates.
 * The API layer is mocked (vi.mock("../api/ai")) so we test
 * store logic, state transitions, and component orchestration.
 */
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  AiAction,
  AiConversation,
  AiConversationDetail,
  AiHealth,
  AiMessage,
  AiStatus,
} from "../types/ai";

/* ── Mock API layer ────────────────────────────────────────────── */

const apiMocks = vi.hoisted(() => ({
  getAiStatus: vi.fn(),
  toggleAi: vi.fn(),
  configureAi: vi.fn(),
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  sendMessage: vi.fn(),
  listActions: vi.fn(),
  approveAction: vi.fn(),
  rejectAction: vi.fn(),
  getProjectHealth: vi.fn(),
}));

vi.mock("../api/ai", () => ({
  getAiStatus: apiMocks.getAiStatus,
  toggleAi: apiMocks.toggleAi,
  configureAi: apiMocks.configureAi,
  listConversations: apiMocks.listConversations,
  createConversation: apiMocks.createConversation,
  getConversation: apiMocks.getConversation,
  sendMessage: apiMocks.sendMessage,
  listActions: apiMocks.listActions,
  approveAction: apiMocks.approveAction,
  rejectAction: apiMocks.rejectAction,
  getProjectHealth: apiMocks.getProjectHealth,
}));

import { useAiStore } from "../stores/aiStore";

/* ── Test fixtures ─────────────────────────────────────────────── */

const PROJECT_ID = "proj-integration-1";

const mockStatus: AiStatus = {
  ai_enabled: true,
  llm_provider: "openai",
  llm_model: "gpt-4o",
  has_api_key: true,
  connected: true,
};

const mockConversation: AiConversation = {
  id: "conv-int-1",
  project_id: PROJECT_ID,
  title: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const mockAssistantReply: AiMessage = {
  id: "msg-reply-1",
  conversation_id: "conv-int-1",
  role: "assistant",
  content: "I found 1 dataset with 500 rows. The mean wind speed is 7.2 m/s.",
  created_at: "2025-01-01T00:00:01Z",
};

const mockConversationDetail: AiConversationDetail = {
  ...mockConversation,
  title: "Wind data review",
  messages: [
    {
      id: "msg-u1",
      conversation_id: "conv-int-1",
      role: "user",
      content: "Summarise this project",
      created_at: "2025-01-01T00:00:00Z",
    },
    mockAssistantReply,
  ],
};

const mockPendingAction: AiAction = {
  id: "action-int-1",
  project_id: PROJECT_ID,
  conversation_id: "conv-int-1",
  action_type: "create_qc_flag",
  title: "Create QC Flag",
  description: "Flag icing events in sector 3",
  reasoning: "AI called create_qc_flag",
  payload: { dataset_id: "ds-1", name: "Icing Flag", color: "#3b82f6" },
  status: "pending",
  impact_summary: null,
  resolved_by: null,
  resolved_at: null,
  created_at: "2025-01-01T00:01:00Z",
};

const mockApprovedAction: AiAction = {
  ...mockPendingAction,
  status: "approved",
  resolved_by: "user",
  resolved_at: "2025-01-01T00:02:00Z",
};

const mockHealth: AiHealth = {
  id: "health-1",
  project_id: PROJECT_ID,
  health_score: 72,
  summary: "Good data availability; QC incomplete",
  issues: [
    { severity: "warning", category: "qc", message: "No QC flags applied", suggested_action: "Run QC" },
  ],
  metrics: { dataset_count: 1, total_records: 500 },
  created_at: "2025-01-01T00:00:00Z",
};

/* ── Setup / Teardown ─────────────────────────────────────────── */

beforeEach(() => {
  vi.clearAllMocks();
  // Reset store to initial state
  useAiStore.setState({
    status: null,
    chatOpen: false,
    conversations: [],
    activeConversationId: null,
    messages: [],
    isSending: false,
    actions: [],
    health: null,
    error: null,
  });
});

/* ── Tests ─────────────────────────────────────────────────────── */

describe("AI Integration Flow", () => {
  test("full chat flow: status → start conversation → send → load history", async () => {
    // 1. Fetch AI status
    apiMocks.getAiStatus.mockResolvedValue(mockStatus);
    await act(() => useAiStore.getState().fetchStatus());
    expect(useAiStore.getState().status?.ai_enabled).toBe(true);
    expect(apiMocks.getAiStatus).toHaveBeenCalledOnce();

    // 2. Start a new conversation
    apiMocks.createConversation.mockResolvedValue(mockConversation);
    let conv: AiConversation | undefined;
    await act(async () => {
      conv = await useAiStore.getState().startConversation(PROJECT_ID);
    });
    expect(conv?.id).toBe("conv-int-1");
    expect(useAiStore.getState().activeConversationId).toBe("conv-int-1");

    // 3. Send a message
    apiMocks.sendMessage.mockResolvedValue(mockAssistantReply);
    await act(() => useAiStore.getState().send("conv-int-1", "Summarise this project"));
    const messages = useAiStore.getState().messages;
    // Should have the optimistic user message + the assistant reply
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toContain("7.2 m/s");

    // 4. Load conversation history (simulates re-opening)
    apiMocks.getConversation.mockResolvedValue(mockConversationDetail);
    await act(() => useAiStore.getState().loadConversation("conv-int-1"));
    const reloaded = useAiStore.getState().messages;
    // loadConversation filters to user + assistant only
    expect(reloaded.length).toBe(2);
    expect(reloaded[0].content).toBe("Summarise this project");
  });

  test("action flow: fetch actions → approve → state updated", async () => {
    // 1. Load pending actions
    apiMocks.listActions.mockResolvedValue([mockPendingAction]);
    await act(() => useAiStore.getState().fetchActions(PROJECT_ID));
    expect(useAiStore.getState().actions).toHaveLength(1);
    expect(useAiStore.getState().actions[0].status).toBe("pending");

    // 2. Approve the action
    apiMocks.approveAction.mockResolvedValue(mockApprovedAction);
    await act(() => useAiStore.getState().approve("action-int-1"));
    const updated = useAiStore.getState().actions.find((a) => a.id === "action-int-1");
    expect(updated?.status).toBe("approved");
    expect(updated?.resolved_by).toBe("user");
  });

  test("action flow: fetch actions → reject → state updated", async () => {
    const rejectedAction: AiAction = {
      ...mockPendingAction,
      status: "rejected",
      resolved_by: "user",
      resolved_at: "2025-01-01T00:02:00Z",
    };

    apiMocks.listActions.mockResolvedValue([mockPendingAction]);
    await act(() => useAiStore.getState().fetchActions(PROJECT_ID));

    apiMocks.rejectAction.mockResolvedValue(rejectedAction);
    await act(() => useAiStore.getState().reject("action-int-1", "Not needed"));
    const updated = useAiStore.getState().actions.find((a) => a.id === "action-int-1");
    expect(updated?.status).toBe("rejected");
    expect(apiMocks.rejectAction).toHaveBeenCalledWith("action-int-1", "Not needed");
  });

  test("health flow: fetch and display project health", async () => {
    apiMocks.getProjectHealth.mockResolvedValue(mockHealth);
    await act(() => useAiStore.getState().fetchHealth(PROJECT_ID));
    const health = useAiStore.getState().health;
    expect(health?.health_score).toBe(72);
    expect(health?.issues).toHaveLength(1);
    expect(health?.issues[0].severity).toBe("warning");
  });

  test("toggle AI disables and re-enables", async () => {
    apiMocks.toggleAi
      .mockResolvedValueOnce({ ...mockStatus, ai_enabled: false })
      .mockResolvedValueOnce({ ...mockStatus, ai_enabled: true });

    await act(() => useAiStore.getState().toggleAiEnabled());
    expect(useAiStore.getState().status?.ai_enabled).toBe(false);

    await act(() => useAiStore.getState().toggleAiEnabled());
    expect(useAiStore.getState().status?.ai_enabled).toBe(true);
  });

  test("error handling: send failure shows error + fallback message", async () => {
    // Set up conversation
    apiMocks.createConversation.mockResolvedValue(mockConversation);
    await act(() => useAiStore.getState().startConversation(PROJECT_ID));

    // Simulate API failure
    apiMocks.sendMessage.mockRejectedValue(new Error("Network timeout"));
    await act(() => useAiStore.getState().send("conv-int-1", "Test message"));

    expect(useAiStore.getState().isSending).toBe(false);
    expect(useAiStore.getState().error).toBe("Network timeout");
    // Fallback error message is appended
    const msgs = useAiStore.getState().messages;
    const lastMsg = msgs[msgs.length - 1];
    expect(lastMsg.role).toBe("assistant");
    expect(lastMsg.content).toContain("Sorry");
  });

  test("configure AI updates status", async () => {
    const configured: AiStatus = { ...mockStatus, llm_model: "claude-4-opus" };
    apiMocks.configureAi.mockResolvedValue(configured);
    await act(() =>
      useAiStore.getState().configureAi({ llm_model: "claude-4-opus" })
    );
    expect(useAiStore.getState().status?.llm_model).toBe("claude-4-opus");
  });

  test("full pipeline: status → conversation → action → health", async () => {
    // This test exercises the complete user journey through the store

    // 1. Check AI status
    apiMocks.getAiStatus.mockResolvedValue(mockStatus);
    await act(() => useAiStore.getState().fetchStatus());
    expect(useAiStore.getState().status?.ai_enabled).toBe(true);

    // 2. List existing conversations (empty initially)
    apiMocks.listConversations.mockResolvedValue([]);
    await act(() => useAiStore.getState().fetchConversations(PROJECT_ID));
    expect(useAiStore.getState().conversations).toHaveLength(0);

    // 3. Start new conversation
    apiMocks.createConversation.mockResolvedValue(mockConversation);
    await act(() => useAiStore.getState().startConversation(PROJECT_ID));

    // 4. Send a message and get AI reply
    apiMocks.sendMessage.mockResolvedValue(mockAssistantReply);
    await act(() => useAiStore.getState().send("conv-int-1", "Review my data"));
    expect(useAiStore.getState().messages.length).toBe(2);

    // 5. AI proposes an action
    apiMocks.listActions.mockResolvedValue([mockPendingAction]);
    await act(() => useAiStore.getState().fetchActions(PROJECT_ID));
    expect(useAiStore.getState().actions[0].status).toBe("pending");

    // 6. User approves the action
    apiMocks.approveAction.mockResolvedValue(mockApprovedAction);
    await act(() => useAiStore.getState().approve("action-int-1"));
    expect(useAiStore.getState().actions[0].status).toBe("approved");

    // 7. Check project health after action
    apiMocks.getProjectHealth.mockResolvedValue(mockHealth);
    await act(() => useAiStore.getState().fetchHealth(PROJECT_ID));
    expect(useAiStore.getState().health?.health_score).toBe(72);

    // 8. List conversations now shows the one we created
    apiMocks.listConversations.mockResolvedValue([{ ...mockConversation, title: "Review my data" }]);
    await act(() => useAiStore.getState().fetchConversations(PROJECT_ID));
    expect(useAiStore.getState().conversations).toHaveLength(1);
    expect(useAiStore.getState().conversations[0].title).toBe("Review my data");
  });
});
