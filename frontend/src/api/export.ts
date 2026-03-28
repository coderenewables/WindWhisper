import axios, { type AxiosResponse } from "axios";

import type { CSVExportRequest, ExportDownload, IEAJSONExportRequest, KMLExportRequest, OpenwindExportRequest, WAsPTabExportRequest } from "../types/export";


function parseFileName(response: AxiosResponse<Blob>) {
  const header = response.headers["content-disposition"];
  if (!header) {
    return "gokaatru-export.dat";
  }

  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? "gokaatru-export.dat";
}


async function extractBlobError(response: AxiosResponse<Blob>) {
  try {
    const text = await response.data.text();
    const payload = JSON.parse(text) as { detail?: string };
    return payload.detail ?? text;
  } catch {
    return `Export failed with status ${response.status}`;
  }
}


async function postExportBlob<TPayload>(path: string, payload: TPayload): Promise<ExportDownload> {
  const response = await axios.post<Blob>(path, payload, {
    baseURL: "/api",
    responseType: "blob",
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    throw new Error(await extractBlobError(response));
  }

  return {
    blob: response.data,
    fileName: parseFileName(response),
    contentType: response.headers["content-type"] ?? response.data.type,
  };
}


export async function downloadCsvExport(datasetId: string, payload: CSVExportRequest): Promise<ExportDownload> {
  return postExportBlob(`/export/csv/${datasetId}`, payload);
}


export async function downloadWaspTabExport(datasetId: string, payload: WAsPTabExportRequest): Promise<ExportDownload> {
  return postExportBlob(`/export/wasp-tab/${datasetId}`, payload);
}


export async function downloadIeaJsonExport(datasetId: string, payload: IEAJSONExportRequest): Promise<ExportDownload> {
  return postExportBlob(`/export/iea-json/${datasetId}`, payload);
}


export async function downloadOpenwindExport(datasetId: string, payload: OpenwindExportRequest): Promise<ExportDownload> {
  return postExportBlob(`/export/openwind/${datasetId}`, payload);
}


export async function downloadProjectKmlExport(payload: KMLExportRequest): Promise<ExportDownload> {
  return postExportBlob("/export/kml", payload);
}