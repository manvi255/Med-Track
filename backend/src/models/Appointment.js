import mongoose from "mongoose";
import { env } from "../config/env.js";
import { isValidTimeZone } from "../utils/scheduleTime.js";

const reminderConfigSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: true
  },
  leadHours: {
    type: [Number],
    default: () => [...env.APPOINTMENT_REMINDER_LEAD_HOURS],
    validate: {
      validator(hours) {
        return hours.length > 0
          && hours.every((hour) => Number.isInteger(hour) && hour >= 1 && hour <= 720)
          && new Set(hours).size === hours.length;
      },
      message: "Reminder lead hours must be unique whole hours from 1 to 720"
    }
  }
}, { _id: false });

const appointmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  doctorName: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200
  },
  clinicName: {
    type: String,
    trim: true,
    maxlength: 200
  },
  location: {
    type: String,
    trim: true,
    maxlength: 500
  },
  appointmentType: {
    type: String,
    enum: ["consultation", "follow_up", "test", "procedure", "other"],
    default: "consultation",
    required: true
  },
  scheduledAt: {
    type: Date,
    required: true,
    validate: {
      validator: (date) => date instanceof Date && Number.isFinite(date.getTime()),
      message: "scheduledAt must be a valid date"
    }
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
    enum: ["scheduled", "completed", "cancelled"],
    default: "scheduled",
    required: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  reminders: {
    type: reminderConfigSchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

appointmentSchema.index({ user: 1, scheduledAt: 1 });
appointmentSchema.index({ user: 1, status: 1, scheduledAt: 1 });
appointmentSchema.index({ status: 1, "reminders.enabled": 1, scheduledAt: 1, _id: 1 });

export const Appointment = mongoose.models.Appointment
  ?? mongoose.model("Appointment", appointmentSchema);
