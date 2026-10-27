import { apiClient } from "./client.js";

export async function getCurrentUser() {
  const { data } = await apiClient.get("/auth/me");
  return data.user;
}

export async function login(credentials) {
  const { data } = await apiClient.post("/auth/login", credentials);
  return data.user;
}

export async function register(details) {
  const { data } = await apiClient.post("/auth/register", details);
  return data.user;
}

export async function logout() {
  const { data } = await apiClient.post("/auth/logout");
  return data;
}
