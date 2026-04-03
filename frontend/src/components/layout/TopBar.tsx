import { Bot, Menu, MoonStar, PanelLeftClose, PanelLeftOpen, Search, SunMedium } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { useAi } from "../../ai/AiProvider";
import { useAiStore } from "../../stores/aiStore";

interface TopBarProps {
  darkMode: boolean;
  sidebarCollapsed: boolean;
  aiEnabled?: boolean;
  aiConnected?: boolean;
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

export function TopBar({ darkMode, sidebarCollapsed, aiEnabled, aiConnected, onToggleDarkMode, onToggleSidebar, onToggleMobileNavigation }: TopBarProps) {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const { toggleChat, chatOpen } = useAiStore();
  const { pendingCount } = useAi();

  return (
    <header className="sticky top-2 z-10 mb-4 flex items-center justify-between rounded-xl border border-ink-100 bg-white/80 px-3 py-2 backdrop-blur dark:border-ink-700 dark:bg-ink-800/80">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMobileNavigation}
          className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 lg:inline-flex"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        <nav className="flex items-center gap-1 text-xs text-ink-500">
          <Link to="/" className="font-medium text-ink-600 transition hover:text-ink-900">Home</Link>
          {segments.map((segment, index) => {
            const path = `/${segments.slice(0, index + 1).join("/")}`;
            return (
              <span key={path} className="flex items-center gap-1">
                <span className="text-ink-300">/</span>
                <Link to={path} className="transition hover:text-ink-900">{humanize(segment)}</Link>
              </span>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-1.5">
        {/* AI status indicator */}
        {aiEnabled && (
          <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-ink-400">
            <span className={`h-1.5 w-1.5 rounded-full ${aiConnected ? "bg-green-500" : "bg-ink-300"}`} />
            AI
          </span>
        )}

        {/* Command bar trigger */}
        <button
          type="button"
          onClick={toggleChat}
          className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          title="Search (Ctrl+K)"
        >
          <Search className="h-4 w-4" />
        </button>

        {/* AI chat toggle with pending badge */}
        <button
          type="button"
          onClick={toggleChat}
          className={`relative rounded-lg p-1.5 transition ${
            chatOpen
              ? "bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400"
              : "text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          }`}
          title="Toggle AI (Ctrl+K)"
        >
          <Bot className="h-4 w-4" />
          {pendingCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}