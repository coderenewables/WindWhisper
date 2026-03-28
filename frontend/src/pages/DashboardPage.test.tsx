import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";


const exportMocks = vi.hoisted(() => ({
  downloadProjectKmlExport: vi.fn(),
}));


const storeMocks = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  createProject: vi.fn(),
  clearError: vi.fn(),
}));


vi.mock("../api/export", () => ({
  downloadProjectKmlExport: exportMocks.downloadProjectKmlExport,
}));


vi.mock("../components/projects/ProjectMap", () => ({
  ProjectMap: ({ onDownloadKml, isDownloadingKml, projects }: { onDownloadKml?: () => void; isDownloadingKml?: boolean; projects: Array<{ id: string; name: string }> }) => (
    <section>
      <h2>Project map</h2>
      <p>{projects.map((project) => project.name).join(", ")}</p>
      <button type="button" onClick={onDownloadKml} disabled={isDownloadingKml}>Export KML</button>
    </section>
  ),
}));


vi.mock("../stores/projectStore", () => ({
  useProjectStore: Object.assign(
    () => ({
      projects: [
        {
          id: "project-1",
          name: "Coastal Mast",
          description: "Primary campaign",
          latitude: 11.2,
          longitude: 76.6,
          elevation: 1200,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-02T00:00:00Z",
          dataset_count: 2,
        },
        {
          id: "project-2",
          name: "Ridge Met",
          description: "Secondary campaign",
          latitude: 10.8,
          longitude: 77.1,
          elevation: 980,
          created_at: "2025-01-05T00:00:00Z",
          updated_at: "2025-01-06T00:00:00Z",
          dataset_count: 1,
        },
      ],
      total: 2,
      error: null,
      isLoadingProjects: false,
      isSubmitting: false,
      fetchProjects: storeMocks.fetchProjects,
      createProject: storeMocks.createProject,
      clearError: storeMocks.clearError,
    }),
    {
      setState: vi.fn(),
    },
  ),
}));


beforeEach(() => {
  vi.clearAllMocks();
  exportMocks.downloadProjectKmlExport.mockResolvedValue({
    blob: new Blob(["<kml></kml>"], { type: "application/vnd.google-earth.kml+xml" }),
    fileName: "gokaatru-projects.kml",
    contentType: "application/vnd.google-earth.kml+xml",
  });
});


test("renders the dashboard project list and geospatial panel", async () => {
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: /organize measurement campaigns before import, qc, and energy analysis/i });
  expect(screen.getByRole("heading", { name: /project map/i })).toBeInTheDocument();
  expect(screen.getByText(/coastal mast, ridge met/i)).toBeInTheDocument();
});


test("downloads a KML file for the visible projects", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );

  await user.click(screen.getByRole("button", { name: /export kml/i }));

  await waitFor(() => {
    expect(exportMocks.downloadProjectKmlExport).toHaveBeenCalledWith({
      project_ids: ["project-1", "project-2"],
    });
  });
});