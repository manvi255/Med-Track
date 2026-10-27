import { env } from "../config/env.js";
import {
  createSchedule,
  deleteSchedule,
  getOwnedSchedule,
  listSchedules,
  updateSchedule
} from "../services/schedule.service.js";

function serializeSchedule(schedule) {
  return {
    id: schedule.id ?? schedule._id.toString(),
    medicine: schedule.medicine.toString(),
    doseAmount: schedule.doseAmount,
    doseUnit: schedule.doseUnit,
    frequency: schedule.frequency,
    times: schedule.times,
    ...(schedule.daysOfWeek?.length ? { daysOfWeek: schedule.daysOfWeek } : {}),
    startDate: schedule.startDate,
    ...(schedule.endDate === undefined ? {} : { endDate: schedule.endDate }),
    timezone: schedule.timezone,
    ...(schedule.instructions === undefined ? {} : { instructions: schedule.instructions }),
    reminders: {
      enabled: schedule.reminders?.enabled ?? true,
      leadMinutes: schedule.reminders?.leadMinutes ?? env.DOSE_REMINDER_LEAD_MINUTES
    },
    isActive: schedule.isActive,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt
  };
}

export async function createScheduleController(req, res) {
  const schedule = await createSchedule(req.user.id, req.body);
  res.status(201).json({ schedule: serializeSchedule(schedule) });
}

export async function listSchedulesController(req, res) {
  const schedules = await listSchedules(req.user.id, req.validatedQuery);
  res.status(200).json({ schedules: schedules.map(serializeSchedule) });
}

export async function getScheduleController(req, res) {
  const schedule = await getOwnedSchedule(req.user.id, req.params.id);
  res.status(200).json({ schedule: serializeSchedule(schedule) });
}

export async function updateScheduleController(req, res) {
  const schedule = await updateSchedule(req.user.id, req.params.id, req.body);
  res.status(200).json({ schedule: serializeSchedule(schedule) });
}

export async function deleteScheduleController(req, res) {
  await deleteSchedule(req.user.id, req.params.id);
  res.status(204).end();
}
