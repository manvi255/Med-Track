import mongoose from "mongoose";
import { env } from "../config/env.js";
import { isValidTimeZone } from "../utils/scheduleTime.js";

const reminderConfigSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: true
  },
  leadMinutes: {
    type: Number,
    min: 1,
    max: 1440,
    default: env.DOSE_REMINDER_LEAD_MINUTES
  }
}, { _id: false });

const scheduleSchema = new mongoose.Schema({
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
  doseAmount: {
    type: Number,
    required: true,
    min: 0.000001
  },
  doseUnit: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 50
  },
  frequency: {
    type: String,
    required: true,
    enum: ["daily", "multiple_daily", "selected_days"]
  },
  times: {
    type: [String],
    required: true,
    validate: [
      {
        validator: (times) => times.length > 0 && times.every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)),
        message: "times must include at least one valid local time in HH:mm format"
      },
      {
        validator: (times) => new Set(times).size === times.length,
        message: "times must not contain duplicates"
      },
      {
        validator(times) {
          return this.frequency !== "multiple_daily" || times.length >= 2;
        },
        message: "multiple_daily schedules require at least two dose times"
      }
    ]
  },
  daysOfWeek: {
    type: [Number],
    validate: {
      validator(days) {
        if (this.frequency === "selected_days") {
          return days.length > 0
            && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
            && new Set(days).size === days.length;
        }
        return days.length === 0;
      },
      message: "daysOfWeek is required only for selected_days and must contain unique values from 0 to 6"
    }
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    validate: {
      validator(endDate) {
        return !endDate || !this.startDate || endDate >= this.startDate;
      },
      message: "endDate must not precede startDate"
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
  instructions: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  reminders: {
    type: reminderConfigSchema,
    default: () => ({})
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

scheduleSchema.index({ user: 1, isActive: 1, startDate: 1 });
scheduleSchema.index({ isActive: 1, _id: 1 });
scheduleSchema.index({ medicine: 1, user: 1 });

export const Schedule = mongoose.models.Schedule
  ?? mongoose.model("Schedule", scheduleSchema);
