import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import { ProjectPage } from "./ProjectPage";


const datasetMocks = vi.hoisted(() => ({
  listProjectDatasets: vi.fn(),
  getDatasetHistory: vi.fn(),
  undoDatasetChange: vi.fn(),
}));


const storeMocks = vi.hoisted(() => ({
  fetchProject: vi.fn(),
}));


vi.mock("../api/datasets", () => ({
  listProjectDatasets: datasetMocks.listProjectDatasets,
  getDatasetHistory: datasetMocks.getDatasetHistory,
  undoDatasetChange: datasetMocks.undoDatasetChange,
}));


vi.mock("../stores/projectStore", () => ({
  useProjectStore: () => ({
    activeProject: {
      id: "project-1",
      name: "History Project",
      description: "Project page history coverage",
      latitude: 11.2,
      longitude: 76.6,
      elevation: 1234,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-02T00:00:00Z",
      dataset_count: 2,
    },
    projects: [],
    error: null,
    fetchProject: storeMocks.fetchProject,
  }),
}));


function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/project/project-1"]}>
      <Routes>
        <Route path="/project/:id" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>,
  );
}


beforeEach(() => {
  vi.clearAllMocks();
  datasetMocks.listProjectDatasets.mockResolvedValue({
    datasets: [
      {
        id: "dataset-1",
        project_id: "project-1",
        name: "Mast A",
        source_type: "mast",
        file_name: "mast-a.csv",
        time_step_seconds: 600,
        start_time: "2025-01-01T00:00:00Z",
        end_time: "2025-01-01T01:00:00Z",
        created_at: "2025-01-02T00:00:00Z",
        column_count: 4,
        row_count: 6,
      },
      {
        id: "dataset-2",
        project_id: "project-1",
        name: "Mast B",
        source_type: "mast",
        file_name: "mast-b.csv",
        time_step_seconds: 600,
        start_time: "2025-01-01T00:00:00Z",
        end_time: "2025-01-01T01:00:00Z",
        created_at: "2025-01-02T00:00:00Z",
        column_count: 5,
        row_count: 8,
      },
    ],
    total: 2,
  });
  datasetMocks.getDatasetHistory.mockImplementation(async (datasetId: string) => {
    if (datasetId === "dataset-2") {
      return {
        changes: [
          {
            id: "change-2",
            dataset_id: "dataset-2",
            action_type: "flag_removed",
            description: "Removed a transient flag.",
            before_state: null,
            after_state: null,
            created_at: "2025-01-03T00:00:00Z",
          },
        ],
        total: 1,
      };
    }

    return {
      changes: [
        {
          id: "change-1",
          dataset_id: "dataset-1",
          action_type: "column_added",
          description: "Created extrapolated wind shear column Speed_100m_power.",
          before_state: null,
          after_state: null,
          created_at: "2025-01-03T00:00:00Z",
        },
      ],
      total: 1,
    };
  });
  datasetMocks.undoDatasetChange.mockResolvedValue({
    undone_change: {
      id: "change-1",
      dataset_id: "dataset-1",
      action_type: "column_added",
      description: "Created extrapolated wind shear column Speed_100m_power.",
      before_state: null,
      after_state: null,
      created_at: "2025-01-03T00:00:00Z",
    },
  });
});


test("shows dataset history on the project page and undoes the latest change", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByRole("heading", { name: /available time-series sources/i });
  await screen.findByRole("heading", { name: /change timeline/i });
  await user.click(screen.getByRole("button", { name: /undo latest change/i }));

  await waitFor(() => {
    expect(datasetMocks.undoDatasetChange).toHaveBeenCalledWith("dataset-1");
  });
});


test("switches the history panel dataset scope from the selector", async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByRole("heading", { name: /change timeline/i });
  await user.selectOptions(screen.getByLabelText(/history dataset/i), "dataset-2");

  await waitFor(() => {
    expect(datasetMocks.getDatasetHistory).toHaveBeenCalledWith("dataset-2");
  });
  await screen.findByText(/removed a transient flag/i);
});