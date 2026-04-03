import { act } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the API module
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

vi.mock("../api/ai", () => apiMocks);

import { useAiStore } from "./aiStore";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the store to initial state
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

describe("aiStore", () => {
  // ── Initial state ────────────────────────────────────────────

  test("has correct initial state", () => {
    const state = useAiStore.getState();
    expect(state.status).toBeNull();
    expect(state.chatOpen).toBe(false);
    expect(state.conversations).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.isSending).toBe(false);
    expect(state.actions).toEqual([]);
    expect(state.health).toBeNull();
    expect(state.error).toBeNull();
  });

  // ── Chat toggle ──────────────────────────────────────────────

  test("toggleChat flips chatOpen", () => {
    expect(useAiStore.getState().chatOpen).toBe(false);
    act(() => useAiStore.getState().toggleChat());
    expect(useAiStore.getState().chatOpen).toBe(true);
    act(() => useAiStore.getState().toggleChat());
    expect(useAiStore.getState().chatOpen).toBe(false);
  });

  test("setChatOpen sets chatOpen directly", () => {
    act(() => useAiStore.getState().setChatOpen(true));
    expect(useAiStore.getState().chatOpen).toBe(true);
    act(() => useAiStore.getState().setChatOpen(false));
    expect(useAiStore.getState().chatOpen).toBe(false);
  });

  // ── Status ───────────────────────────────────────────────────

  test("fetchStatus stores status on success", async () => {
    const mockStatus = { ai_enabled: true, llm_provider: "openai", llm_model: "gpt-4o", has_api_key: true, connected: true };
    apiMocks.getAiStatus.mockResolvedValue(mockStatus);
    await act(() => useAiStore.getState().fetchStatus());
    expect(useAiStore.getState().status).toEqual(mockStatus);
  });

  test("fetchStatus sets fallback on error", async () => {
    apiMocks.getAiStatus.mockRejectedValue(new Error("Network error"));
    await act(() => useAiStore.getState().fetchStatus());
    expect(useAiStore.getState().status?.ai_enabled).toBe(false);
  });

  test("toggleAiEnabled calls API", async () => {
    const newStatus = { ai_enabled: false, llm_provider: "openai", llm_model: "gpt-4o", has_api_key: true, connected: false };
    apiMocks.toggleAi.mockResolvedValue(newStatus);
    await act(() => useAiStore.getState().toggleAiEnabled());
    expect(apiMocks.toggleAi).toHaveBeenCalled();
    expect(useAiStore.getState().status).toEqual(newStatus);
  });

  // ── Conversations ────────────────────────────────────────────

  test("fetchConversations stores conversations", async () => {
    const convs = [{ id: "c1", project_id: "p1", title: "Test", created_at: "", updated_at: "" }];
    apiMocks.listConversations.mockResolvedValue(convs);
    await act(() => useAiStore.getState().fetchConversations("p1"));
    expect(useAiStore.getState().conversations).toEqual(convs);
  });

  test("startConversation creates and activates", async () => {
    const conv = { id: "new-c", project_id: "p1", title: null, created_at: "", updated_at: "" };
    apiMocks.createConversation.mockResolvedValue(conv);
    let result: unknown;
    await act(async () => { result = await useAiStore.getState().startConversation("p1"); });
    expect(result).toEqual(conv);
    expect(useAiStore.getState().activeConversationId).toBe("new-c");
    expect(useAiStore.getState().messages).toEqual([]);
  });

  test("loadConversation sets messages and active id", async () => {
    const detail = {
      id: "c1", project_id: "p1", title: "Test",
      messages: [
        { id: "m1", conversation_id: "c1", role: "user", content: "Hello", created_at: "" },
        { id: "m2", conversation_id: "c1", role: "assistant", content: "Hi!", created_at: "" },
        { id: "m3", conversation_id: "c1", role: "tool", content: "{}", created_at: "" },
      ],
      created_at: "", updated_at: "",
    };
    apiMocks.getConversation.mockResolvedValue(detail);
    await act(() => useAiStore.getState().loadConversation("c1"));
    const state = useAiStore.getState();
    expect(state.activeConversationId).toBe("c1");
    // Tool messages should be filtered out
    expect(state.messages.length).toBe(2);
    expect(state.messages.every((m) => m.role === "user" || m.role === "assistant")).toBe(true);
  });

  // ── Send message ─────────────────────────────────────────────

  test("send adds optimistic user message then appends reply", async () => {
    const reply = { id: "reply-1", conversation_id: "c1", role: "assistant", content: "AI reply", created_at: "" };
    apiMocks.sendMessage.mockResolvedValue(reply);
    await act(() => useAiStore.getState().send("c1", "User question"));
    const s = useAiStore.getState();
    expect(s.isSending).toBe(false);
    // Should have the optimistic user message + the reply
    expect(s.messages.length).toBe(2);
    expect(s.messages[0].role).toBe("user");
    expect(s.messages[0].content).toBe("User question");
    expect(s.messages[1].content).toBe("AI reply");
  });

  test("send sets error on failure", async () => {
    apiMocks.sendMessage.mockRejectedValue(new Error("API error"));
    await act(() => useAiStore.getState().send("c1", "Fail"));
    const s = useAiStore.getState();
    expect(s.isSending).toBe(false);
    expect(s.error).toBe("API error");
    // Should have user message + error message
    expect(s.messages.length).toBe(2);
    expect(s.messages[1].content).toMatch(/sorry|wrong/i);
  });

  // ── Actions ──────────────────────────────────────────────────

  test("fetchActions stores action list", async () => {
    const actions = [{ id: "a1", project_id: "p1", action_type: "create_qc_flag", title: "Flag", payload: {}, status: "pending", created_at: "" }];
    apiMocks.listActions.mockResolvedValue(actions);
    await act(() => useAiStore.getState().fetchActions("p1"));
    expect(useAiStore.getState().actions).toEqual(actions);
  });

  test("approve updates action status in-place", async () => {
    useAiStore.setState({
      actions: [{ id: "a1", project_id: "p1", conversation_id: null, action_type: "create_qc_flag", title: "Flag", description: null, reasoning: null, payload: {}, status: "pending", impact_summary: null, resolved_by: null, resolved_at: null, created_at: "" }],
    });
    const updated = { ...useAiStore.getState().actions[0], status: "approved", resolved_by: "user" };
    apiMocks.approveAction.mockResolvedValue(updated);
    await act(() => useAiStore.getState().approve("a1"));
    expect(useAiStore.getState().actions[0].status).toBe("approved");
  });

  test("reject updates action status in-place", async () => {
    useAiStore.setState({
      actions: [{ id: "a1", project_id: "p1", conversation_id: null, action_type: "create_qc_flag", title: "Flag", description: null, reasoning: null, payload: {}, status: "pending", impact_summary: null, resolved_by: null, resolved_at: null, created_at: "" }],
    });
    const updated = { ...useAiStore.getState().actions[0], status: "rejected", resolved_by: "user" };
    apiMocks.rejectAction.mockResolvedValue(updated);
    await act(() => useAiStore.getState().reject("a1", "Not needed"));
    expect(useAiStore.getState().actions[0].status).toBe("rejected");
    expect(apiMocks.rejectAction).toHaveBeenCalledWith("a1", "Not needed");
  });

  // ── Health ───────────────────────────────────────────────────

  test("fetchHealth stores health data", async () => {
    const health = { id: "h1", project_id: "p1", health_score: 85, summary: "Good", issues: [], metrics: {}, created_at: "" };
    apiMocks.getProjectHealth.mockResolvedValue(health);
    await act(() => useAiStore.getState().fetchHealth("p1"));
    expect(useAiStore.getState().health).toEqual(health);
  });

  test("fetchHealth sets error on failure", async () => {
    apiMocks.getProjectHealth.mockRejectedValue(new Error("Server error"));
    await act(() => useAiStore.getState().fetchHealth("p1"));
    expect(useAiStore.getState().error).toBe("Server error");
  });

  // ── Error ────────────────────────────────────────────────────

  test("clearError resets error to null", () => {
    useAiStore.setState({ error: "Some error" });
    act(() => useAiStore.getState().clearError());
    expect(useAiStore.getState().error).toBeNull();
  });
});
