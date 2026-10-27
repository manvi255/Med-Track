import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Appointment } from "../models/Appointment.js";
import { Dose } from "../models/Dose.js";
import { Medicine } from "../models/Medicine.js";
import {
  addCalendarDays,
  localDateString,
  startOfLocalDayUtc
} from "../utils/scheduleTime.js";

const DEFAULT_UPCOMING_LIMIT = 50;
const MAX_UPCOMING_LIMIT = 100;
const ADHERENCE_PERIOD_DAYS = Object.freeze({ "7d": 7, "30d": 30 });
const COMPLETED_DOSE_STATUSES = ["taken", "skipped", "missed"];

function percentage(taken, eligible) {
  return eligible ? Math.round((taken / eligible) * 10000) / 100 : null;
}

function localDayRange(now, timezone) {
  const today = localDateString(now, timezone);
  const tomorrow = addCalendarDays(today, 1);
  return {
    today,
    start: startOfLocalDayUtc(today, timezone),
    end: startOfLocalDayUtc(tomorrow, timezone)
  };
}

export async function getDashboardSummary(userId, {
  now = new Date(),
  timezone = env.USER_TIMEZONE
} = {}) {
  const { start, end } = localDayRange(now, timezone);
  const ownerId = new mongoose.Types.ObjectId(userId);
  const [activeMedicineCount, doseStats, upcomingAppointmentCount] = await Promise.all([
    Medicine.countDocuments({ user: userId, isActive: true }),
    Dose.aggregate([
      {
        $match: {
          user: ownerId,
          scheduledFor: { $gte: start, $lt: end }
        }
      },
      {
        $group: {
          _id: null,
          dosesScheduledToday: { $sum: 1 },
          dosesTakenToday: {
            $sum: { $cond: [{ $eq: ["$status", "taken"] }, 1, 0] }
          },
          dosesUpcomingToday: {
            $sum: { $cond: [{ $eq: ["$status", "upcoming"] }, 1, 0] }
          },
          dosesSkippedToday: {
            $sum: { $cond: [{ $eq: ["$status", "skipped"] }, 1, 0] }
          },
          dosesMissedToday: {
            $sum: { $cond: [{ $eq: ["$status", "missed"] }, 1, 0] }
          },
          eligibleScheduled: {
            $sum: {
              $cond: [{
                $and: [
                  { $lt: ["$scheduledFor", now] },
                  { $in: ["$status", COMPLETED_DOSE_STATUSES] }
                ]
              }, 1, 0]
            }
          },
          eligibleTaken: {
            $sum: {
              $cond: [{
                $and: [
                  { $lt: ["$scheduledFor", now] },
                  { $eq: ["$status", "taken"] }
                ]
              }, 1, 0]
            }
          }
        }
      }
    ]),
    Appointment.countDocuments({
      user: userId,
      status: "scheduled",
      scheduledAt: { $gte: now }
    })
  ]);
  const stats = doseStats[0] ?? {};

  return {
    activeMedicineCount,
    dosesScheduledToday: stats.dosesScheduledToday ?? 0,
    dosesTakenToday: stats.dosesTakenToday ?? 0,
    dosesUpcomingToday: stats.dosesUpcomingToday ?? 0,
    dosesSkippedToday: stats.dosesSkippedToday ?? 0,
    dosesMissedToday: stats.dosesMissedToday ?? 0,
    adherenceToday: percentage(stats.eligibleTaken ?? 0, stats.eligibleScheduled ?? 0),
    upcomingAppointmentCount
  };
}

export async function getDashboardAdherence(userId, period = "7d", {
  now = new Date(),
  timezone = env.USER_TIMEZONE
} = {}) {
  const numberOfDays = ADHERENCE_PERIOD_DAYS[period];
  if (!numberOfDays) throw new RangeError("Unsupported adherence period");
  const endDate = localDateString(now, timezone);
  const startDate = addCalendarDays(endDate, -(numberOfDays - 1));
  const from = startOfLocalDayUtc(startDate, timezone);
  const until = startOfLocalDayUtc(addCalendarDays(endDate, 1), timezone);
  const ownerId = new mongoose.Types.ObjectId(userId);

  const grouped = await Dose.aggregate([
    {
      $match: {
        user: ownerId,
        scheduledFor: { $gte: from, $lt: until }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$scheduledFor",
            timezone
          }
        },
        scheduled: { $sum: 1 },
        taken: { $sum: { $cond: [{ $eq: ["$status", "taken"] }, 1, 0] } },
        skipped: { $sum: { $cond: [{ $eq: ["$status", "skipped"] }, 1, 0] } },
        missed: { $sum: { $cond: [{ $eq: ["$status", "missed"] }, 1, 0] } },
        eligibleScheduled: {
          $sum: {
            $cond: [{
              $and: [
                { $lt: ["$scheduledFor", now] },
                { $in: ["$status", COMPLETED_DOSE_STATUSES] }
              ]
            }, 1, 0]
          }
        },
        eligibleTaken: {
          $sum: {
            $cond: [{
              $and: [
                { $lt: ["$scheduledFor", now] },
                { $eq: ["$status", "taken"] }
              ]
            }, 1, 0]
          }
        }
      }
    }
  ]);

  const statsByDate = new Map(grouped.map((stat) => [stat._id, stat]));
  const dailyStats = [];
  let totalEligible = 0;
  let totalTaken = 0;
  for (let offset = 0; offset < numberOfDays; offset += 1) {
    const date = addCalendarDays(startDate, offset);
    const stat = statsByDate.get(date) ?? {};
    const eligible = stat.eligibleScheduled ?? 0;
    const taken = stat.eligibleTaken ?? 0;
    totalEligible += eligible;
    totalTaken += taken;
    dailyStats.push({
      date,
      scheduled: stat.scheduled ?? 0,
      taken: stat.taken ?? 0,
      skipped: stat.skipped ?? 0,
      missed: stat.missed ?? 0,
      adherenceRate: percentage(taken, eligible)
    });
  }

  return {
    period,
    startDate,
    endDate,
    overallAdherence: percentage(totalTaken, totalEligible),
    dailyStats
  };
}

export async function getDashboardUpcoming(userId, {
  now = new Date(),
  horizonDays = 7,
  limit = DEFAULT_UPCOMING_LIMIT
} = {}) {
  const boundedLimit = Math.max(1, Math.min(MAX_UPCOMING_LIMIT, limit));
  const until = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const [doses, appointments] = await Promise.all([
    Dose.find({
      user: userId,
      status: "upcoming",
      scheduledFor: { $gte: now, $lt: until }
    })
      .select("scheduledFor status medicine schedule")
      .sort({ scheduledFor: 1, _id: 1 })
      .limit(boundedLimit)
      .populate([
        { path: "medicine", select: "name", match: { user: userId } },
        { path: "schedule", select: "doseAmount doseUnit", match: { user: userId } }
      ]),
    Appointment.find({
      user: userId,
      status: "scheduled",
      scheduledAt: { $gte: now, $lt: until }
    })
      .select("doctorName clinicName scheduledAt appointmentType status")
      .sort({ scheduledAt: 1, _id: 1 })
      .limit(boundedLimit)
  ]);

  return {
    upcomingDoses: doses
      .filter((dose) => dose.medicine && dose.schedule)
      .map((dose) => ({
        id: dose.id ?? dose._id.toString(),
        scheduledFor: dose.scheduledFor,
        status: dose.status,
        medicineName: dose.medicine.name,
        doseAmount: dose.schedule.doseAmount,
        doseUnit: dose.schedule.doseUnit
      })),
    upcomingAppointments: appointments.map((appointment) => ({
      id: appointment.id ?? appointment._id.toString(),
      doctorName: appointment.doctorName,
      ...(appointment.clinicName === undefined ? {} : { clinicName: appointment.clinicName }),
      scheduledAt: appointment.scheduledAt,
      appointmentType: appointment.appointmentType,
      status: appointment.status
    }))
  };
}
