import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ["dose_reminder", "appointment_reminder"],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  readAt: Date,
  relatedDose: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dose"
  },
  relatedAppointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment"
  },
  scheduledFor: Date,
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    immutable: true
  },
  pushDeliveryStatus: {
    type: String,
    enum: ["pending", "sending", "sent", "failed", "unavailable"],
    default: "unavailable",
    required: true
  },
  pushAttemptCount: {
    type: Number,
    min: 0,
    default: 0
  },
  pushLastAttemptAt: Date,
  pushLeaseUntil: Date
}, {
  timestamps: true
});

notificationSchema.index({ user: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ user: 1, relatedDose: 1 });
notificationSchema.index({ pushDeliveryStatus: 1, createdAt: 1, pushAttemptCount: 1 });
notificationSchema.index({ user: 1, relatedAppointment: 1, type: 1 });

export const Notification = mongoose.models.Notification
  ?? mongoose.model("Notification", notificationSchema);
