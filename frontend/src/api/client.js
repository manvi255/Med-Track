import axios from "axios";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const configuredApiRoot = (configuredBaseUrl || "http://localhost:5000").replace(/\/+$/, "");
const apiBaseUrl = configuredApiRoot.endsWith("/api/v1")
  ? configuredApiRoot
  : `${configuredApiRoot}/api/v1`;

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: {
    Accept: "application/json"
  }
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error?.message
      ?? error.response?.data?.message
      ?? error.message
      ?? "Unable to reach the MediTrack API.";

    return Promise.reject(Object.assign(new Error(message), {
      status: error.response?.status,
      cause: error
    }));
  }
);

export function getApiErrorMessage(error) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
