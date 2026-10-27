import { Dose } from "../models/Dose.js";
import { Schedule } from "../models/Schedule.js";
import {
  addCalendarDays,
  dateOnlyString,
  getLocalWeekday,
  resolveLocalDateTime
} from "../utils/scheduleTime.js";

function occursOnDate(schedule, dateString) {
  if (dateString < dateOnlyString(schedule.startDate)) return false;
  if (schedule.endDate && dateString > dateOnlyString(schedule.endDate)) return false;
  if (schedule.frequency === "selected_days") {
    return schedule.daysOfWeek.includes(getLocalWeekday(dateString));
  }
  return true;
}

export function buildDoseOccurrences(schedules, startDate, endDate, now = new Date()) {
  const occurrences = [];
  for (const schedule of schedules) {
    for (let dateString = startDate; dateString <= endDate; dateString = addCalendarDays(dateString, 1)) {
      if (!schedule.isActive || !occursOnDate(schedule, dateString)) continue;
      for (const time of schedule.times) {
        const scheduledFor = resolveLocalDateTime(dateString, time, schedule.timezone);
        if (!scheduledFor) continue;

        occurrences.push({
          user: schedule.user,
          medicine: schedule.medicine,
          schedule: schedule._id,
          scheduledFor,
          localDate: dateString,
          timezone: schedule.timezone,
          status: scheduledFor < now ? "missed" : "upcoming"
        });
      }
    }
  }
  return occurrences;
}

async function persistDoseOccurrences(occurrences) {
  if (occurrences.length) {
    const operations = occurrences.map((occurrence) => ({
      updateOne: {
        filter: {
          user: occurrence.user,
          schedule: occurrence.schedule,
          scheduledFor: occurrence.scheduledFor
        },
        update: { $setOnInsert: occurrence },
        upsert: true
      }
    }));

    try {
      await Dose.bulkWrite(operations, { ordered: false });
    } catch (error) {
      const writeErrors = error.writeErrors ?? error.result?.getWriteErrors?.() ?? [];
      if (!writeErrors.length || writeErrors.some(({ code }) => code !== 11000)) {
        throw error;
      }
    }
  }
  return occurrences.length;
}

function activeScheduleFilter(startDate, endDate, afterId) {
  return {
    isActive: true,
    startDate: { $lte: new Date(`${endDate}T23:59:59.999Z`) },
    $or: [
      { endDate: { $exists: false } },
      { endDate: null },
      { endDate: { $gte: new Date(`${startDate}T00:00:00.000Z`) } }
    ],
    ...(afterId ? { _id: { $gt: afterId } } : {})
  };
}

export async function generateDoseOccurrences(userId, startDate, endDate, now = new Date()) {
  const schedules = await Schedule.find({
    ...activeScheduleFilter(startDate, endDate),
    user: userId
  });
  const occurrences = buildDoseOccurrences(schedules, startDate, endDate, now);
  await persistDoseOccurrences(occurrences);
  await Dose.updateMany({
    user: userId,
    localDate: { $gte: startDate, $lte: endDate },
    status: "upcoming",
    scheduledFor: { $lt: now }
  }, {
    $set: { status: "missed" }
  });
  return occurrences.length;
}

export async function generateUpcomingDoseOccurrences({
  now = new Date(),
  batchSize = 500
} = {}) {
  const today = dateOnlyString(now);
  const startDate = addCalendarDays(today, -1);
  const endDate = addCalendarDays(today, 2);
  let afterId;
  let generated = 0;

  while (true) {
    const schedules = await Schedule.find(activeScheduleFilter(startDate, endDate, afterId))
      .select("user medicine isActive startDate endDate times frequency daysOfWeek timezone")
      .sort({ _id: 1 })
      .limit(batchSize);
    if (!schedules.length) break;

    const occurrences = buildDoseOccurrences(schedules, startDate, endDate, now)
      .filter(({ scheduledFor }) => scheduledFor >= now);
    generated += await persistDoseOccurrences(occurrences);
    afterId = schedules[schedules.length - 1]._id;
    if (schedules.length < batchSize) break;
  }
  return generated;
}
