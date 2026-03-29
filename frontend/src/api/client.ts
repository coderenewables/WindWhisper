import axios from "axios";

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const normalizedApiBaseUrl = rawApiBaseUrl && rawApiBaseUrl.length > 0
  ? rawApiBaseUrl.replace(/\/$/, "")
  : "/api";

export const apiClient = axios.create({
  baseURL: normalizedApiBaseUrl,
  timeout: 15000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error.response?.data?.detail;
    const message = typeof detail === "string" ? detail : error.message || "Unexpected API error";
    return Promise.reject(new Error(message));
  },
);