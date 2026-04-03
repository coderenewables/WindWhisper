import type { LucideIcon } from "lucide-react";
import { ChevronLeft, Menu } from "lucide-react";
import { NavLink } from "react-router-dom";

interface SidebarSection {
  title: string;
  path: string;
  icon: LucideIcon;
}

interface SidebarProps {
  sections: SidebarSection[];
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onToggleMobile: () => void;
  onNavigate: () => void;
}

export function Sidebar({ sections, collapsed, mobileOpen, onToggleCollapse, onToggleMobile, onNavigate }: SidebarProps) {
  return (
    <>
      <button
        type="button"
        onClick={onToggleMobile}
        className="fixed left-3 top-3 z-40 rounded-lg border border-white/70 bg-white/90 p-2.5 text-ink-800 shadow lg:hidden"
        aria-label="Toggle navigation"
      >
        <Menu className="h-4 w-4" />
      </button>
      <div
        className={[
          "fixed inset-y-0 left-0 z-30 flex h-full flex-col overflow-hidden border-r border-white/10 bg-ink-900 px-3 py-4 text-white transition-[width,transform] duration-300 lg:translate-x-0",
          collapsed ? "w-[104px]" : "w-[224px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className={["mb-6 flex gap-2 px-1", collapsed ? "flex-col items-center" : "items-center justify-between"].join(" ")}>
          <div className={["min-w-0", collapsed ? "flex flex-col items-center" : "block"].join(" ")}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 font-mono text-xs uppercase tracking-widest text-ember-200">
              GK
            </div>
            {!collapsed && <p className="mt-2 text-sm font-semibold">GoKaatru</p>}
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className={["hidden rounded-lg bg-white/5 p-1.5 text-white/60 transition hover:bg-white/10 lg:inline-flex", collapsed ? "self-center" : ""].join(" ")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={collapsed ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"} />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5">
          {sections.map((section) => (
            <NavLink
              key={section.path}
              to={section.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition",
                  isActive ? "bg-white text-ink-900 font-medium" : "text-white/60 hover:bg-white/8 hover:text-white",
                  collapsed ? "justify-center" : "",
                ].join(" ")
              }
              title={collapsed ? section.title : undefined}
            >
              <section.icon className="h-4 w-4 shrink-0" />
              <span className={collapsed ? "hidden" : "truncate"}>{section.title}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      {mobileOpen ? <button type="button" className="fixed inset-0 z-20 bg-ink-900/40 lg:hidden" onClick={onToggleMobile} aria-label="Close navigation" /> : null}
    </>
  );
}