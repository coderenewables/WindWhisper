/* Data arrival notification panel — shows recent imports and detected columns */

import { FileUp, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listProjectDatasets } from "../../api/datasets";
import type { DatasetSummary } from "../../types/dataset";

interface DataArrivalPanelProps {
  projectId: string;
}

export function DataArrivalPanel({ projectId }: DataArrivalPanelProps) {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setIsLoading(true);
    listProjectDatasets(projectId)
      .then((res) => setDatasets(res.datasets.slice(0, 5)))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-ink-100 bg-white p-3 dark:border-ink-700 dark:bg-ink-800">
        <p className="text-xs text-ink-400">Loading datasets…</p>
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/50 p-4 text-center dark:border-ink-700 dark:bg-ink-800/50">
        <FileUp className="mx-auto h-5 w-5 text-ink-300" />
        <p className="mt-1.5 text-xs text-ink-500">No datasets yet</p>
        <Link
          to={`/import?projectId=${projectId}`}
          className="mt-2 inline-block rounded-lg bg-ink-900 px-3 py-1 text-xs font-medium text-white hover:bg-ink-700 dark:bg-teal-600 dark:hover:bg-teal-700"
        >
          Import data
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink-700 dark:text-ink-300">
        <FileUp className="h-3.5 w-3.5" /> Datasets
      </h3>
      {datasets.map((ds) => (
        <Link
          key={ds.id}
          to={`/time-series?projectId=${projectId}&datasetId=${ds.id}`}
          className="block rounded-lg border border-ink-100 bg-white px-3 py-2 text-xs transition hover:border-teal-300 hover:shadow-sm dark:border-ink-700 dark:bg-ink-800 dark:hover:border-teal-600"
        >
          <span className="font-medium text-ink-900 dark:text-white">{ds.name}</span>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-ink-400">
            {ds.row_count > 0 && <span>{ds.row_count.toLocaleString()} rows</span>}
            {ds.column_count > 0 && <span>{ds.column_count} col{ds.column_count !== 1 ? "s" : ""}</span>}
            {ds.start_time && ds.end_time && (
              <span>
                {new Date(ds.start_time).toLocaleDateString()} – {new Date(ds.end_time).toLocaleDateString()}
              </span>
            )}
          </div>
        </Link>
      ))}
      {datasets.length > 0 && (
        <Link
          to={`/import?projectId=${projectId}`}
          className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400"
        >
          <Info className="h-3 w-3" /> Import more data
        </Link>
      )}
    </div>
  );
}
