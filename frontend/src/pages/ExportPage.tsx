import { Download, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { listPowerCurves } from "../api/analysis";
import { getDataset, listProjectDatasets } from "../api/datasets";
import { listFlags } from "../api/qc";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ExportWizard } from "../components/export/ExportWizard";
import { ReportGenerator } from "../components/export/ReportGenerator";
import { useProjectStore } from "../stores/projectStore";
import type { PowerCurveLibraryItem } from "../types/analysis";
import type { DatasetDetail, DatasetSummary } from "../types/dataset";
import type { Flag } from "../types/qc";


export function ExportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const datasetId = searchParams.get("datasetId") ?? "";
  const { projects, fetchProjects } = useProjectStore();
  const activeProject = projects.find((project) => project.id === projectId) ?? null;

  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetDetail, setDatasetDetail] = useState<DatasetDetail | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [powerCurves, setPowerCurves] = useState<PowerCurveLibraryItem[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [isLoadingDatasetDetail, setIsLoadingDatasetDetail] = useState(false);
  const [isLoadingFlags, setIsLoadingFlags] = useState(false);
  const [isLoadingPowerCurves, setIsLoadingPowerCurves] = useState(false);

  useEffect(() => {
    if (projects.length === 0) {
      void fetchProjects();
    }
  }, [fetchProjects, projects.length]);

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("projectId", projects[0].id);
      setSearchParams(nextParams, { replace: true });
    }
  }, [projectId, projects, searchParams, setSearchParams]);

  useEffect(() => {
    if (!projectId) {
      setDatasets([]);
      setDatasetDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoadingDatasets(true);
    setPageError(null);

    void listProjectDatasets(projectId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setDatasets(response.datasets);
        setIsLoadingDatasets(false);

        if (!datasetId && response.datasets.length > 0) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("projectId", projectId);
          nextParams.set("datasetId", response.datasets[0].id);
          setSearchParams(nextParams, { replace: true });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Unable to load datasets");
          setIsLoadingDatasets(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId, projectId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!datasetId) {
      setDatasetDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoadingDatasetDetail(true);
    setPageError(null);

    void getDataset(datasetId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setDatasetDetail(response);
        setIsLoadingDatasetDetail(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Unable to load dataset detail");
          setIsLoadingDatasetDetail(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) {
      setFlags([]);
      return;
    }

    let cancelled = false;
    setIsLoadingFlags(true);
    void listFlags(datasetId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setFlags(response);
        setIsLoadingFlags(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFlags([]);
          setIsLoadingFlags(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingPowerCurves(true);

    void listPowerCurves()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setPowerCurves(response.items);
        setIsLoadingPowerCurves(false);
      })
      .catch(() => {
        if (!cancelled) {
          setPowerCurves([]);
          setIsLoadingPowerCurves(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoadingDatasets || isLoadingDatasetDetail || isLoadingFlags || isLoadingPowerCurves) {
    return (
      <section className="panel-surface p-6">
        <LoadingSpinner label="Loading export workspace" />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="panel-surface p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-ember-200 bg-ember-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-ember-700">
              <Download className="h-3.5 w-3.5" />
              Export workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-ink-900">Download clean CSV, WAsP TAB, IEA Task 43 JSON, and Openwind deliverables</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-600">
              Select a project dataset, apply QC exclusions, preview the generated file, and download the exact export needed for downstream analysis or data exchange.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Project
              <select value={projectId} onChange={(event) => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set("projectId", event.target.value);
                nextParams.delete("datasetId");
                setSearchParams(nextParams, { replace: true });
              }} className="rounded-2xl border-ink-200 bg-white">
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-ink-800">
              Dataset
              <select value={datasetId} onChange={(event) => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set("projectId", projectId);
                nextParams.set("datasetId", event.target.value);
                setSearchParams(nextParams, { replace: true });
              }} className="rounded-2xl border-ink-200 bg-white">
                <option value="">Select dataset</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {pageError ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{pageError}</div> : null}

        {!datasetDetail && !pageError ? (
          <div className="mt-5 rounded-[28px] border border-dashed border-ink-200 px-5 py-10 text-sm text-ink-600">
            Choose a project and dataset to configure export outputs. The preview panel becomes available as soon as a dataset is selected.
          </div>
        ) : null}
      </section>

      {datasetDetail ? <ExportWizard datasetDetail={datasetDetail} flags={flags} /> : null}

      {datasetDetail && activeProject ? (
        <ReportGenerator
          projectId={activeProject.id}
          projectName={activeProject.name}
          datasetDetail={datasetDetail}
          flags={flags}
          powerCurves={powerCurves}
        />
      ) : null}

      {datasetDetail ? (
        <section className="panel-muted flex items-start gap-3 p-5 text-sm text-ink-700">
          <FileSpreadsheet className="mt-0.5 h-4 w-4 text-teal-600" />
          <p>
            CSV, Openwind, and IEA JSON exports can include any selected dataset columns. WAsP TAB export requires one wind speed column and one wind direction column from the same dataset. Report generation now uses the selected dataset, explicit report input columns, and the chosen power curve before applying QC exclusions and calculating figures.
          </p>
        </section>
      ) : null}
    </div>
  );
}