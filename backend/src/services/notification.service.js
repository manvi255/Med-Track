import { Dose } from "../models/Dose.js";
import { Medicine } from "../models/Medicine.js";
import { Notification } from "../models/Notification.js";
import { Schedule } from "../models/Schedule.js";
import { ApiError } from "../utils/ApiError.js";
import {
  dateOnlyString,
  getLocalDateParts,
  getLocalWeekday
} from "../utils/scheduleTime.js";
import {
  hasVapidConfiguration,
  MAX_PUSH_ATTEMPTS,
  sendMinimalPushToUser
} from "./push.service.js";

const PUSH_LEASE_MS = 60 * 1000;
const MAX_PUSH_RETRY_AGE_MS = 24 * 60 * 60 * 1000;
const PUSH_RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_RETRY_BATCH_SIZE = 100;

export function serializeNotification(notification) {
  const relatedDose = notification.relatedDose?._id ? notification.relatedDose : null;
  const doseUserMatches = relatedDose
    && String(relatedDose.user) === String(notification.user?._id ?? notification.user);
  const medicine = relatedDose?.medicine?._id ? relatedDose.medicine : null;
  const medicineUserMatches = medicine
    && String(medicine.user) === String(notification.user?._id ?? notification.user);
  return {
    id: notification.id ?? notification._id.toString(),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    ...(notification.readAt ? { readAt: notification.readAt } : {}),
    ...(notification.relatedDose
      ? { relatedDose: (relatedDose?._id ?? notification.relatedDose).toString() }
      : {}),
    ...(doseUserMatches ? {
      dose: {
        status: relatedDose.status,
        scheduledFor: relatedDose.scheduledFor,
        timezone: relatedDose.timezone,
        ...(medicineUserMatches ? { medicineName: medicine.name } : {})
      }
    } : {}),
    ...(notification.relatedAppointment
      ? { relatedAppointment: notification.relatedAppointment.toString() }
      : {}),
    ...(notification.scheduledFor ? { scheduledFor: notification.scheduledFor } : {}),
    pushDeliveryStatus: notification.pushDeliveryStatus,
    createdAt: notification.createdAt
  };
}

export async function listNotifications(userId, { page = 1, limit = 20 }) {
  const filter = { user: userId };
  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .populate({
        path: "relatedDose",
        select: "status medicine scheduledFor timezone user",
        populate: { path: "medicine", select: "name user" }
      })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter)
  ]);
  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export function countUnreadNotifications(userId) {
  return Notification.countDocuments({
    user: userId,
    $or: [{ readAt: { $exists: false } }, { readAt: null }]
  });
}

export async function markNotificationRead(userId, notificationId, now = new Date()) {
  const updated = await Notification.findOneAndUpdate({
    _id: notificationId,
    user: userId,
    $or: [{ readAt: { $exists: false } }, { readAt: null }]
  }, {
    $set: { readAt: now }
  }, { new: true });

  if (updated) return updated;
  const existing = await Notification.findOne({ _id: notificationId, user: userId });
  if (!existing) throw new ApiError(404, "Notification not found");
  return existing;
}

export async function markAllNotificationsRead(userId, now = new Date()) {
  const result = await Notification.updateMany({
    user: userId,
    $or: [{ readAt: { $exists: false } }, { readAt: null }]
  }, {
    $set: { readAt: now }
  });
  return result.modifiedCount;
}

export async function deleteNotification(userId, notificationId) {
  const result = await Notification.deleteOne({ _id: notificationId, user: userId });
  if (!result.deletedCount) throw new ApiError(404, "Notification not found");
}

function isDoseStillEligible(dose, schedule, medicine) {
  if (!schedule || !medicine || !schedule.isActive || !medicine.isActive) return false;
  if (schedule.reminders?.enabled === false) return false;
  if (String(schedule.user) !== String(dose.user)
    || String(schedule.medicine) !== String(dose.medicine)
    || String(medicine.user) !== String(dose.user)
    || String(dose.timezone) !== String(schedule.timezone)) return false;

  const localDate = dose.localDate;
  if (localDate < dateOnlyString(schedule.startDate)
    || (schedule.endDate && localDate > dateOnlyString(schedule.endDate))
    || localDate < dateOnlyString(medicine.startDate)
    || (medicine.endDate && localDate > dateOnlyString(medicine.endDate))) return false;

  if (schedule.frequency === "selected_days"
    && !schedule.daysOfWeek.includes(getLocalWeekday(localDate))) return false;

  const localParts = getLocalDateParts(dose.scheduledFor, schedule.timezone);
  const localTime = `${String(localParts.hour).padStart(2, "0")}:${String(localParts.minute).padStart(2, "0")}`;
  return schedule.times.includes(localTime);
}

function doseReminderKey(doseId) {
  return `dose_reminder:${doseId.toString()}`;
}

async function createDoseReminder(dose, medicine, now) {
  const key = doseReminderKey(dose._id);
  const localTime = new Intl.DateTimeFormat("en", {
    timeStyle: "short",
    timeZone: dose.timezone
  }).format(dose.scheduledFor);
  let inserted = false;
  const notificationData = {
    user: dose.user,
    type: "dose_reminder",
    title: "Dose reminder",
    message: `${medicine.name} is scheduled for ${localTime} (${dose.timezone}).`,
    relatedDose: dose._id,
    scheduledFor: dose.scheduledFor,
    idempotencyKey: key,
    pushDeliveryStatus: hasVapidConfiguration() ? "pending" : "unavailable"
  };
  try {
    const result = await Notification.updateOne(
      { idempotencyKey: key },
      { $setOnInsert: notificationData },
      { upsert: true }
    );
    inserted = result.upsertedCount > 0;
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  if (!inserted) return false;
  const notification = await Notification.findOne({
    idempotencyKey: key,
    user: dose.user
  });
  if (!notification) return false;
  await deliverNotificationPush(notification, now);
  return true;
}

export async function deliverNotificationPush(notification, now = new Date()) {
  if (!hasVapidConfiguration()) {
    await Notification.updateOne({
      _id: notification._id,
      user: notification.user,
      pushDeliveryStatus: { $in: ["pending", "failed"] }
    }, {
      $set: { pushDeliveryStatus: "unavailable" },
      $unset: { pushLeaseUntil: 1 }
    });
    return "unavailable";
  }

  const claimed = await Notification.findOneAndUpdate({
    _id: notification._id,
    user: notification.user,
    pushAttemptCount: { $lt: MAX_PUSH_ATTEMPTS },
    $or: [
      { pushDeliveryStatus: { $in: ["pending", "failed"] } },
      {
        pushDeliveryStatus: "sending",
        pushLeaseUntil: { $lte: now }
      }
    ]
  }, {
    $set: {
      pushDeliveryStatus: "sending",
      pushLastAttemptAt: now,
      pushLeaseUntil: new Date(now.getTime() + PUSH_LEASE_MS)
    },
    $inc: { pushAttemptCount: 1 }
  }, { new: true });

  if (!claimed) return notification.pushDeliveryStatus;
  let outcome;
  try {
    outcome = await sendMinimalPushToUser(claimed.user, {
      title: claimed.title,
      body: claimed.message
    });
  } catch {
    outcome = { status: "failed" };
  }
  await Notification.updateOne({
    _id: claimed._id,
    user: claimed.user,
    pushDeliveryStatus: "sending"
  }, {
    $set: { pushDeliveryStatus: outcome.status },
    $unset: { pushLeaseUntil: 1 }
  });
  return outcome.status;
}

export async function retryPendingPushDeliveries(now = new Date()) {
  const retryCutoff = new Date(now.getTime() - MAX_PUSH_RETRY_AGE_MS);
  await Notification.updateMany({
    createdAt: { $lt: retryCutoff },
    $or: [
      { pushDeliveryStatus: { $in: ["pending", "failed"] } },
      {
        pushDeliveryStatus: "sending",
        $or: [
          { pushLeaseUntil: { $lte: now } },
          { pushLeaseUntil: { $exists: false } }
        ]
      }
    ]
  }, {
    $set: { pushDeliveryStatus: "failed" },
    $unset: { pushLeaseUntil: 1 }
  });
  await Notification.updateMany({
    pushDeliveryStatus: "sending",
    pushAttemptCount: { $gte: MAX_PUSH_ATTEMPTS },
    $or: [
      { pushLeaseUntil: { $lte: now } },
      { pushLeaseUntil: { $exists: false } }
    ]
  }, {
    $set: { pushDeliveryStatus: "failed" },
    $unset: { pushLeaseUntil: 1 }
  });

  const notifications = await Notification.find({
    pushDeliveryStatus: { $in: ["pending", "failed", "sending"] },
    pushAttemptCount: { $lt: MAX_PUSH_ATTEMPTS },
    createdAt: { $gte: retryCutoff },
    $or: [
      {
        pushDeliveryStatus: "pending",
        createdAt: { $lte: new Date(now.getTime() - PUSH_RETRY_DELAY_MS) }
      },
      {
        pushDeliveryStatus: "failed",
        pushLastAttemptAt: { $lte: new Date(now.getTime() - PUSH_RETRY_DELAY_MS) }
      },
      { pushLeaseUntil: { $lte: now } }
    ]
  }).sort({ createdAt: 1 }).limit(MAX_RETRY_BATCH_SIZE);
  for (const notification of notifications) {
    await deliverNotificationPush(notification, now);
  }
  return notifications.length;
}

export async function createDueDoseReminders({
  now = new Date(),
  leadMinutes = 15,
  batchSize = 500
} = {}) {
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const doseFilter = {
    status: "upcoming",
    scheduledFor: { $gte: now, $lt: until }
  };
  let created = 0;
  for (let offset = 0; ; offset += batchSize) {
    const doses = await Dose.find(doseFilter)
      .select("user medicine schedule scheduledFor localDate timezone status")
      .sort({ scheduledFor: 1, _id: 1 })
      .skip(offset)
      .limit(batchSize);
    if (!doses.length) break;

    const scheduleIds = [...new Set(doses.map((dose) => dose.schedule.toString()))];
    const medicineIds = [...new Set(doses.map((dose) => dose.medicine.toString()))];
    const [schedules, medicines] = await Promise.all([
      Schedule.find({ _id: { $in: scheduleIds }, isActive: true })
        .select("user medicine isActive startDate endDate frequency daysOfWeek times timezone reminders"),
      Medicine.find({ _id: { $in: medicineIds }, isActive: true })
        .select("user name isActive startDate endDate")
    ]);
    const scheduleById = new Map(schedules.map((schedule) => [schedule._id.toString(), schedule]));
    const medicineById = new Map(medicines.map((medicine) => [medicine._id.toString(), medicine]));

    for (const dose of doses) {
      const schedule = scheduleById.get(dose.schedule.toString());
      const medicine = medicineById.get(dose.medicine.toString());
      if (!isDoseStillEligible(dose, schedule, medicine)) continue;
      const configuredLeadMinutes = schedule.reminders?.leadMinutes ?? leadMinutes;
      if (!Number.isInteger(configuredLeadMinutes)
        || configuredLeadMinutes < 1
        || configuredLeadMinutes > 1440
        || dose.scheduledFor.getTime() - configuredLeadMinutes * 60 * 1000 > now.getTime()) continue;
      const stillUpcoming = await Dose.exists({
        _id: dose._id,
        user: dose.user,
        status: "upcoming",
        scheduledFor: dose.scheduledFor
      });
      if (!stillUpcoming) continue;
      if (await createDoseReminder(dose, medicine, now)) created += 1;
    }
    if (doses.length < batchSize) break;
  }
  return created;
}
