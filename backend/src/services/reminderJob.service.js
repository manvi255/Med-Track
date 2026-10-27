import { env } from "../config/env.js";
import cron from "node-cron";
import { createDueDoseReminders, retryPendingPushDeliveries } from "./notification.service.js";
import { createDueAppointmentReminders } from "./appointmentReminder.service.js";
import { generateUpcomingDoseOccurrences } from "./doseGeneration.service.js";

const CRON_EXPRESSION = "* * * * *";
let cronTask;
let jobRunning = false;

export async function runDoseReminderJob({
  now = new Date(),
  leadMinutes = env.DOSE_REMINDER_LEAD_MINUTES,
  generateOccurrences = generateUpcomingDoseOccurrences,
  createReminders = createDueDoseReminders,
  createAppointmentReminders = createDueAppointmentReminders,
  retryPush = retryPendingPushDeliveries
} = {}) {
  if (jobRunning) return { skipped: true };
  jobRunning = true;
  try {
    const dosesGenerated = await generateOccurrences({ now });
    const [remindersCreated, appointmentRemindersCreated, pushAttempts] = await Promise.all([
      createReminders({ now, leadMinutes }),
      createAppointmentReminders({ now }),
      retryPush(now)
    ]);
    return { skipped: false, dosesGenerated, remindersCreated, appointmentRemindersCreated, pushAttempts };
  } finally {
    jobRunning = false;
  }
}

export function initializeDoseReminderJob({
  environment = env.NODE_ENV,
  enabled = env.DOSE_REMINDER_JOB_ENABLED === "true",
  scheduleTask,
  runJob = runDoseReminderJob
} = {}) {
  if (environment === "test" || !enabled) return null;
  if (cronTask) return cronTask;

  cronTask = (scheduleTask ?? cron.schedule)(CRON_EXPRESSION, async () => {
    try {
      await runJob();
    } catch (error) {
      console.error("Dose reminder job failed", error?.name ?? "UnknownError");
    }
  }, { noOverlap: true });
  return cronTask;
}

export async function stopDoseReminderJob() {
  if (!cronTask) return;
  const task = await cronTask;
  task?.stop?.();
  cronTask = undefined;
}

export const doseReminderCronExpression = CRON_EXPRESSION;
