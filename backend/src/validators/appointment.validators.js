import { z } from "zod";
import { isValidTimeZone } from "../utils/scheduleTime.js";

const scheduledAtSchema = z.iso.datetime({ offset: true })
  .transform((value) => new Date(value));
const remindersSchema = z.object({
  enabled: z.boolean(),
  leadHours: z.array(z.number().int().min(1).max(720)).min(1).max(10)
    .refine((hours) => new Set(hours).size === hours.length, "Reminder lead hours must be unique")
    .optional()
}).strict();
const appointmentFields = {
  doctorName: z.string().trim().min(1, "Doctor name is required").max(200),
  clinicName: z.string().trim().max(200).optional(),
  location: z.string().trim().max(500).optional(),
  appointmentType: z.enum(["consultation", "follow_up", "test", "procedure", "other"]),
  scheduledAt: scheduledAtSchema,
  timezone: z.string().refine(isValidTimeZone, "Timezone must be a valid IANA timezone"),
  status: z.enum(["scheduled", "completed", "cancelled"]),
  notes: z.string().trim().max(2000).optional(),
  reminders: remindersSchema
};

const createFields = {
  ...appointmentFields,
  appointmentType: appointmentFields.appointmentType.optional(),
  status: appointmentFields.status.optional(),
  reminders: appointmentFields.reminders.optional()
};

export const createAppointmentSchema = z.object(createFields).strict();

export const updateAppointmentSchema = z.object(appointmentFields)
  .partial()
  .strict()
  .refine((appointment) => Object.keys(appointment).length > 0, {
    message: "At least one appointment field must be provided"
  });

const positiveIntegerQuery = (maximum, message) => z.string()
  .regex(/^\d{1,7}$/, message)
  .transform(Number)
  .pipe(z.number().int().min(1).max(maximum));

export const appointmentListQuerySchema = z.object({
  status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
  period: z.enum(["upcoming", "past"]).optional(),
  page: positiveIntegerQuery(1000000, "Must be a valid positive integer").optional(),
  limit: positiveIntegerQuery(100, "Must be an integer from 1 to 100").optional()
}).strict();
