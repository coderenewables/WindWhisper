import type { ReactNode } from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";

import { ProjectMap } from "./ProjectMap";


const navigateMock = vi.fn();


vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});


vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: { children: ReactNode }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useMap: () => ({
    fitBounds: vi.fn(),
    setView: vi.fn(),
  }),
}));


test("navigates to the selected project from the marker popup action", async () => {
  const user = userEvent.setup();

  render(
    <MemoryRouter>
      <ProjectMap
        projects={[
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
        ]}
      />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: /project map/i })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /open project/i }));

  expect(navigateMock).toHaveBeenCalledWith("/project/project-1");
});