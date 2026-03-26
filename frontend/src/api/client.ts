import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/api",
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