import { env } from "../config/env.js";
import { Appointment } from "../models/Appointment.js";
import { Notification } from "../models/Notification.js";
import { deliverNotificationPush } from "./notification.service.js";
import { hasVapidConfiguration } from "./push.service.js";

const DEFAULT_BATCH_SIZE = 500;
const MAX_LEAD_HOURS = 720;

function formatAppointmentTime(scheduledAt, timezone) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone
  }).format(scheduledAt);
}

function appointmentReminderKey(appointment, leadHours) {
  return `appointment_reminder:${appointment._id.toString()}:${new Date(appointment.scheduledAt).getTime()}:${leadHours}`;
}

async function createAppointmentReminder(appointment, leadHours, now) {
  const idempotencyKey = appointmentReminderKey(appointment, leadHours);
  const message = `You have an appointment scheduled for ${formatAppointmentTime(
    appointment.scheduledAt,
    appointment.timezone
  )} (${appointment.timezone}).`;
  let inserted = false;
  try {
    const result = await Notification.updateOne({
      idempotencyKey
    }, {
      $setOnInsert: {
        user: appointment.user,
        type: "appointment_reminder",
        title: "Appointment reminder",
        message,
        relatedAppointment: appointment._id,
        scheduledFor: appointment.scheduledAt,
        idempotencyKey,
        pushDeliveryStatus: hasVapidConfiguration() ? "pending" : "unavailable"
      }
    }, { upsert: true });
    inserted = result.upsertedCount > 0;
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  if (!inserted) return false;
  const notification = await Notification.findOne({
    user: appointment.user,
    idempotencyKey
  });
  if (!notification) return false;
  const stillScheduled = await Appointment.exists({
    _id: appointment._id,
    user: appointment.user,
    status: "scheduled",
    scheduledAt: appointment.scheduledAt,
    "reminders.enabled": true
  });
  if (!stillScheduled) {
    await Notification.deleteOne({
      user: appointment.user,
      idempotencyKey,
      type: "appointment_reminder"
    });
    return false;
  }
  await deliverNotificationPush(notification, now);
  return true;
}

export async function createDueAppointmentReminders({
  now = new Date(),
  defaultLeadHours = env.APPOINTMENT_REMINDER_LEAD_HOURS,
  batchSize = DEFAULT_BATCH_SIZE
} = {}) {
  const fallbackLeadHours = [...new Set(defaultLeadHours)];
  if (!fallbackLeadHours.length || fallbackLeadHours.some((hours) => (
    !Number.isInteger(hours) || hours < 1 || hours > MAX_LEAD_HOURS
  ))) {
    throw new RangeError("Appointment reminder lead times must be whole hours from 1 to 720");
  }
  const appointmentFilter = {
    status: "scheduled",
    "reminders.enabled": true,
    scheduledAt: {
      $gte: now,
      $lte: new Date(now.getTime() + MAX_LEAD_HOURS * 60 * 60 * 1000)
    }
  };
  let created = 0;
  for (let offset = 0; ; offset += batchSize) {
    const appointments = await Appointment.find(appointmentFilter)
      .select("user scheduledAt timezone status reminders")
      .sort({ scheduledAt: 1, _id: 1 })
      .skip(offset)
      .limit(batchSize);
    if (!appointments.length) break;

    for (const appointment of appointments) {
      const configuredLeadHours = appointment.reminders?.leadHours ?? fallbackLeadHours;
      const leadHours = [...new Set(configuredLeadHours)];
      if (!leadHours.length || leadHours.some((hours) => (
        !Number.isInteger(hours) || hours < 1 || hours > MAX_LEAD_HOURS
      ))) {
        throw new RangeError("Appointment reminder lead times must be whole hours from 1 to 720");
      }
      for (const leadHour of leadHours) {
        const target = new Date(appointment.scheduledAt).getTime() - leadHour * 60 * 60 * 1000;
        if (target > now.getTime() || appointment.scheduledAt <= now) continue;
        const current = await Appointment.exists({
          _id: appointment._id,
          user: appointment.user,
          status: "scheduled",
          scheduledAt: appointment.scheduledAt,
          "reminders.enabled": true
        });
        if (!current) continue;
        if (await createAppointmentReminder(appointment, leadHour, now)) created += 1;
      }
    }
    if (appointments.length < batchSize) break;
  }
  return created;
}
