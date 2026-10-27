import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string()
    .min(32, "JWT_SECRET must be at least 32 characters")
    .refine(
      (secret) => !/^(replace-with|your[-_ ]|change[-_ ]?me|placeholder)/i.test(secret),
      "JWT_SECRET must be a generated secret, not a placeholder"
    ),
  CORS_ORIGIN: z.string().default("http://localhost:5173,https://med-track-tawny.vercel.app"),
  USER_TIMEZONE: z.string().default("UTC").refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "USER_TIMEZONE must be a valid IANA timezone"),
  WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_SUBJECT: z.string().default("mailto:admin@example.com"),
  DOSE_REMINDER_LEAD_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  APPOINTMENT_REMINDER_LEAD_HOURS: z.string().default("24,1")
    .transform((value) => value.split(",").map((hour) => Number(hour.trim())))
    .pipe(z.array(z.number().int().min(1).max(720)).min(1).max(10))
    .refine((hours) => new Set(hours).size === hours.length, "Appointment reminder lead hours must be unique"),
  DOSE_REMINDER_JOB_ENABLED: z.enum(["true", "false"]).default("true")
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map(({ path, message }) => `${path.join(".")}: ${message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = Object.freeze(result.data);
export const corsOrigins = Object.freeze(
  env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
);
export const doseReminderJobEnabled = env.DOSE_REMINDER_JOB_ENABLED === "true";
