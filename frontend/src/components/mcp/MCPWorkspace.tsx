import { ArrowRightLeft, Bot, Sparkles } from "lucide-react";

import { CorrelationChart } from "./CorrelationChart";
import { LTAResultsTable } from "./LTAResultsTable";
import { ReferenceDataSelector } from "./ReferenceDataSelector";
import { LoadingSpinner } from "../common/LoadingSpinner";
import type {
  MCPComparisonResponse,
  MCPCorrelationResponse,
  MCPMethod,
  MCPPredictionResponse,
  MCPReferenceDataSource,
  MCPReferenceDownloadStatusResponse,
} from "../../types/analysis";
import type { DatasetDetail, DatasetSummary } from "../../types/dataset";

interface MCPWorkspaceProps {
  datasets: DatasetSummary[];
  siteDatasetId: string;
  refDatasetId: string;
  siteDetail: DatasetDetail | null;
  refDetail: DatasetDetail | null;
  siteColumnId: string;
  refColumnId: string;
  extraSiteColumnIds: string[];
  extraRefColumnIds: string[];
  method: MCPMethod;
  correlationData: MCPCorrelationResponse | null;
  comparisonData: MCPComparisonResponse | null;
  predictionData: MCPPredictionResponse | null;
  downloadSource: MCPReferenceDataSource;
  downloadLatitude: string;
  downloadLongitude: string;
  downloadStartYear: string;
  downloadEndYear: string;
  downloadDatasetName: string;
  downloadApiKey: string;
  downloadStatus: MCPReferenceDownloadStatusResponse | null;
  downloadError: string | null;
  isDownloading: boolean;
  pageError: string | null;
  correlationError: string | null;
  predictionError: string | null;
  isLoadingDatasets: boolean;
  isLoadingDetails: boolean;
  isCorrelating: boolean;
  isComparing: boolean;
  isPredicting: boolean;
  onSiteDatasetChange: (datasetId: string) => void;
  onRefDatasetChange: (datasetId: string) => void;
  onSiteColumnChange: (columnId: string) => void;
  onRefColumnChange: (columnId: string) => void;
  onExtraSiteColumnsChange: (columnIds: string[]) => void;
  onExtraRefColumnsChange: (columnIds: string[]) => void;
  onMethodChange: (method: MCPMethod) => void;
  onDownloadSourceChange: (source: MCPReferenceDataSource) => void;
  onDownloadLatitudeChange: (value: string) => void;
  onDownloadLongitudeChange: (value: string) => void;
  onDownloadStartYearChange: (value: string) => void;
  onDownloadEndYearChange: (value: string) => void;
  onDownloadDatasetNameChange: (value: string) => void;
  onDownloadApiKeyChange: (value: string) => void;
  onStartDownload: () => void;
  onRunCorrelation: () => void;
  onRunCompare: () => void;
  onRunPrediction: () => void;
}

export function MCPWorkspace({
  datasets,
  siteDatasetId,
  refDatasetId,
  siteDetail,
  refDetail,
  siteColumnId,
  refColumnId,
  extraSiteColumnIds,
  extraRefColumnIds,
  method,
  correlationData,
  comparisonData,
  predictionData,
  downloadSource,
  downloadLatitude,
  downloadLongitude,
  downloadStartYear,
  downloadEndYear,
  downloadDatasetName,
  downloadApiKey,
  downloadStatus,
  downloadError,
  isDownloading,
  pageError,
  correlationError,
  predictionError,
  isLoadingDatasets,
  isLoadingDetails,
  isCorrelating,
  isComparing,
  isPredicting,
  onSiteDatasetChange,
  onRefDatasetChange,
  onSiteColumnChange,
  onRefColumnChange,
  onExtraSiteColumnsChange,
  onExtraRefColumnsChange,
  onMethodChange,
  onDownloadSourceChange,
  onDownloadLatitudeChange,
  onDownloadLongitudeChange,
  onDownloadStartYearChange,
  onDownloadEndYearChange,
  onDownloadDatasetNameChange,
  onDownloadApiKeyChange,
  onStartDownload,
  onRunCorrelation,
  onRunCompare,
  onRunPrediction,
}: MCPWorkspaceProps) {
  const isReady = Boolean(siteDatasetId && refDatasetId && siteDatasetId !== refDatasetId && siteColumnId && refColumnId);

  return (
    <div className="space-y-6">
      <section className="panel-surface overflow-hidden px-6 py-8 sm:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)] xl:items-end">
          <div>
            <h1 className="mt-3 max-w-4xl text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">
              MCP: correlate site data with reference, compare methods, and predict long-term wind.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">
              Choose datasets, run correlation and comparison, then produce long-term predictions.
            </p>
          </div>

          <div className="panel-muted p-3 text-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-ink-800">
              <Sparkles className="h-4 w-4 text-teal-500" />
              Status
            </div>
            <div className="mt-3 space-y-2 text-xs text-ink-700">
              <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                <span>Correlation</span>
                <span className={correlationData ? "text-emerald-700" : "text-ink-500"}>{correlationData ? "Done" : "Pending"}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                <span>Comparison</span>
                <span className={comparisonData ? "text-emerald-700" : "text-ink-500"}>{comparisonData ? comparisonData.recommended_method.replace("_", " ") : "Pending"}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                <span>Prediction</span>
                <span className={predictionData ? "text-emerald-700" : "text-ink-500"}>{predictionData ? predictionData.method.replace("_", " ") : "Pending"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {pageError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{pageError}</div> : null}

      {isLoadingDatasets || isLoadingDetails ? (
        <section className="panel-surface p-6">
          <LoadingSpinner label="Loading MCP datasets" />
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <ReferenceDataSelector
          datasets={datasets}
          siteDatasetId={siteDatasetId}
          refDatasetId={refDatasetId}
          siteDetail={siteDetail}
          refDetail={refDetail}
          siteColumnId={siteColumnId}
          refColumnId={refColumnId}
          extraSiteColumnIds={extraSiteColumnIds}
          extraRefColumnIds={extraRefColumnIds}
          method={method}
          correlationData={correlationData}
          downloadSource={downloadSource}
          downloadLatitude={downloadLatitude}
          downloadLongitude={downloadLongitude}
          downloadStartYear={downloadStartYear}
          downloadEndYear={downloadEndYear}
          downloadDatasetName={downloadDatasetName}
          downloadApiKey={downloadApiKey}
          downloadStatus={downloadStatus}
          downloadError={downloadError}
          isDownloading={isDownloading}
          onSiteDatasetChange={onSiteDatasetChange}
          onRefDatasetChange={onRefDatasetChange}
          onSiteColumnChange={onSiteColumnChange}
          onRefColumnChange={onRefColumnChange}
          onExtraSiteColumnsChange={onExtraSiteColumnsChange}
          onExtraRefColumnsChange={onExtraRefColumnsChange}
          onMethodChange={onMethodChange}
          onDownloadSourceChange={onDownloadSourceChange}
          onDownloadLatitudeChange={onDownloadLatitudeChange}
          onDownloadLongitudeChange={onDownloadLongitudeChange}
          onDownloadStartYearChange={onDownloadStartYearChange}
          onDownloadEndYearChange={onDownloadEndYearChange}
          onDownloadDatasetNameChange={onDownloadDatasetNameChange}
          onDownloadApiKeyChange={onDownloadApiKeyChange}
          onStartDownload={onStartDownload}
        />

        <section className="panel-surface p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
            <Bot className="h-4 w-4 text-ember-500" />
            Execute workflow
          </div>
          <p className="mt-3 text-sm leading-7 text-ink-600">Correlation inspects the concurrent period, comparison ranks uncertainty across methods, and prediction expands the selected method to the full reference series.</p>

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={onRunCorrelation}
              disabled={!isReady || isCorrelating}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-300"
            >
              <ArrowRightLeft className="h-4 w-4" />
              {isCorrelating ? "Running correlation..." : "Run correlation"}
            </button>
            <button
              type="button"
              onClick={onRunCompare}
              disabled={!isReady || isComparing}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-ink-200 px-5 py-3 text-sm font-medium text-ink-800 transition hover:border-ink-400 hover:text-ink-900 disabled:cursor-not-allowed disabled:border-ink-100 disabled:text-ink-400"
            >
              {isComparing ? "Comparing methods..." : "Compare all methods"}
            </button>
            <button
              type="button"
              onClick={onRunPrediction}
              disabled={!isReady || isPredicting}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ember-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-ember-400 disabled:cursor-not-allowed disabled:bg-ember-200"
            >
              {isPredicting ? `Running ${method.replace("_", " ")}...` : `Predict with ${method.replace("_", " ")}`}
            </button>
          </div>

          <div className="mt-6 space-y-3 text-sm text-ink-600">
            <div className="rounded-2xl bg-ink-50/80 px-4 py-3">
              <span className="font-medium text-ink-800">Site channels:</span> {1 + extraSiteColumnIds.length}
            </div>
            <div className="rounded-2xl bg-ink-50/80 px-4 py-3">
              <span className="font-medium text-ink-800">Reference predictors:</span> {1 + extraRefColumnIds.length}
            </div>
            {method === "matrix" ? <div className="rounded-2xl bg-teal-50 px-4 py-3 text-teal-900">Matrix MCP will fit one regression per selected site sensor using all selected reference predictors.</div> : null}
            {predictionError && !comparisonData ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">{predictionError}</div> : null}
          </div>
        </section>
      </div>

      <CorrelationChart data={correlationData} isLoading={isCorrelating} error={correlationError} />

      <LTAResultsTable
        comparison={comparisonData}
        prediction={predictionData}
        correlation={correlationData}
        siteDetail={siteDetail}
        isLoading={isComparing || isPredicting}
        error={predictionError}
      />
    </div>
  );
}