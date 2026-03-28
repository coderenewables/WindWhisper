import axios, { type AxiosResponse } from "axios";

import type { ReportDownload, ReportGenerateRequest } from "../types/report";


function parseFileName(response: AxiosResponse<Blob>) {
  const header = response.headers["content-disposition"];
  if (!header) {
    return "windwhisper-report.dat";
  }

  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? "windwhisper-report.dat";
}


async function extractBlobError(response: AxiosResponse<Blob>) {
  try {
    const text = await response.data.text();
    const payload = JSON.parse(text) as { detail?: string };
    return payload.detail ?? text;
  } catch {
    return `Report generation failed with status ${response.status}`;
  }
}


export async function downloadProjectReport(projectId: string, payload: ReportGenerateRequest): Promise<ReportDownload> {
  const response = await axios.post<Blob>(`/reports/generate/${projectId}`, payload, {
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
