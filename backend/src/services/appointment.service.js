import { Appointment } from "../models/Appointment.js";
import { Notification } from "../models/Notification.js";
import { ApiError } from "../utils/ApiError.js";

const reminderNotificationFilter = (userId, appointmentId) => ({
  user: userId,
  relatedAppointment: appointmentId,
  type: "appointment_reminder"
});

function notFound() {
  return new ApiError(404, "Appointment not found");
}

export async function createAppointment(userId, appointmentData) {
  const reminders = appointmentData.reminders ?? {};
  const appointment = new Appointment({
    ...appointmentData,
    reminders: {
      enabled: reminders.enabled ?? true,
      ...(reminders.leadHours ? { leadHours: reminders.leadHours } : {})
    },
    user: userId
  });
  return appointment.save();
}

export async function listAppointments(userId, {
  status,
  period,
  page = 1,
  limit = 20
}, now = new Date()) {
  const filter = {
    user: userId,
    ...(status ? { status } : {}),
    ...(period === "upcoming" ? { scheduledAt: { $gte: now } } : {}),
    ...(period === "past" ? { scheduledAt: { $lt: now } } : {})
  };

  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .sort({ scheduledAt: period === "past" ? -1 : 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Appointment.countDocuments(filter)
  ]);
  return {
    appointments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}

export async function getAppointment(userId, appointmentId) {
  const appointment = await Appointment.findOne({ _id: appointmentId, user: userId });
  if (!appointment) throw notFound();
  return appointment;
}

async function clearAppointmentReminders(userId, appointmentId) {
  await Notification.deleteMany(reminderNotificationFilter(userId, appointmentId));
}

export async function updateAppointment(userId, appointmentId, appointmentData) {
  const appointment = await Appointment.findOne({ _id: appointmentId, user: userId });
  if (!appointment) throw notFound();

  const remindersChanged = appointmentData.scheduledAt !== undefined
    || appointmentData.status !== undefined
    || appointmentData.reminders !== undefined;
  const updates = { ...appointmentData };
  if (updates.reminders) {
    updates.reminders = {
      ...(appointment.reminders.toObject?.() ?? appointment.reminders),
      ...updates.reminders
    };
  }
  Object.assign(appointment, updates);
  await appointment.save();

  if (remindersChanged && (appointment.status !== "scheduled" || !appointment.reminders.enabled
    || appointmentData.scheduledAt !== undefined || appointmentData.reminders !== undefined)) {
    await clearAppointmentReminders(userId, appointmentId);
  }
  return appointment;
}

export async function deleteAppointment(userId, appointmentId) {
  const appointment = await Appointment.findOneAndDelete({ _id: appointmentId, user: userId });
  if (!appointment) throw notFound();
  await clearAppointmentReminders(userId, appointmentId);
}
