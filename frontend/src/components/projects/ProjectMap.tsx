import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Download, MapPinned, Navigation } from "lucide-react";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useNavigate } from "react-router-dom";

import type { Project } from "../../types/project";


const defaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

interface ProjectMapProps {
  projects: Project[];
  isDownloadingKml?: boolean;
  onDownloadKml?: () => void;
}

interface ProjectMapViewportProps {
  projects: Project[];
}

function ProjectMapViewport({ projects }: ProjectMapViewportProps) {
  const map = useMap();

  useEffect(() => {
    if (projects.length === 0) {
      return;
    }

    const bounds = L.latLngBounds(
      projects.map((project) => [project.latitude as number, project.longitude as number] as [number, number]),
    );

    if (projects.length === 1) {
      map.setView(bounds.getCenter(), 8);
      return;
    }

    map.fitBounds(bounds.pad(0.2));
  }, [map, projects]);

  return null;
}

function formatCoordinates(project: Project) {
  if (project.latitude == null || project.longitude == null) {
    return "Coordinates unavailable";
  }

  return `${project.latitude.toFixed(3)}, ${project.longitude.toFixed(3)}`;
}

export function ProjectMap({ projects, isDownloadingKml = false, onDownloadKml }: ProjectMapProps) {
  const navigate = useNavigate();
  const mappedProjects = projects.filter((project) => project.latitude != null && project.longitude != null);

  return (
    <section className="panel-surface overflow-hidden p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-teal-500">Geospatial view</p>
          <h2 className="mt-3 text-2xl font-semibold text-ink-900">Project map</h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-ink-600">
            Review all campaign locations on an OpenStreetMap basemap and jump directly into a project from its marker popup.
          </p>
        </div>

        <button
          type="button"
          onClick={onDownloadKml}
          disabled={isDownloadingKml || mappedProjects.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800 transition hover:border-ink-400 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {isDownloadingKml ? "Preparing KML" : "Export KML"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="panel-muted flex items-center gap-3 px-4 py-4 text-sm text-ink-700">
          <MapPinned className="h-4 w-4 text-teal-500" />
          <span>{mappedProjects.length} mapped projects</span>
        </div>
        <div className="panel-muted flex items-center gap-3 px-4 py-4 text-sm text-ink-700">
          <Navigation className="h-4 w-4 text-teal-500" />
          <span>{projects.length - mappedProjects.length} awaiting coordinates</span>
        </div>
        <div className="panel-muted px-4 py-4 text-sm text-ink-700">
          OpenStreetMap tiles with project-level navigation from each popup.
        </div>
      </div>

      {mappedProjects.length === 0 ? (
        <div className="mt-5 rounded-[28px] border border-dashed border-ink-200 px-5 py-10 text-sm text-ink-600">
          Add latitude and longitude to a project to place it on the map and enable KML export.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-[28px] border border-ink-100/80">
          <MapContainer center={[mappedProjects[0].latitude as number, mappedProjects[0].longitude as number]} zoom={5} scrollWheelZoom className="h-[340px] w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ProjectMapViewport projects={mappedProjects} />
            {mappedProjects.map((project) => (
              <Marker key={project.id} position={[project.latitude as number, project.longitude as number]} icon={defaultIcon}>
                <Popup>
                  <div className="space-y-3 text-sm text-ink-800">
                    <div>
                      <p className="font-semibold text-ink-900">{project.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-teal-600">{formatCoordinates(project)}</p>
                    </div>
                    <p className="leading-6 text-ink-600">
                      {project.description || "Project description pending. Add campaign context in the project details."}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(`/project/${project.id}`)}
                      className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-ink-700"
                    >
                      Open project
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </section>
  );
}