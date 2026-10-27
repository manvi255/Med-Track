import { z } from "zod";
import { isValidTimeZone } from "../utils/scheduleTime.js";

const dateSchema = z.iso.date().transform((date) => new Date(`${date}T00:00:00.000Z`));
const frequencySchema = z.enum(["daily", "multiple_daily", "selected_days"]);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must use 24-hour HH:mm format");
const reminderConfigSchema = z.object({
  enabled: z.boolean(),
  leadMinutes: z.number().int().min(1).max(1440).optional()
}).strict();

const scheduleFields = {
  medicine: z.string().regex(/^[a-f\d]{24}$/i, "Medicine must be a valid ID"),
  doseAmount: z.number().positive(),
  doseUnit: z.string().trim().min(1).max(50),
  frequency: frequencySchema,
  times: z.array(timeSchema).min(1).max(24).refine(
    (times) => new Set(times).size === times.length,
    "Times must not contain duplicates"
  ),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  timezone: z.string().refine(isValidTimeZone, "Timezone must be a valid IANA timezone"),
  instructions: z.string().trim().max(2000).optional(),
  reminders: reminderConfigSchema,
  isActive: z.boolean()
};

function scheduleIssue(schedule) {
  const issues = [];
  if (schedule.frequency === "selected_days" && !schedule.daysOfWeek?.length) {
    issues.push({ code: "custom", path: ["daysOfWeek"], message: "daysOfWeek is required for selected_days" });
  } else if (schedule.frequency !== "selected_days" && schedule.daysOfWeek?.length) {
    issues.push({ code: "custom", path: ["daysOfWeek"], message: "daysOfWeek is only allowed for selected_days" });
  } else if (schedule.daysOfWeek && new Set(schedule.daysOfWeek).size !== schedule.daysOfWeek.length) {
    issues.push({ code: "custom", path: ["daysOfWeek"], message: "daysOfWeek must not contain duplicates" });
  }
  if (schedule.startDate && schedule.endDate && schedule.endDate < schedule.startDate) {
    issues.push({ code: "custom", path: ["endDate"], message: "endDate must not precede startDate" });
  }
  if (schedule.frequency === "multiple_daily" && schedule.times?.length < 2) {
    issues.push({ code: "custom", path: ["times"], message: "multiple_daily requires at least two dose times" });
  }
  return issues;
}

function partialScheduleIssue(schedule) {
  const issues = [];
  if (schedule.frequency === "selected_days"
    && schedule.daysOfWeek !== undefined
    && (!schedule.daysOfWeek.length || new Set(schedule.daysOfWeek).size !== schedule.daysOfWeek.length)) {
    issues.push({ code: "custom", path: ["daysOfWeek"], message: "daysOfWeek must contain unique selected weekdays" });
  } else if (schedule.frequency && schedule.frequency !== "selected_days" && schedule.daysOfWeek?.length) {
    issues.push({ code: "custom", path: ["daysOfWeek"], message: "daysOfWeek is only allowed for selected_days" });
  } else if (schedule.daysOfWeek && new Set(schedule.daysOfWeek).size !== schedule.daysOfWeek.length) {
    issues.push({ code: "custom", path: ["daysOfWeek"], message: "daysOfWeek must not contain duplicates" });
  }
  if (schedule.startDate && schedule.endDate && schedule.endDate < schedule.startDate) {
    issues.push({ code: "custom", path: ["endDate"], message: "endDate must not precede startDate" });
  }
  if (schedule.frequency === "multiple_daily" && schedule.times?.length < 2) {
    issues.push({ code: "custom", path: ["times"], message: "multiple_daily requires at least two dose times" });
  }
  return issues;
}

export const createScheduleSchema = z.object({
  ...scheduleFields,
  reminders: reminderConfigSchema.optional(),
  isActive: scheduleFields.isActive.optional()
}).strict().superRefine((schedule, context) => {
  for (const issue of scheduleIssue(schedule)) context.addIssue(issue);
});

export const updateScheduleSchema = z.object(scheduleFields)
  .partial()
  .strict()
  .refine((schedule) => Object.keys(schedule).length > 0, {
    message: "At least one schedule field must be provided"
  })
  .superRefine((schedule, context) => {
    for (const issue of partialScheduleIssue(schedule)) context.addIssue(issue);
  });

export const scheduleListQuerySchema = z.object({
  isActive: z.enum(["true", "false"]).optional(),
  medicine: z.string().regex(/^[a-f\d]{24}$/i, "Medicine must be a valid ID").optional()
}).strict();

export const doseRangeQuerySchema = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date()
}).strict().refine(({ startDate, endDate }) => startDate <= endDate, {
  message: "endDate must not precede startDate",
  path: ["endDate"]
});

export const updateDoseStatusSchema = z.object({
  status: z.enum(["taken", "skipped"]),
  notes: z.string().trim().max(2000).optional()
}).strict();
