import { Dose } from "../models/Dose.js";
import { Schedule } from "../models/Schedule.js";
import { ApiError } from "../utils/ApiError.js";
import { localDateString } from "../utils/scheduleTime.js";
import { generateDoseOccurrences } from "./doseGeneration.service.js";

function doseNotFound() {
  return new ApiError(404, "Dose not found");
}

function toDoseFilter(userId, startDate, endDate) {
  return { user: userId, localDate: { $gte: startDate, $lte: endDate } };
}

export async function listTodayDoses(userId, now = new Date()) {
  await Dose.updateMany({
    user: userId,
    status: "upcoming",
    scheduledFor: { $lt: now }
  }, {
    $set: { status: "missed" }
  });
  const schedules = await Schedule.find({ user: userId, isActive: true });
  const dateBySchedule = new Map(
    schedules.map((schedule) => [schedule._id.toString(), localDateString(now, schedule.timezone)])
  );
  const dateGroups = new Map();
  for (const dateString of dateBySchedule.values()) {
    if (!dateGroups.has(dateString)) dateGroups.set(dateString, []);
    dateGroups.get(dateString).push(dateString);
  }
  for (const dateString of dateGroups.keys()) {
    await generateDoseOccurrences(userId, dateString, dateString, now);
  }

  const pairs = schedules.map((schedule) => ({
    schedule: schedule._id,
    localDate: dateBySchedule.get(schedule._id.toString())
  }));
  return pairs.length
    ? await Dose.find({ user: userId, $or: pairs }).sort({ scheduledFor: 1 })
    : [];
}

export async function listDosesByDateRange(userId, startDate, endDate, now = new Date()) {
  await generateDoseOccurrences(userId, startDate, endDate, now);
  return Dose.find(toDoseFilter(userId, startDate, endDate)).sort({ scheduledFor: 1 });
}

export async function updateDoseStatus(userId, doseId, { status, notes }, now = new Date()) {
  const existing = await Dose.findOne({ _id: doseId, user: userId });
  if (!existing) throw doseNotFound();
  if (!["upcoming", "missed"].includes(existing.status)) {
    throw new ApiError(409, `Cannot change dose status from ${existing.status}`);
  }

  const update = {
    $set: {
      status,
      ...(notes === undefined ? {} : { notes }),
      ...(status === "taken" ? { takenAt: now } : {})
    }
  };
  if (status === "skipped") update.$unset = { takenAt: 1 };

  const dose = await Dose.findOneAndUpdate({
    _id: doseId,
    user: userId,
    status: existing.status
  }, update, { new: true, runValidators: true });

  if (!dose) {
    const current = await Dose.findOne({ _id: doseId, user: userId });
    if (!current) throw doseNotFound();
    throw new ApiError(409, `Cannot change dose status from ${current.status}`);
  }
  return dose;
}
