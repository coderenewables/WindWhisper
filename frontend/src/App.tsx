import { BarChart3, DatabaseZap, Download, FileUp, Gauge, LayoutDashboard, LineChart, ShieldCheck } from "lucide-react";
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { LoadingSpinner } from "./components/common/LoadingSpinner";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { ImportPage } from "./pages/ImportPage";
import { ProjectPage } from "./pages/ProjectPage";

const TimeSeriesPage = lazy(async () => {
  const module = await import("./pages/TimeSeriesPage");
  return { default: module.TimeSeriesPage };
});

const QCPage = lazy(async () => {
  const module = await import("./pages/QCPage");
  return { default: module.QCPage };
});

const AnalysisPage = lazy(async () => {
  const module = await import("./pages/AnalysisPage");
  return { default: module.AnalysisPage };
});

const MCPPage = lazy(async () => {
  const module = await import("./pages/MCPPage");
  return { default: module.MCPPage };
});

const EnergyPage = lazy(async () => {
  const module = await import("./pages/EnergyPage");
  return { default: module.EnergyPage };
});

const ExportPage = lazy(async () => {
  const module = await import("./pages/ExportPage");
  return { default: module.ExportPage };
});

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="panel-surface flex min-h-[320px] flex-col justify-between p-8">
      <div>
        <span className="font-mono text-xs uppercase tracking-[0.32em] text-ember-500">Coming soon</span>
        <h1 className="mt-4 text-3xl font-semibold text-ink-900">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">{description}</p>
      </div>
      <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: FileUp, label: "Import pipeline" },
          { icon: LineChart, label: "Time-series tools" },
          { icon: ShieldCheck, label: "QC workflows" },
          { icon: Download, label: "Export deliverables" },
        ].map((item) => (
          <div key={item.label} className="panel-muted flex items-center gap-3 px-4 py-4 text-sm text-ink-700">
            <item.icon className="h-4 w-4 text-teal-500" />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const appSections = [
  { title: "Dashboard", path: "/", icon: LayoutDashboard },
  { title: "Import", path: "/import", icon: FileUp },
  { title: "Time Series", path: "/time-series", icon: LineChart },
  { title: "QC", path: "/qc", icon: ShieldCheck },
  { title: "Analysis", path: "/analysis", icon: BarChart3 },
  { title: "MCP", path: "/mcp", icon: DatabaseZap },
  { title: "Energy", path: "/energy", icon: Gauge },
  { title: "Export", path: "/export", icon: Download },
];

function RouteFallback() {
  return (
    <section className="panel-surface p-6">
      <LoadingSpinner label="Loading workspace" />
    </section>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell sections={appSections} />}>
        <Route index element={<DashboardPage />} />
        <Route path="project/:id" element={<ProjectPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="time-series" element={<Suspense fallback={<RouteFallback />}><TimeSeriesPage /></Suspense>} />
        <Route path="qc" element={<Suspense fallback={<RouteFallback />}><QCPage /></Suspense>} />
        <Route path="analysis" element={<Suspense fallback={<RouteFallback />}><AnalysisPage /></Suspense>} />
        <Route path="mcp" element={<Suspense fallback={<RouteFallback />}><MCPPage /></Suspense>} />
        <Route path="energy" element={<Suspense fallback={<RouteFallback />}><EnergyPage /></Suspense>} />
        <Route path="export" element={<Suspense fallback={<RouteFallback />}><ExportPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}