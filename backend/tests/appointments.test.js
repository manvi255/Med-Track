import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import { env } from "../src/config/env.js";

const userId = "111111111111111111111111";
const otherUserId = "222222222222222222222222";
const appointmentId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const otherAppointmentId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const now = new Date("2026-10-27T12:00:00.000Z");
const appointments = new Map();
const notifications = new Map();
let nextAppointmentId = 1;

function getPath(record, path) {
  return path.split(".").reduce((value, part) => value?.[part], record);
}

function matches(record, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === "$or") return expected.some((clause) => matches(record, clause));
    const actual = getPath(record, key);
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if ("$gte" in expected && actual < expected.$gte) return false;
      if ("$lte" in expected && actual > expected.$lte) return false;
      if ("$lt" in expected && actual >= expected.$lt) return false;
      if ("$ne" in expected && actual === expected.$ne) return false;
      return true;
    }
    return String(actual) === String(expected);
  });
}

class MockUser {
  constructor(id) {
    this._id = id;
    this.name = "Appointment User";
    this.email = "appointment@example.com";
  }

  get id() { return this._id; }

  static async findById(id) {
    return id === userId || id === otherUserId ? new MockUser(id) : null;
  }
}

class MockAppointment {
  constructor(data) {
    this._id = data._id ?? (nextAppointmentId++).toString(16).padStart(24, "0");
    Object.assign(this, data);
    this.appointmentType ??= "consultation";
    this.status ??= "scheduled";
    this.reminders ??= { enabled: true };
    this.createdAt ??= now;
    this.updatedAt ??= now;
  }

  get id() { return this._id; }

  async save() {
    this.updatedAt = new Date(now);
    appointments.set(String(this._id), this);
    return this;
  }

  static find(filter) {
    return new MockQuery([...appointments.values()].filter((item) => matches(item, filter)));
  }

  static countDocuments(filter) {
    return Promise.resolve([...appointments.values()].filter((item) => matches(item, filter)).length);
  }

  static async findOne(filter) {
    return [...appointments.values()].find((item) => matches(item, filter)) ?? null;
  }

  static async exists(filter) {
    return [...appointments.values()].some((item) => matches(item, filter));
  }

  static async findOneAndDelete(filter) {
    const item = [...appointments.values()].find((value) => matches(value, filter));
    if (item) appointments.delete(String(item._id));
    return item ?? null;
  }
}

class MockQuery {
  constructor(items) { this.items = items; }
  select() { return this; }
  sort(sortBy) {
    const [[field, direction]] = Object.entries(sortBy);
    this.items.sort((left, right) => (left[field] - right[field]) * direction);
    return this;
  }
  skip(count) { this.items = this.items.slice(count); return this; }
  limit(count) { this.items = this.items.slice(0, count); return this; }
  then(resolve, reject) { return Promise.resolve(this.items).then(resolve, reject); }
}

const notificationUpdateMany = jest.fn(async () => ({ deletedCount: 0 }));
const MockNotification = {
  async updateOne(filter, update, options = {}) {
    if (filter.idempotencyKey) {
      const existing = notifications.get(filter.idempotencyKey);
      if (existing) return { upsertedCount: 0 };
      if (!options.upsert) return { matchedCount: 0 };
      notifications.set(filter.idempotencyKey, {
        _id: `${notifications.size + 1}`.padStart(24, "0"),
        ...update.$setOnInsert,
        pushAttemptCount: 0,
        createdAt: now
      });
      return { upsertedCount: 1 };
    }

    const item = [...notifications.values()].find((value) => matches(value, filter));
    if (item) Object.assign(item, update.$set);
    return { matchedCount: item ? 1 : 0 };
  },
  async findOne(filter) {
    return [...notifications.values()].find((item) => matches(item, filter)) ?? null;
  },
  async findOneAndUpdate(filter, update) {
    const item = [...notifications.values()].find((value) => (
      String(value._id) === String(filter._id)
      && String(value.user) === String(filter.user)
      && value.pushAttemptCount < filter.pushAttemptCount.$lt
      && filter.$or.some((clause) => clause.pushDeliveryStatus?.$in?.includes(value.pushDeliveryStatus))
    ));
    if (!item) return null;
    Object.assign(item, update.$set);
    item.pushAttemptCount += update.$inc.pushAttemptCount;
    return item;
  },
  deleteMany: notificationUpdateMany,
  async deleteOne(filter) {
    const item = [...notifications.entries()].find(([, value]) => matches(value, filter));
    if (item) notifications.delete(item[0]);
    return { deletedCount: item ? 1 : 0 };
  },
  find() {
    return new MockQuery([]);
  }
};

jest.unstable_mockModule("../src/models/User.js", () => ({ User: MockUser }));
jest.unstable_mockModule("../src/models/Appointment.js", () => ({ Appointment: MockAppointment }));
jest.unstable_mockModule("../src/models/Notification.js", () => ({ Notification: MockNotification }));
const sendMinimalPushToUser = jest.fn(async () => ({ status: "sent" }));
jest.unstable_mockModule("../src/services/push.service.js", () => ({
  hasVapidConfiguration: () => true,
  MAX_PUSH_ATTEMPTS: 3,
  sendMinimalPushToUser,
  getPushPublicKey: () => null,
  registerPushSubscription: jest.fn(),
  deletePushSubscription: jest.fn()
}));

const { app } = await import("../src/app.js");
const { createDueAppointmentReminders } = await import("../src/services/appointmentReminder.service.js");

const appointmentInput = {
  doctorName: "Dr Example",
  clinicName: "Local clinic",
  location: "Main Street",
  appointmentType: "consultation",
  scheduledAt: "2026-10-28T12:00:00.000Z",
  timezone: "Asia/Kolkata",
  notes: "Private appointment notes",
  reminders: { enabled: true }
};

function authCookie(id = userId) {
  const token = jwt.sign({ sub: id }, env.JWT_SECRET, { expiresIn: "1h" });
  return `meditrack_auth=${token}`;
}

function seedAppointment(id, owner, overrides = {}) {
  const appointment = new MockAppointment({
    ...appointmentInput,
    _id: id,
    user: owner,
    scheduledAt: new Date(appointmentInput.scheduledAt),
    createdAt: now,
    updatedAt: now,
    ...overrides
  });
  appointments.set(id, appointment);
  return appointment;
}

describe("appointment routes and reminders", () => {
  beforeEach(() => {
    appointments.clear();
    notifications.clear();
    nextAppointmentId = 1;
    notificationUpdateMany.mockClear();
    notificationUpdateMany.mockImplementation(async (filter) => {
      for (const [key, notification] of notifications) {
        if (matches(notification, filter)) notifications.delete(key);
      }
      return { deletedCount: 0 };
    });
    sendMinimalPushToUser.mockReset();
    sendMinimalPushToUser.mockResolvedValue({ status: "sent" });
  });

  it("creates an appointment and never returns notes or owner identity", async () => {
    const response = await request(app)
      .post("/api/v1/appointments")
      .set("Cookie", authCookie())
      .send({
        ...appointmentInput,
        reminders: { enabled: true, leadHours: [24, 1] }
      });

    expect(response.status).toBe(201);
    expect(response.body.appointment).toMatchObject({
      doctorName: "Dr Example",
      appointmentType: "consultation",
      status: "scheduled",
      reminders: { enabled: true, leadHours: [24, 1] }
    });
    expect(response.body.appointment).not.toHaveProperty("notes");
    expect(response.body.appointment).not.toHaveProperty("user");
    expect([...appointments.values()][0].user).toBe(userId);
  });

  it("rejects invalid date, timezone, empty names, and client-supplied ownership", async () => {
    for (const invalid of [
      { ...appointmentInput, scheduledAt: "not-a-date" },
      { ...appointmentInput, timezone: "Mars/Olympus" },
      { ...appointmentInput, doctorName: "  " },
      { ...appointmentInput, reminders: { enabled: true, leadHours: [0] } },
      { ...appointmentInput, user: otherUserId }
    ]) {
      const response = await request(app)
        .post("/api/v1/appointments")
        .set("Cookie", authCookie())
        .send(invalid);
      expect(response.status).toBe(400);
    }
    expect(appointments.size).toBe(0);
  });

  it("requires authentication on appointment endpoints", async () => {
    const response = await request(app).get("/api/v1/appointments");
    expect(response.status).toBe(401);
  });

  it("lists only owned appointments with filters and pagination", async () => {
    seedAppointment(appointmentId, userId, {
      scheduledAt: new Date("2026-10-28T12:00:00.000Z")
    });
    seedAppointment("cccccccccccccccccccccccc", userId, {
      scheduledAt: new Date("2026-10-29T12:00:00.000Z")
    });
    seedAppointment(otherAppointmentId, otherUserId, {
      scheduledAt: new Date("2026-10-29T12:00:00.000Z")
    });
    seedAppointment("dddddddddddddddddddddddd", userId, {
      scheduledAt: new Date("2026-10-26T12:00:00.000Z"),
      status: "completed"
    });

    const response = await request(app)
      .get("/api/v1/appointments?status=scheduled&period=upcoming&page=1&limit=1")
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body.appointments).toHaveLength(1);
    expect(response.body.appointments[0].id).toBe(appointmentId);
    expect(response.body.pagination).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(response.body.appointments[0]).not.toHaveProperty("notes");

    const pastCompleted = await request(app)
      .get("/api/v1/appointments?status=completed&period=past&page=1&limit=10")
      .set("Cookie", authCookie());

    expect(pastCompleted.status).toBe(200);
    expect(pastCompleted.body.appointments).toHaveLength(1);
    expect(pastCompleted.body.appointments[0].id).toBe("dddddddddddddddddddddddd");
    expect(pastCompleted.body.pagination).toMatchObject({ total: 1, totalPages: 1 });
  });

  it("rejects malformed list query parameters", async () => {
    const response = await request(app)
      .get("/api/v1/appointments?page=0&unknown=true")
      .set("Cookie", authCookie());
    expect(response.status).toBe(400);
  });

  it("retrieves, updates, and deletes only owned appointments", async () => {
    seedAppointment(appointmentId, userId);
    seedAppointment(otherAppointmentId, otherUserId);

    const retrieved = await request(app)
      .get(`/api/v1/appointments/${appointmentId}`)
      .set("Cookie", authCookie());
    expect(retrieved.status).toBe(200);

    const forbiddenRead = await request(app)
      .get(`/api/v1/appointments/${otherAppointmentId}`)
      .set("Cookie", authCookie());
    expect(forbiddenRead.status).toBe(404);

    const forbiddenUpdate = await request(app)
      .patch(`/api/v1/appointments/${otherAppointmentId}`)
      .set("Cookie", authCookie())
      .send({ doctorName: "Changed doctor" });
    expect(forbiddenUpdate.status).toBe(404);
    expect(appointments.get(otherAppointmentId).doctorName).toBe("Dr Example");

    const ownerChange = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}`)
      .set("Cookie", authCookie())
      .send({ user: otherUserId });
    expect(ownerChange.status).toBe(400);
    expect(appointments.get(appointmentId).user).toBe(userId);

    const updated = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}`)
      .set("Cookie", authCookie())
      .send({ doctorName: "Dr Updated" });
    expect(updated.status).toBe(200);
    expect(updated.body.appointment.doctorName).toBe("Dr Updated");

    const deleted = await request(app)
      .delete(`/api/v1/appointments/${appointmentId}`)
      .set("Cookie", authCookie());
    expect(deleted.status).toBe(204);
    expect(appointments.has(appointmentId)).toBe(false);
  });

  it("rejects malformed appointment IDs and returns 404 for nonexistent IDs", async () => {
    const malformed = await request(app)
      .get("/api/v1/appointments/not-an-id")
      .set("Cookie", authCookie());
    expect(malformed.status).toBe(400);

    const missing = await request(app)
      .get("/api/v1/appointments/cccccccccccccccccccccccc")
      .set("Cookie", authCookie());
    expect(missing.status).toBe(404);
  });

  it("creates timezone-formatted reminders at configured lead times once", async () => {
    const appointment = seedAppointment(appointmentId, userId, {
      scheduledAt: new Date(now.getTime() + 24 * 60 * 60 * 1000)
    });

    expect(await createDueAppointmentReminders({ now })).toBe(1);
    expect(await createDueAppointmentReminders({ now })).toBe(0);
    expect(notifications.size).toBe(1);
    const notification = [...notifications.values()][0];
    expect(notification).toMatchObject({
      type: "appointment_reminder",
      title: "Appointment reminder",
      relatedAppointment: appointmentId,
      pushDeliveryStatus: "sent"
    });
    expect(notification.message).toContain("Oct 28, 2026");
    expect(notification.message).toContain("5:30 PM");
    expect(notification.message).toContain("Asia/Kolkata");
    expect(notification.message).not.toContain("Private appointment notes");
    expect(sendMinimalPushToUser).toHaveBeenCalledTimes(1);
    expect(sendMinimalPushToUser.mock.calls[0][1].body).toBe(notification.message);
  });

  it("uses each appointment's reminder preferences and catches up after a missed interval", async () => {
    seedAppointment(appointmentId, userId, {
      scheduledAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      reminders: { enabled: true, leadHours: [3] }
    });

    expect(await createDueAppointmentReminders({ now, defaultLeadHours: [24, 1] })).toBe(1);
    expect([...notifications.values()][0].idempotencyKey).toContain(":3");
  });

  it.each(["cancelled", "completed"])("suppresses reminders for %s appointments", async (status) => {
    seedAppointment(appointmentId, userId, {
      scheduledAt: new Date(now.getTime() + 60 * 60 * 1000),
      status
    });
    expect(await createDueAppointmentReminders({ now })).toBe(0);
    expect(notifications.size).toBe(0);
  });

  it("does not create reminders when they are disabled", async () => {
    seedAppointment(appointmentId, userId, {
      scheduledAt: new Date(now.getTime() + 60 * 60 * 1000),
      reminders: { enabled: false }
    });
    expect(await createDueAppointmentReminders({ now, defaultLeadHours: [1] })).toBe(0);
    expect(notifications.size).toBe(0);
  });

  it("removes obsolete reminders when an appointment is rescheduled", async () => {
    seedAppointment(appointmentId, userId, {
      scheduledAt: new Date(now.getTime() + 60 * 60 * 1000)
    });
    await createDueAppointmentReminders({ now, defaultLeadHours: [1] });
    expect(notifications.size).toBe(1);

    const response = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}`)
      .set("Cookie", authCookie())
      .send({ scheduledAt: "2026-10-30T12:00:00.000Z" });

    expect(response.status).toBe(200);
    expect(notifications.size).toBe(0);
  });

  it.each(["cancelled", "completed"])("clears pending reminders when marked %s", async (status) => {
    seedAppointment(appointmentId, userId, {
      scheduledAt: new Date(now.getTime() + 60 * 60 * 1000)
    });
    await createDueAppointmentReminders({ now, defaultLeadHours: [1] });
    expect(notifications.size).toBe(1);

    const response = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}`)
      .set("Cookie", authCookie())
      .send({ status });

    expect(response.status).toBe(200);
    expect(notifications.size).toBe(0);
  });

  it("retains in-app reminders when push delivery fails", async () => {
    seedAppointment(appointmentId, userId, {
      scheduledAt: new Date(now.getTime() + 60 * 60 * 1000)
    });
    sendMinimalPushToUser.mockRejectedValue(new Error("private provider details"));

    expect(await createDueAppointmentReminders({ now, defaultLeadHours: [1] })).toBe(1);
    expect(notifications.size).toBe(1);
    expect([...notifications.values()][0]).toMatchObject({
      type: "appointment_reminder",
      pushDeliveryStatus: "failed"
    });
  });
});
