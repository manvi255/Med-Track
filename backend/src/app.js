import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { corsOrigins } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { notFoundHandler } from "./middleware/notFound.middleware.js";
import { ApiError } from "./utils/ApiError.js";
import { authRouter } from "./routes/auth.routes.js";
import { medicineRouter } from "./routes/medicine.routes.js";
import { scheduleRouter } from "./routes/schedule.routes.js";
import { doseRouter } from "./routes/dose.routes.js";
import { prescriptionRouter } from "./routes/prescription.routes.js";
import { notificationRouter } from "./routes/notification.routes.js";
import { pushRouter } from "./routes/push.routes.js";
import { appointmentRouter } from "./routes/appointment.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new ApiError(403, "Origin is not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "1mb" }));

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/medicines", medicineRouter);
app.use("/api/v1/schedules", scheduleRouter);
app.use("/api/v1/doses", doseRouter);
app.use("/api/v1/prescriptions", prescriptionRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/push", pushRouter);
app.use("/api/v1/appointments", appointmentRouter);
app.use("/api/v1/dashboard", dashboardRouter);

app.get("/api/v1/health", (_req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ok" : "degraded",
    database: {
      status: databaseConnected ? "connected" : "unavailable"
    }
  });
});

app.use(notFoundHandler);
app.use(errorHandler);
