import mongoose from "mongoose";
import { isValidTimeZone } from "../utils/scheduleTime.js";

const doseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  medicine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Medicine",
    required: true,
    index: true
  },
  schedule: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Schedule",
    required: true,
    index: true
  },
  scheduledFor: {
    type: Date,
    required: true
  },
  localDate: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, "localDate must use YYYY-MM-DD format"]
  },
  timezone: {
    type: String,
    required: true,
    validate: {
      validator: isValidTimeZone,
      message: "timezone must be a valid IANA timezone"
    }
  },
  status: {
    type: String,
    enum: ["upcoming", "taken", "skipped", "missed"],
    default: "upcoming",
    required: true
  },
  takenAt: Date,
  notes: {
    type: String,
    trim: true,
    maxlength: 2000
  }
}, {
  timestamps: true
});

doseSchema.index({ schedule: 1, scheduledFor: 1 }, { unique: true });
doseSchema.index({ user: 1, localDate: 1, scheduledFor: 1 });
doseSchema.index({ user: 1, scheduledFor: 1 });
doseSchema.index({ status: 1, scheduledFor: 1, _id: 1 });

export const Dose = mongoose.models.Dose ?? mongoose.model("Dose", doseSchema);
