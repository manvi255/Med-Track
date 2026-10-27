import { app } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import mongoose from "mongoose";
import {
  doseReminderCronExpression,
  initializeDoseReminderJob,
  stopDoseReminderJob
} from "./services/reminderJob.service.js";

async function startServer() {
  try {
    await connectDatabase();
  } catch {
    console.error(
      "MongoDB connection failed; API server was not started. Check that MongoDB is available and MONGODB_URI is configured correctly."
    );
    process.exitCode = 1;
    return;
  }

  const server = app.listen(env.PORT, () => {
    console.info(`MediTrack API listening on port ${env.PORT}`);
  });
  const reminderTask = await initializeDoseReminderJob();
  if (reminderTask) {
    console.info(`Dose reminder worker started (${doseReminderCronExpression})`);
  } else {
    console.info("Dose reminder worker is disabled");
  }

  function shutdown(signal) {
    console.info(`${signal} received; closing server`);
    server.close(async (error) => {
      if (error) {
        console.error("Failed to close HTTP server cleanly", error);
        process.exitCode = 1;
      }

      try {
        await stopDoseReminderJob();
        await mongoose.disconnect();
      } catch (disconnectError) {
        console.error("Failed to disconnect from MongoDB cleanly", disconnectError);
        process.exitCode = 1;
      }
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

await startServer();
