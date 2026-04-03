import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { AiProvider } from "../../ai/AiProvider";
import { useAiStore } from "../../stores/aiStore";
import { AiChatPanel } from "../ai/AiChatPanel";
import { CommandBar } from "../ai/CommandBar";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface AppSection {
  title: string;
  path: string;
  icon: LucideIcon;
}

interface AppShellProps {
  sections: AppSection[];
}

export function AppShell({ sections }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const { status, fetchStatus, chatOpen, toggleChat } = useAiStore();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Register Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        toggleChat();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleChat]);

  // Extract projectId from URL for AI context
  const projectId =
    location.pathname.match(/(?:project|workspace)\/([^/]+)/)?.[1] ??
    new URLSearchParams(location.search).get("projectId") ??
    undefined;

  return (
    <AiProvider projectId={projectId}>
      <div className="min-h-screen text-ink-900 transition dark:bg-ink-900 dark:text-white">
        <Sidebar
          sections={sections}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileOpen}
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
          onToggleMobile={() => setMobileOpen((current) => !current)}
          onNavigate={() => setMobileOpen(false)}
        />

        {/* Main content area – adjusts for both sidebar and AI pane */}
        <div
          className={[
            "min-h-screen px-4 pb-8 pt-16 transition-[padding] duration-300 sm:px-5 lg:px-6 lg:pt-2",
            sidebarCollapsed ? "lg:pl-[136px]" : "lg:pl-[256px]",
            chatOpen ? "lg:pr-[340px]" : "",
          ].join(" ")}
        >
          <TopBar
            darkMode={darkMode}
            sidebarCollapsed={sidebarCollapsed}
            aiEnabled={status?.ai_enabled ?? false}
            aiConnected={status?.connected ?? false}
            onToggleDarkMode={() => setDarkMode((current) => !current)}
            onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
            onToggleMobileNavigation={() => setMobileOpen((current) => !current)}
          />
          <main>
            <Outlet />
          </main>
        </div>

        {/* AI right pane – persistent, collapsible like sidebar */}
        <AiChatPanel projectId={projectId} />
        <CommandBar projectId={projectId} />
      </div>
    </AiProvider>
  );
}