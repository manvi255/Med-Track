import { Dose } from "../models/Dose.js";
import { Medicine } from "../models/Medicine.js";
import { Notification } from "../models/Notification.js";
import { Schedule } from "../models/Schedule.js";
import { ApiError } from "../utils/ApiError.js";

function scheduleNotFound() {
  return new ApiError(404, "Schedule not found");
}

function validationError(error) {
  if (error?.name === "ValidationError") {
    const message = Object.values(error.errors).map(({ message }) => message).join("; ");
    return new ApiError(400, message);
  }
  return error;
}

async function assertOwnedMedicine(userId, medicineId) {
  const medicine = await Medicine.findOne({ _id: medicineId, user: userId });
  if (!medicine) {
    throw new ApiError(404, "Medicine not found");
  }
}

export async function createSchedule(userId, scheduleData) {
  await assertOwnedMedicine(userId, scheduleData.medicine);
  const schedule = new Schedule({ ...scheduleData, user: userId });
  try {
    return await schedule.save();
  } catch (error) {
    throw validationError(error);
  }
}

export function listSchedules(userId, filters = {}) {
  const query = { user: userId };
  if (filters.medicine) query.medicine = filters.medicine;
  if (filters.isActive !== undefined) query.isActive = filters.isActive === "true";
  return Schedule.find(query).sort({ createdAt: -1 });
}

export async function getOwnedSchedule(userId, scheduleId) {
  const schedule = await Schedule.findOne({ _id: scheduleId, user: userId });
  if (!schedule) throw scheduleNotFound();
  return schedule;
}

export async function updateSchedule(userId, scheduleId, scheduleData) {
  const schedule = await getOwnedSchedule(userId, scheduleId);
  if (scheduleData.medicine) {
    await assertOwnedMedicine(userId, scheduleData.medicine);
  }

  const updates = { ...scheduleData };
  if (updates.reminders) {
    updates.reminders = {
      ...(schedule.reminders?.toObject?.() ?? schedule.reminders ?? {}),
      ...updates.reminders
    };
  }
  Object.assign(schedule, updates);
  try {
    await schedule.validate();
  } catch (error) {
    throw validationError(error);
  }

  try {
    const savedSchedule = await schedule.save();
    const futureDoseFilter = {
      user: userId,
      schedule: scheduleId,
      status: "upcoming",
      scheduledFor: { $gt: new Date() }
    };
    const futureDoses = await Dose.find(futureDoseFilter);
    if (futureDoses.length) {
      await Notification.deleteMany({
        user: userId,
        relatedDose: { $in: futureDoses.map(({ _id }) => _id) }
      });
    }
    await Dose.deleteMany(futureDoseFilter);
    return savedSchedule;
  } catch (error) {
    throw validationError(error);
  }
}

export async function deleteSchedule(userId, scheduleId) {
  const schedule = await getOwnedSchedule(userId, scheduleId);
  await Schedule.deleteOne({ _id: schedule._id, user: userId });
  const futureDoseFilter = {
    user: userId,
    schedule: scheduleId,
    status: "upcoming",
    scheduledFor: { $gt: new Date() }
  };
  const futureDoses = await Dose.find(futureDoseFilter);
  if (futureDoses.length) {
    await Notification.deleteMany({
      user: userId,
      relatedDose: { $in: futureDoses.map(({ _id }) => _id) }
    });
  }
  await Dose.deleteMany(futureDoseFilter);
}
