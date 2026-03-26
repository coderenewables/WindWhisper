import { useEffect, useMemo, useState } from "react";

import { getDatasetTimeseries } from "../api/datasets";
import type { TimeSeriesResponse } from "../types/dataset";

interface UseTimeSeriesOptions {
  datasetId: string | null;
  columnIds: string[];
  resample: string | null;
  fullStart: string | null;
  fullEnd: string | null;
}

interface TimeRange {
  start: string | null;
  end: string | null;
}

export function useTimeSeries({ datasetId, columnIds, resample, fullStart, fullEnd }: UseTimeSeriesOptions) {
  const [data, setData] = useState<TimeSeriesResponse | null>(null);
  const [visibleRange, setVisibleRange] = useState<TimeRange>({ start: fullStart, end: fullEnd });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columnKey = useMemo(() => columnIds.join(","), [columnIds]);

  useEffect(() => {
    setVisibleRange({ start: fullStart, end: fullEnd });
  }, [datasetId, fullEnd, fullStart]);

  useEffect(() => {
    if (!datasetId || columnIds.length === 0) {
      setData(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void getDatasetTimeseries(datasetId, {
        start: visibleRange.start,
        end: visibleRange.end,
        columns: columnIds,
        resample,
      })
        .then((response) => {
          if (!cancelled) {
            setData(response);
            setIsLoading(false);
          }
        })
        .catch((requestError: unknown) => {
          if (!cancelled) {
            setError(requestError instanceof Error ? requestError.message : "Unable to load time-series data");
            setIsLoading(false);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [columnIds, columnKey, datasetId, resample, visibleRange.end, visibleRange.start]);

  return {
    data,
    visibleRange,
    setVisibleRange,
    isLoading,
    error,
  };
}
