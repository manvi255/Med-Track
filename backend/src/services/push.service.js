import webpush from "web-push";
import { env } from "../config/env.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { ApiError } from "../utils/ApiError.js";

const MAX_PUSH_ATTEMPTS = 3;
let vapidConfigured = false;

export function hasVapidConfiguration() {
  const isConfigured = (value) => Boolean(value)
    && !/^(replace-with|your[-_ ]|change[-_ ]?me|placeholder)/i.test(value);
  return isConfigured(env.WEB_PUSH_PUBLIC_KEY)
    && isConfigured(env.WEB_PUSH_PRIVATE_KEY)
    && isConfigured(env.WEB_PUSH_SUBJECT);
}

function configureVapid() {
  if (vapidConfigured) return true;
  if (!hasVapidConfiguration()) return false;
  try {
    webpush.setVapidDetails(
      env.WEB_PUSH_SUBJECT,
      env.WEB_PUSH_PUBLIC_KEY,
      env.WEB_PUSH_PRIVATE_KEY
    );
    vapidConfigured = true;
    return true;
  } catch {
    return false;
  }
}

export function getPushPublicKey() {
  return hasVapidConfiguration() && configureVapid() ? env.WEB_PUSH_PUBLIC_KEY : null;
}

export async function registerPushSubscription(userId, subscriptionData) {
  try {
    const existing = await PushSubscription.findOne({
      user: userId,
      endpoint: subscriptionData.endpoint
    });
    if (existing) {
      existing.keys = subscriptionData.keys;
      await existing.save();
      return existing;
    }

    return await PushSubscription.create({
      user: userId,
      endpoint: subscriptionData.endpoint,
      keys: subscriptionData.keys
    });
  } catch (error) {
    if (error?.code === 11000) {
      try {
        const sameOwner = await PushSubscription.findOne({
          user: userId,
          endpoint: subscriptionData.endpoint
        });
        if (sameOwner) return sameOwner;
      } catch {
        throw new ApiError(500, "Unable to register push subscription");
      }
      throw new ApiError(409, "Push subscription endpoint is already registered");
    }
    throw new ApiError(500, "Unable to register push subscription");
  }
}

export async function deletePushSubscription(userId, endpoint) {
  try {
    const result = await PushSubscription.deleteOne({ user: userId, endpoint });
    return result.deletedCount > 0;
  } catch {
    throw new ApiError(500, "Unable to delete push subscription");
  }
}

export async function sendMinimalPushToUser(userId, {
  title = "Dose reminder",
  body = "A scheduled dose is coming up."
} = {}) {
  if (!configureVapid()) return { status: "unavailable" };
  const subscriptions = await PushSubscription.find({ user: userId })
    .select("+endpoint +keys.p256dh +keys.auth");
  if (!subscriptions.length) return { status: "unavailable" };

  const payload = JSON.stringify({
    title,
    body
  });
  let delivered = false;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: subscription.keys
      }, payload, { TTL: 60 });
      delivered = true;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await PushSubscription.deleteOne({
          _id: subscription._id,
          user: userId
        });
      }
    }
  }

  if (delivered) return { status: "sent" };
  return { status: "failed" };
}

export { MAX_PUSH_ATTEMPTS };
