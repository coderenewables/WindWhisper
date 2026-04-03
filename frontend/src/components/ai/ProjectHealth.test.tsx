import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { AiHealth } from "../../types/ai";
import { ProjectHealth } from "./ProjectHealth";

const healthHigh: AiHealth = {
  id: "h1",
  project_id: "p1",
  health_score: 92,
  summary: "Project is in excellent condition.",
  issues: [],
  metrics: { dataset_count: 2, flag_count: 3 },
  created_at: "2026-01-01T00:00:00Z",
};

const healthMedium: AiHealth = {
  id: "h2",
  project_id: "p1",
  health_score: 55,
  summary: "Several analyses are missing.",
  issues: [
    { severity: "warning", category: "qc", message: "No QC flags defined", suggested_action: "Run QC checks" },
    { severity: "info", category: "analysis", message: "Missing: shear, turbulence", suggested_action: "Run analysis" },
  ],
  metrics: { dataset_count: 1 },
  created_at: "2026-01-01T00:00:00Z",
};

const healthLow: AiHealth = {
  id: "h3",
  project_id: "p1",
  health_score: 25,
  summary: "Critical data issues detected.",
  issues: [
    { severity: "critical", category: "data", message: "Data recovery below 50%", suggested_action: "Check data gaps" },
  ],
  metrics: {},
  created_at: "2026-01-01T00:00:00Z",
};

describe("ProjectHealth", () => {
  test("renders health score in compact mode", () => {
    render(<ProjectHealth health={healthHigh} compact />);
    expect(screen.getByText("92")).toBeInTheDocument();
  });

  test("renders full mode with heading and score", () => {
    render(<ProjectHealth health={healthHigh} />);
    expect(screen.getByText(/project health/i)).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
  });

  test("shows no issues for healthy project", () => {
    render(<ProjectHealth health={healthHigh} />);
    expect(screen.queryByText(/No QC flags/)).not.toBeInTheDocument();
  });

  test("renders issues for medium health", () => {
    render(<ProjectHealth health={healthMedium} />);
    expect(screen.getByText("No QC flags defined")).toBeInTheDocument();
    expect(screen.getByText(/shear, turbulence/i)).toBeInTheDocument();
  });

  test("applies green color for high score", () => {
    render(<ProjectHealth health={healthHigh} />);
    const scoreEl = screen.getByText("92");
    expect(scoreEl.className).toMatch(/green/);
  });

  test("applies amber color for medium score", () => {
    render(<ProjectHealth health={healthMedium} />);
    const scoreEl = screen.getByText("55");
    expect(scoreEl.className).toMatch(/amber/);
  });

  test("applies red color for low score", () => {
    render(<ProjectHealth health={healthLow} />);
    const scoreEl = screen.getByText("25");
    expect(scoreEl.className).toMatch(/red/);
  });

  test("limits displayed issues to 4", () => {
    const manyIssues: AiHealth = {
      ...healthMedium,
      issues: Array.from({ length: 6 }, (_, i) => ({
        severity: "info" as const,
        category: "test",
        message: `Issue ${i + 1}`,
        suggested_action: "Fix it",
      })),
    };
    render(<ProjectHealth health={manyIssues} />);
    expect(screen.getByText("Issue 1")).toBeInTheDocument();
    expect(screen.getByText("Issue 4")).toBeInTheDocument();
    expect(screen.queryByText("Issue 5")).not.toBeInTheDocument();
  });
});
