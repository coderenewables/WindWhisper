import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({
  setChatOpen: vi.fn(),
  startConversation: vi.fn(),
  send: vi.fn(),
  status: { ai_enabled: true, llm_provider: "openai", llm_model: "gpt-4o", has_api_key: true, connected: true } as const,
}));

vi.mock("../../stores/aiStore", () => ({
  useAiStore: () => ({
    setChatOpen: storeMocks.setChatOpen,
    startConversation: storeMocks.startConversation,
    send: storeMocks.send,
    status: storeMocks.status,
  }),
}));

import { CommandBar } from "./CommandBar";

beforeEach(() => {
  vi.clearAllMocks();
  storeMocks.startConversation.mockResolvedValue({ id: "conv-1", project_id: "p1", title: null, created_at: "", updated_at: "" });
  storeMocks.send.mockResolvedValue(null);
});

describe("CommandBar", () => {
  test("renders nothing when closed", () => {
    const { container } = render(<CommandBar projectId="p1" />);
    expect(container.firstChild).toBeNull();
  });

  test("opens on Ctrl+K and shows quick actions", async () => {
    render(<CommandBar projectId="p1" />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await screen.findByPlaceholderText(/ask ai|quick actions/i);
    expect(screen.getByText(/run weibull/i)).toBeInTheDocument();
    expect(screen.getByText(/check data quality/i)).toBeInTheDocument();
  });

  test("closes on Escape", async () => {
    render(<CommandBar projectId="p1" />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await screen.findByPlaceholderText(/ask ai|quick actions/i);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/ask ai|quick actions/i)).not.toBeInTheDocument();
    });
  });

  test("filters quick actions on typing", async () => {
    const user = userEvent.setup();
    render(<CommandBar projectId="p1" />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    const input = await screen.findByPlaceholderText(/ask ai|quick actions/i);
    await user.type(input, "weibull");
    expect(screen.getByText(/run weibull/i)).toBeInTheDocument();
    expect(screen.queryByText(/check data quality/i)).not.toBeInTheDocument();
  });

  test("submitting creates conversation and sends message", async () => {
    const user = userEvent.setup();
    render(<CommandBar projectId="p1" />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    const input = await screen.findByPlaceholderText(/ask ai|quick actions/i);
    await user.type(input, "custom query{Enter}");
    await waitFor(() => {
      expect(storeMocks.setChatOpen).toHaveBeenCalledWith(true);
      expect(storeMocks.startConversation).toHaveBeenCalledWith("p1");
      expect(storeMocks.send).toHaveBeenCalledWith("conv-1", "custom query");
    });
  });

  test("clicking a quick action submits its query", async () => {
    const user = userEvent.setup();
    render(<CommandBar projectId="p1" />);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    await screen.findByPlaceholderText(/ask ai|quick actions/i);
    const btn = screen.getByText(/run weibull/i);
    await user.click(btn);
    await waitFor(() => {
      expect(storeMocks.send).toHaveBeenCalled();
    });
  });
});
