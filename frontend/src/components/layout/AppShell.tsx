import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <div className="min-h-screen text-ink-900 transition dark:bg-ink-900 dark:text-white">
      <Sidebar
        sections={sections}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        onToggleMobile={() => setMobileOpen((current) => !current)}
        onNavigate={() => setMobileOpen(false)}
      />

      <div
        className={[
          "min-h-screen px-4 pb-8 pt-20 transition-[padding] duration-300 sm:px-6 lg:px-8 lg:pt-4",
          sidebarCollapsed ? "lg:pl-[136px]" : "lg:pl-[272px]",
        ].join(" ")}
      >
        <TopBar darkMode={darkMode} onToggleDarkMode={() => setDarkMode((current) => !current)} />
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}