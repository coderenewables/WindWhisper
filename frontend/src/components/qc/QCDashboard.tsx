import type { ReactNode } from "react";

interface QCDashboardProps {
  sidebar: ReactNode;
  main: ReactNode;
}

export function QCDashboard({ sidebar, main }: QCDashboardProps) {
  return <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]"> <div className="space-y-6">{sidebar}</div> <div className="space-y-6">{main}</div> </section>;
}
