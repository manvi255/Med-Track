import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    trim: true,
    select: false
  },
  keys: {
    p256dh: { type: String, required: true, select: false },
    auth: { type: String, required: true, select: false }
  }
}, {
  timestamps: true
});

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ user: 1, createdAt: -1 });

export const PushSubscription = mongoose.models.PushSubscription
  ?? mongoose.model("PushSubscription", pushSubscriptionSchema);
