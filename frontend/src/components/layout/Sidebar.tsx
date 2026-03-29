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
        className="fixed left-4 top-4 z-40 rounded-full border border-white/70 bg-white/90 p-3 text-ink-800 shadow-panel lg:hidden"
        aria-label="Toggle navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div
        className={[
          "fixed inset-y-0 left-0 z-30 flex h-full flex-col overflow-hidden border-r border-white/50 bg-ink-900/95 px-4 py-5 text-white shadow-panel backdrop-blur-xl transition-[width,transform] duration-300 lg:translate-x-0",
          collapsed ? "w-[120px]" : "w-[240px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className={["mb-8 flex gap-3 px-2", collapsed ? "flex-col items-center" : "items-start justify-between"].join(" ")}>
          <div className={["min-w-0", collapsed ? "flex flex-col items-center text-center" : "block"].join(" ")}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 font-mono text-sm uppercase tracking-[0.22em] text-ember-200">
              GK
            </div>
            {collapsed ? (
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">GoK</p>
            ) : (
              <>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.32em] text-ember-300">Wind resource</p>
                <h1 className="mt-2 text-xl font-semibold">GoKaatru</h1>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className={["hidden rounded-full border border-white/10 bg-white/5 p-2 text-white/80 transition hover:bg-white/10 lg:inline-flex", collapsed ? "self-center" : "self-start"].join(" ")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={collapsed ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
          </button>
        </div>

        <nav className="flex-1 space-y-2">
          {sections.map((section) => (
            <NavLink
              key={section.path}
              to={section.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  "group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition",
                  isActive ? "bg-white text-ink-900 shadow-lg" : "text-white/70 hover:bg-white/8 hover:text-white",
                  collapsed ? "justify-center lg:px-2" : "",
                ].join(" ")
              }
              title={collapsed ? section.title : undefined}
            >
              <section.icon className="h-4 w-4 shrink-0" />
              <span className={collapsed ? "hidden" : "truncate"}>{section.title}</span>
            </NavLink>
          ))}
        </nav>

        {collapsed ? (
          <div className="mt-6 flex justify-center px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-200">
              Live
            </div>
          </div>
        ) : (
          <div className="panel-muted mt-6 border-white/10 bg-white/5 p-4 text-white/75">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-teal-300">Status</p>
            <p className="mt-2 text-sm leading-6">All workspaces are available from the main navigation.</p>
          </div>
        )}
      </div>
      {mobileOpen ? <button type="button" className="fixed inset-0 z-20 bg-ink-900/40 lg:hidden" onClick={onToggleMobile} aria-label="Close navigation" /> : null}
    </>
  );
}