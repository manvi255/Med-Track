import { apiClient } from "./client.js";

export async function listMedicines() {
  const { data } = await apiClient.get("/medicines");
  return data.medicines;
}

export async function createMedicine(payload) {
  const { data } = await apiClient.post("/medicines", payload);
  return data.medicine;
}

export async function updateMedicine(id, payload) {
  const { data } = await apiClient.patch(`/medicines/${id}`, payload);
  return data.medicine;
}

export async function deleteMedicine(id) {
  await apiClient.delete(`/medicines/${id}`);
}

export async function listSchedules(filters = {}) {
  const { data } = await apiClient.get("/schedules", { params: filters });
  return data.schedules;
}

export async function createSchedule(payload) {
  const { data } = await apiClient.post("/schedules", payload);
  return data.schedule;
}

export async function updateSchedule(id, payload) {
  const { data } = await apiClient.patch(`/schedules/${id}`, payload);
  return data.schedule;
}

export async function deleteSchedule(id) {
  await apiClient.delete(`/schedules/${id}`);
}

export async function listTodayDoses() {
  const { data } = await apiClient.get("/doses/today");
  return data.doses;
}

export async function listDoseHistory(startDate, endDate) {
  const { data } = await apiClient.get("/doses", { params: { startDate, endDate } });
  return data.doses;
}

export async function updateDoseStatus(id, payload) {
  const { data } = await apiClient.patch(`/doses/${id}/status`, payload);
  return data.dose;
}

export async function listPrescriptions() {
  const { data } = await apiClient.get("/prescriptions");
  return data.prescriptions;
}

export async function getPrescription(id) {
  const { data } = await apiClient.get(`/prescriptions/${id}`);
  return data.prescription;
}

export async function uploadPrescription(file) {
  const body = new FormData();
  body.append("file", file);
  const { data } = await apiClient.post("/prescriptions/upload", body);
  return data.prescription;
}

export async function confirmPrescription(id, medicines) {
  const { data } = await apiClient.post(`/prescriptions/${id}/confirm`, { medicines });
  return data;
}

export async function deletePrescription(id) {
  await apiClient.delete(`/prescriptions/${id}`);
}

export async function listAppointments(params = {}) {
  const { data } = await apiClient.get("/appointments", { params });
  return data;
}

export async function createAppointment(payload) {
  const { data } = await apiClient.post("/appointments", payload);
  return data.appointment;
}

export async function updateAppointment(id, payload) {
  const { data } = await apiClient.patch(`/appointments/${id}`, payload);
  return data.appointment;
}

export async function deleteAppointment(id) {
  await apiClient.delete(`/appointments/${id}`);
}

export async function listNotifications(params = {}) {
  const { data } = await apiClient.get("/notifications", { params });
  return data;
}

export async function getUnreadNotificationCount() {
  const { data } = await apiClient.get("/notifications/unread-count");
  return data.unreadCount;
}

export async function markNotificationRead(id) {
  const { data } = await apiClient.patch(`/notifications/${id}/read`);
  return data.notification;
}

export async function markAllNotificationsRead() {
  const { data } = await apiClient.patch("/notifications/read-all");
  return data.modifiedCount;
}

export async function deleteNotification(id) {
  await apiClient.delete(`/notifications/${id}`);
}

export async function getPushPublicKey() {
  const { data } = await apiClient.get("/push/public-key");
  return data.publicKey;
}

export async function registerPushSubscription(subscription) {
  await apiClient.post("/push/subscribe", subscription);
}

export async function deletePushSubscription(endpoint) {
  await apiClient.delete("/push/subscribe", { data: { endpoint } });
}

export async function getDashboardSummary() {
  const { data } = await apiClient.get("/dashboard/summary");
  return data.summary;
}

export async function getDashboardAdherence(period = "7d") {
  const { data } = await apiClient.get("/dashboard/adherence", { params: { period } });
  return data;
}

export async function getDashboardUpcoming(limit = 50) {
  const { data } = await apiClient.get("/dashboard/upcoming", { params: { limit } });
  return data;
}
