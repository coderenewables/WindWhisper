import { Menu, MoonStar, PanelLeftClose, PanelLeftOpen, SunMedium } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

interface TopBarProps {
  darkMode: boolean;
  sidebarCollapsed: boolean;
  onToggleDarkMode: () => void;
  onToggleSidebar: () => void;
  onToggleMobileNavigation: () => void;
}

function humanize(segment: string) {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function TopBar({ darkMode, sidebarCollapsed, onToggleDarkMode, onToggleSidebar, onToggleMobileNavigation }: TopBarProps) {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  return (
    <header className="panel-surface sticky top-4 z-10 mb-6 flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggleMobileNavigation}
          className="inline-flex rounded-full border border-ink-200 bg-white p-2.5 text-ink-700 transition hover:border-ink-400 hover:text-ink-900 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden rounded-full border border-ink-200 bg-white p-2.5 text-ink-700 transition hover:border-ink-400 hover:text-ink-900 lg:inline-flex"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ember-500">GoKaatru</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <Link to="/" className="font-medium text-ink-700 transition hover:text-ink-900">
              Dashboard
            </Link>
            {segments.map((segment, index) => {
              const path = `/${segments.slice(0, index + 1).join("/")}`;
              return (
                <span key={path} className="flex items-center gap-2">
                  <span className="text-ink-300">/</span>
                  <Link to={path} className="transition hover:text-ink-900">
                    {humanize(segment)}
                  </Link>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 self-start sm:self-auto">
        <div className="rounded-full border border-ink-200 bg-white px-4 py-2 font-mono text-xs uppercase tracking-[0.26em] text-ink-500">
          Foundation
        </div>
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="rounded-full border border-ink-200 bg-white p-2.5 text-ink-700 transition hover:border-ink-400 hover:text-ink-900"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}