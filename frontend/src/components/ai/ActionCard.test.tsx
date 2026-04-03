import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AiAction } from "../../types/ai";
import { ActionCard } from "./ActionCard";

const baseAction: AiAction = {
  id: "a1",
  project_id: "p1",
  conversation_id: null,
  action_type: "create_qc_flag",
  title: "Apply icing flag to Speed_80m",
  description: "Temperature below 2°C with zero SD indicates icing.",
  reasoning: "Detected 2.1% affected data.",
  payload: { dataset_id: "d1", flag_name: "Icing" },
  status: "pending",
  impact_summary: {
    affected_metrics: [
      { metric: "mean_speed", current: 6.93, projected: 7.06, change_pct: 1.9, direction: "increase" },
    ],
    data_affected_pct: 2.1,
    confidence: "medium",
  },
  resolved_by: null,
  resolved_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

describe("ActionCard", () => {
  const onApprove = vi.fn();
  const onReject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders title and action type", () => {
    render(<ActionCard action={baseAction} onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText("Apply icing flag to Speed_80m")).toBeInTheDocument();
    expect(screen.getByText(/create qc flag/i)).toBeInTheDocument();
  });

  test("shows approve and reject buttons for pending actions", () => {
    render(<ActionCard action={baseAction} onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByTitle("Approve")).toBeInTheDocument();
    expect(screen.getByTitle("Reject")).toBeInTheDocument();
  });

  test("does not show approve/reject for non-pending actions", () => {
    const approved = { ...baseAction, status: "approved" as const };
    render(<ActionCard action={approved} onApprove={onApprove} onReject={onReject} />);
    expect(screen.queryByTitle("Approve")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Reject")).not.toBeInTheDocument();
  });

  test("calls onApprove when approve button is clicked", async () => {
    const user = userEvent.setup();
    render(<ActionCard action={baseAction} onApprove={onApprove} onReject={onReject} />);
    await user.click(screen.getByTitle("Approve"));
    expect(onApprove).toHaveBeenCalledWith("a1");
  });

  test("calls onReject when reject button is clicked", async () => {
    const user = userEvent.setup();
    render(<ActionCard action={baseAction} onApprove={onApprove} onReject={onReject} />);
    await user.click(screen.getByTitle("Reject"));
    expect(onReject).toHaveBeenCalledWith("a1");
  });

  test("renders impact metrics when available", () => {
    render(<ActionCard action={baseAction} onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText(/mean_speed/)).toBeInTheDocument();
    expect(screen.getByText(/1\.9%/)).toBeInTheDocument();
  });

  test("toggles details on click", async () => {
    const user = userEvent.setup();
    render(<ActionCard action={baseAction} onApprove={onApprove} onReject={onReject} />);
    const detailsBtn = screen.getByText("Details");
    await user.click(detailsBtn);
    expect(screen.getByText(/Temperature below 2°C/)).toBeInTheDocument();
  });

  test("shows status badge", () => {
    render(<ActionCard action={baseAction} onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  test("renders approved status", () => {
    const approved = { ...baseAction, status: "approved" as const };
    render(<ActionCard action={approved} onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText("approved")).toBeInTheDocument();
  });

  test("renders rejected status", () => {
    const rejected = { ...baseAction, status: "rejected" as const };
    render(<ActionCard action={rejected} onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText("rejected")).toBeInTheDocument();
  });
});
