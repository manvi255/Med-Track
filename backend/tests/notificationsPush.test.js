import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import { env } from "../src/config/env.js";

const userId = "111111111111111111111111";
const otherUserId = "222222222222222222222222";
const notificationId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const otherNotificationId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const notifications = new Map();
const subscriptions = new Map();
const now = new Date("2026-10-27T12:00:00.000Z");

function isMatch(record, filter) {
  if (!record) return false;
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "$or") {
      if (!expected.some((clause) => isMatch(record, clause))) return false;
      continue;
    }
    if (key === "$and") {
      if (!expected.every((clause) => isMatch(record, clause))) return false;
      continue;
    }
    if (expected && typeof expected === "object" && !(expected instanceof Date) && !Array.isArray(expected)) {
      if ("$exists" in expected && (record[key] !== undefined) !== expected.$exists) return false;
      if ("$in" in expected && !expected.$in.includes(record[key])) return false;
      if ("$lt" in expected && !(record[key] < expected.$lt)) return false;
      if ("$lte" in expected && !(record[key] <= expected.$lte)) return false;
      if ("$gte" in expected && !(record[key] >= expected.$gte)) return false;
      if ("$ne" in expected && record[key] === expected.$ne) return false;
    } else if (String(record[key]) !== String(expected)) {
      return false;
    }
  }
  return true;
}

class MockQuery {
  constructor(values) {
    this.values = values;
  }

  sort(order) {
    const [[field, direction]] = Object.entries(order);
    this.values.sort((left, right) => {
      const a = left[field] instanceof Date ? left[field].getTime() : String(left[field]);
      const b = right[field] instanceof Date ? right[field].getTime() : String(right[field]);
      return (a < b ? -1 : a > b ? 1 : 0) * direction;
    });
    return this;
  }

  skip(count) {
    this.values = this.values.slice(count);
    return this;
  }

  limit(count) {
    this.values = this.values.slice(0, count);
    return this;
  }

  select() { return this; }
  populate() { return this; }
  then(resolve, reject) { return Promise.resolve(this.values).then(resolve, reject); }
}

class MockUser {
  constructor(id) {
    this.id = id;
    this._id = id;
    this.name = "Notification User";
    this.email = "notify@example.com";
    this.createdAt = now;
    this.updatedAt = now;
  }

  static async findById(id) {
    return [userId, otherUserId].includes(String(id)) ? new MockUser(String(id)) : null;
  }
}

class MockNotification {
  constructor(data) {
    Object.assign(this, data);
  }

  static find(filter) {
    return new MockQuery([...notifications.values()].filter((item) => isMatch(item, filter)));
  }

  static async countDocuments(filter) {
    return [...notifications.values()].filter((item) => isMatch(item, filter)).length;
  }

  static async findOne(filter) {
    return [...notifications.values()].find((item) => isMatch(item, filter)) ?? null;
  }

  static async findOneAndUpdate(filter, update) {
    const notification = [...notifications.values()].find((item) => isMatch(item, filter));
    if (!notification) return null;
    Object.assign(notification, update.$set);
    if (update.$inc) {
      for (const [key, value] of Object.entries(update.$inc)) {
        notification[key] = (notification[key] ?? 0) + value;
      }
    }
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) delete notification[key];
    }
    return notification;
  }

  static async updateMany(filter, update) {
    const matching = [...notifications.values()].filter((item) => isMatch(item, filter));
    for (const notification of matching) Object.assign(notification, update.$set);
    return { matchedCount: matching.length, modifiedCount: matching.length };
  }

  static async deleteOne(filter) {
    const notification = [...notifications.values()].find((item) => isMatch(item, filter));
    if (notification) notifications.delete(notification._id);
    return { deletedCount: notification ? 1 : 0 };
  }
}

class MockPushSubscription {
  constructor(data) {
    Object.assign(this, data);
    this._id ??= `${subscriptions.size + 1}`.padStart(24, "0");
  }

  async save() {
    subscriptions.set(this.endpoint, this);
    return this;
  }

  static findOne(filter) {
    return Promise.resolve([...subscriptions.values()].find((value) => isMatch(value, filter)) ?? null);
  }

  static async create(data) {
    if (subscriptions.has(data.endpoint)) {
      const error = new Error("duplicate key");
      error.code = 11000;
      throw error;
    }
    const subscription = new MockPushSubscription(data);
    subscriptions.set(subscription.endpoint, subscription);
    return subscription;
  }

  static find(filter) {
    return new MockQuery([...subscriptions.values()].filter((value) => isMatch(value, filter)));
  }

  static async deleteOne(filter) {
    const subscription = [...subscriptions.values()].find((value) => isMatch(value, filter));
    if (subscription) subscriptions.delete(subscription.endpoint);
    return { deletedCount: subscription ? 1 : 0 };
  }
}

jest.unstable_mockModule("../src/models/User.js", () => ({ User: MockUser }));
jest.unstable_mockModule("../src/models/Notification.js", () => ({ Notification: MockNotification }));
jest.unstable_mockModule("../src/models/PushSubscription.js", () => ({ PushSubscription: MockPushSubscription }));

const { app } = await import("../src/app.js");
const { Notification } = await import("../src/models/Notification.js");
const { serializeNotification } = await import("../src/services/notification.service.js");

function cookie(ownerId = userId) {
  return `meditrack_auth=${jwt.sign({ sub: ownerId }, env.JWT_SECRET, { expiresIn: "1h" })}`;
}

function notification(id, owner = userId, createdAt = now, readAt) {
  const item = new MockNotification({
    _id: id,
    id,
    user: owner,
    type: "dose_reminder",
    title: "Dose reminder",
    message: "A scheduled dose is coming up.",
    ...(readAt ? { readAt } : {}),
    relatedDose: "cccccccccccccccccccccccc",
    scheduledFor: now,
    pushDeliveryStatus: "unavailable",
    createdAt
  });
  notifications.set(id, item);
  return item;
}

describe("notifications and push subscription routes", () => {
  beforeEach(() => {
    notifications.clear();
    subscriptions.clear();
  });

  it("serializes actionable dose details only when dose and medicine ownership match", () => {
    const relatedDose = {
      _id: "cccccccccccccccccccccccc",
      user: userId,
      status: "upcoming",
      scheduledFor: now,
      timezone: "UTC",
      medicine: {
        _id: "dddddddddddddddddddddddd",
        user: userId,
        name: "Example medicine"
      }
    };
    const owned = serializeNotification({
      _id: notificationId,
      id: notificationId,
      user: userId,
      type: "dose_reminder",
      title: "Dose reminder",
      message: "Reminder",
      relatedDose,
      createdAt: now
    });
    const foreign = serializeNotification({
      _id: notificationId,
      id: notificationId,
      user: userId,
      type: "dose_reminder",
      title: "Dose reminder",
      message: "Reminder",
      relatedDose: { ...relatedDose, user: otherUserId },
      createdAt: now
    });

    expect(owned.dose).toMatchObject({
      status: "upcoming",
      timezone: "UTC",
      medicineName: "Example medicine"
    });
    expect(foreign).not.toHaveProperty("dose");
  });

  it("requires authentication for user notification and subscription endpoints", async () => {
    expect((await request(app).get("/api/v1/notifications")).status).toBe(401);
    expect((await request(app).post("/api/v1/push/subscribe").send({})).status).toBe(401);
  });

  it("lists only the current user's notifications, newest first, with pagination", async () => {
    notification(notificationId, userId, new Date("2026-10-26T12:00:00.000Z"));
    notification("cccccccccccccccccccccccc", userId, new Date("2026-10-27T11:00:00.000Z"));
    notification(otherNotificationId, otherUserId, new Date("2026-10-27T12:00:00.000Z"));
    const response = await request(app)
      .get("/api/v1/notifications?page=1&limit=1")
      .set("Cookie", cookie());

    expect(response.status).toBe(200);
    expect(response.body.notifications).toHaveLength(1);
    expect(response.body.notifications[0].id).toBe("cccccccccccccccccccccccc");
    expect(response.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2
    });
  });

  it("rejects invalid pagination and notification IDs", async () => {
    const page = await request(app)
      .get("/api/v1/notifications?page=0&limit=101")
      .set("Cookie", cookie());
    const id = await request(app)
      .patch("/api/v1/notifications/bad-id/read")
      .set("Cookie", cookie());
    expect(page.status).toBe(400);
    expect(id.status).toBe(400);
  });

  it("returns current-user unread count and marks a notification read idempotently", async () => {
    notification(notificationId);
    notification(otherNotificationId, otherUserId);
    const unread = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Cookie", cookie());
    expect(unread.body.unreadCount).toBe(1);

    const first = await request(app)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set("Cookie", cookie());
    const second = await request(app)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set("Cookie", cookie());
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.notification.readAt).toBe(second.body.notification.readAt);
  });

  it("marks all only the authenticated user's unread notifications", async () => {
    notification(notificationId);
    notification("cccccccccccccccccccccccc", userId);
    notification(otherNotificationId, otherUserId);
    const response = await request(app)
      .patch("/api/v1/notifications/read-all")
      .set("Cookie", cookie());
    expect(response.status).toBe(200);
    expect(response.body.modifiedCount).toBe(2);
    expect(notifications.get(otherNotificationId).readAt).toBeUndefined();
  });

  it("deletes only an owned notification", async () => {
    notification(notificationId);
    notification(otherNotificationId, otherUserId);
    const foreign = await request(app)
      .delete(`/api/v1/notifications/${otherNotificationId}`)
      .set("Cookie", cookie());
    const owned = await request(app)
      .delete(`/api/v1/notifications/${notificationId}`)
      .set("Cookie", cookie());
    expect(foreign.status).toBe(404);
    expect(owned.status).toBe(204);
  });

  it("returns only the public key when push is configured without exposing private keys", async () => {
    const response = await request(app).get("/api/v1/push/public-key");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("publicKey");
    expect(response.body.publicKey === null || typeof response.body.publicKey === "string").toBe(true);
    expect(JSON.stringify(response.body)).not.toContain("WEB_PUSH_PRIVATE_KEY");
  });

  it("validates and registers subscriptions idempotently without returning credentials", async () => {
    const invalid = await request(app)
      .post("/api/v1/push/subscribe")
      .set("Cookie", cookie())
      .send({ endpoint: "http://push.example", keys: { p256dh: "short", auth: "short" } });
    expect(invalid.status).toBe(400);

    const subscription = {
      endpoint: "https://push.example/subscription/opaque",
      expirationTime: null,
      keys: { p256dh: "p256dh-key-long-enough", auth: "auth-key-long" }
    };
    const first = await request(app)
      .post("/api/v1/push/subscribe")
      .set("Cookie", cookie())
      .send(subscription);
    const second = await request(app)
      .post("/api/v1/push/subscribe")
      .set("Cookie", cookie())
      .send(subscription);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(subscriptions.size).toBe(1);
    expect(JSON.stringify(first.body)).not.toContain(subscription.endpoint);
    expect(JSON.stringify(first.body)).not.toContain(subscription.keys.p256dh);
  });

  it("does not allow another user to overwrite or delete a subscription endpoint", async () => {
    const subscription = {
      endpoint: "https://push.example/subscription/owned",
      keys: { p256dh: "p256dh-key-long-enough", auth: "auth-key-long" }
    };
    await request(app).post("/api/v1/push/subscribe").set("Cookie", cookie()).send(subscription);

    const foreignAttempt = await request(app)
      .post("/api/v1/push/subscribe")
      .set("Cookie", cookie(otherUserId))
      .send({ ...subscription, keys: { ...subscription.keys, auth: "other-auth-key" } });
    const foreignDelete = await request(app)
      .delete("/api/v1/push/subscribe")
      .set("Cookie", cookie(otherUserId))
      .send({ endpoint: subscription.endpoint });

    expect(foreignAttempt.status).toBe(409);
    expect(foreignDelete.status).toBe(404);
    expect(subscriptions.get(subscription.endpoint).user).toBe(userId);
  });

  it("deletes the current user's subscription", async () => {
    const endpoint = "https://push.example/subscription/delete";
    subscriptions.set(endpoint, new MockPushSubscription({
      user: userId,
      endpoint,
      keys: { p256dh: "p256dh-key-long-enough", auth: "auth-key-long" }
    }));
    const response = await request(app)
      .delete("/api/v1/push/subscribe")
      .set("Cookie", cookie())
      .send({ endpoint });
    expect(response.status).toBe(204);
    expect(subscriptions.has(endpoint)).toBe(false);
  });
});
