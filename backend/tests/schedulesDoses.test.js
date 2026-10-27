import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import { env } from "../src/config/env.js";
import { localDateString } from "../src/utils/scheduleTime.js";

const userId = "111111111111111111111111";
const otherUserId = "222222222222222222222222";
const medicineId = "333333333333333333333333";
const otherMedicineId = "444444444444444444444444";
const scheduleId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const otherScheduleId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const doseId = "cccccccccccccccccccccccc";
const otherDoseId = "dddddddddddddddddddddddd";
const schedules = new Map();
const doses = new Map();
const medicines = new Map();
let nextId = 1;

function isMatch(record, filter) {
  if (!record) return false;
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "$or") {
      if (!expected.some((clause) => isMatch(record, clause))) return false;
    } else if (expected && typeof expected === "object" && !(expected instanceof Date) && !Array.isArray(expected)) {
      if ("$gte" in expected && record[key] < expected.$gte) return false;
      if ("$lte" in expected && record[key] > expected.$lte) return false;
      if ("$gt" in expected && record[key] <= expected.$gt) return false;
      if ("$lt" in expected && record[key] >= expected.$lt) return false;
      if ("$in" in expected && !expected.$in.map(String).includes(String(record[key]))) return false;
      if ("$exists" in expected && (record[key] !== undefined) !== expected.$exists) return false;
    } else if (String(record[key]) !== String(expected)) {
      return false;
    }
  }
  return true;
}

function queryResult(records) {
  return {
    sort(sortBy) {
      const [[field, direction]] = Object.entries(sortBy);
      records.sort((left, right) => (left[field] - right[field]) * direction);
      return Promise.resolve(records);
    },
    then(resolve, reject) {
      return Promise.resolve(records).then(resolve, reject);
    }
  };
}

class MockUser {
  constructor(id) {
    this._id = id;
    this.id = id;
    this.name = "Schedule Test User";
    this.email = "schedule@example.com";
    this.createdAt = new Date();
    this.updatedAt = this.createdAt;
  }

  static async findById(id) {
    return [userId, otherUserId].includes(String(id)) ? new MockUser(String(id)) : null;
  }
}

class MockMedicine {
  static async findOne(filter) {
    return [...medicines.values()].find((medicine) => isMatch(medicine, filter)) ?? null;
  }
}

class MockSchedule {
  constructor(data) {
    this._id = (nextId++).toString(16).padStart(24, "0");
    Object.assign(this, data);
    this.daysOfWeek ??= [];
    this.isActive ??= true;
    this.createdAt = new Date();
    this.updatedAt = this.createdAt;
  }

  get id() { return this._id; }

  async validate() {
    if (this.endDate && this.endDate < this.startDate) {
      const error = new Error("endDate must not precede startDate");
      error.name = "ValidationError";
      error.errors = { endDate: { message: error.message } };
      throw error;
    }
    if (this.frequency === "selected_days" && !this.daysOfWeek.length) {
      const error = new Error("daysOfWeek is required");
      error.name = "ValidationError";
      error.errors = { daysOfWeek: { message: error.message } };
      throw error;
    }
  }

  async save() {
    await this.validate();
    this.updatedAt = new Date();
    schedules.set(String(this._id), this);
    return this;
  }

  static find(filter) {
    return queryResult([...schedules.values()].filter((schedule) => isMatch(schedule, filter)));
  }

  static async findOne(filter) {
    return [...schedules.values()].find((schedule) => isMatch(schedule, filter)) ?? null;
  }

  static async deleteOne(filter) {
    const schedule = [...schedules.values()].find((value) => isMatch(value, filter));
    if (schedule) schedules.delete(String(schedule._id));
    return { deletedCount: schedule ? 1 : 0 };
  }
}

class MockDose {
  constructor(data) {
    this._id = (nextId++).toString(16).padStart(24, "0");
    Object.assign(this, data);
    this.createdAt = new Date();
    this.updatedAt = this.createdAt;
  }

  get id() { return this._id; }

  static async bulkWrite(operations) {
    for (const { updateOne } of operations) {
      const existing = [...doses.values()].find((dose) => (
        String(dose.schedule) === String(updateOne.filter.schedule)
        && dose.scheduledFor.getTime() === updateOne.filter.scheduledFor.getTime()
      ));
      if (!existing && updateOne.upsert) {
        const dose = new MockDose(updateOne.update.$setOnInsert);
        doses.set(String(dose._id), dose);
      }
    }
    return {};
  }

  static async updateMany(filter, update) {
    for (const dose of doses.values()) {
      if (isMatch(dose, filter)) Object.assign(dose, update.$set);
    }
  }

  static async deleteMany(filter) {
    let deletedCount = 0;
    for (const [id, dose] of doses) {
      if (isMatch(dose, filter)) {
        doses.delete(id);
        deletedCount += 1;
      }
    }
    return { deletedCount };
  }

  static find(filter) {
    return queryResult([...doses.values()].filter((dose) => isMatch(dose, filter)));
  }

  static async findOne(filter) {
    return [...doses.values()].find((dose) => isMatch(dose, filter)) ?? null;
  }

  static async findOneAndUpdate(filter, update) {
    const dose = [...doses.values()].find((value) => isMatch(value, filter));
    if (!dose) return null;
    Object.assign(dose, update.$set);
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) delete dose[key];
    }
    dose.updatedAt = new Date();
    return dose;
  }
}

jest.unstable_mockModule("../src/models/User.js", () => ({ User: MockUser }));
jest.unstable_mockModule("../src/models/Medicine.js", () => ({ Medicine: MockMedicine }));
jest.unstable_mockModule("../src/models/Schedule.js", () => ({ Schedule: MockSchedule }));
jest.unstable_mockModule("../src/models/Dose.js", () => ({ Dose: MockDose }));
jest.unstable_mockModule("../src/models/Notification.js", () => ({
  Notification: { deleteMany: jest.fn(async () => ({ deletedCount: 0 })) }
}));

const { app } = await import("../src/app.js");

const now = new Date();
const today = now.toISOString().slice(0, 10);
const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const validSchedule = {
  medicine: medicineId,
  doseAmount: 1,
  doseUnit: "tablet",
  frequency: "daily",
  times: ["09:00"],
  startDate: today,
  timezone: "UTC"
};

function authCookie(owner = userId) {
  const token = jwt.sign({ sub: owner }, env.JWT_SECRET, { expiresIn: "1h" });
  return `meditrack_auth=${token}`;
}

function seedMedicine(id = medicineId, owner = userId) {
  medicines.set(id, { _id: id, user: owner });
}

function seedSchedule(id, owner = userId, data = {}) {
  const schedule = new MockSchedule({
    ...validSchedule,
    ...data,
    _id: id,
    user: owner,
    startDate: data.startDate ?? new Date(`${today}T00:00:00.000Z`),
    times: data.times ?? ["09:00"]
  });
  schedules.set(id, schedule);
  return schedule;
}

function seedDose(id, owner = userId, status = "upcoming", schedule = scheduleId, scheduledFor = new Date()) {
  const dose = new MockDose({
    _id: id,
    user: owner,
    medicine: medicineId,
    schedule,
    scheduledFor,
    localDate: today,
    timezone: "UTC",
    status
  });
  doses.set(id, dose);
  return dose;
}

describe("schedule and dose routes", () => {
  beforeEach(() => {
    schedules.clear();
    doses.clear();
    medicines.clear();
    nextId = 1;
    seedMedicine();
    seedMedicine(otherMedicineId, otherUserId);
  });

  it("creates an owned schedule and rejects a client-supplied owner ID", async () => {
    const response = await request(app)
      .post("/api/v1/schedules")
      .set("Cookie", authCookie())
      .send({ ...validSchedule, user: otherUserId });
    expect(response.status).toBe(400);

    const created = await request(app)
      .post("/api/v1/schedules")
      .set("Cookie", authCookie())
      .send(validSchedule);
    expect(created.status).toBe(201);
    expect(created.body.schedule).toMatchObject({
      medicine: medicineId,
      frequency: "daily",
      timezone: "UTC"
    });

    expect([...schedules.values()][0].user).toBe(userId);
  });

  it("accepts and serializes per-schedule reminder preferences", async () => {
    const response = await request(app)
      .post("/api/v1/schedules")
      .set("Cookie", authCookie())
      .send({
        ...validSchedule,
        reminders: { enabled: true, leadMinutes: 45 }
      });

    expect(response.status).toBe(201);
    expect(response.body.schedule.reminders).toMatchObject({
      enabled: true,
      leadMinutes: 45
    });
  });

  it("validates schedule values, selected weekdays, duplicate times, and timezone", async () => {
    const response = await request(app)
      .post("/api/v1/schedules")
      .set("Cookie", authCookie())
      .send({
        ...validSchedule,
        frequency: "selected_days",
        times: ["25:99", "25:99"],
        daysOfWeek: [],
        doseAmount: 0,
        timezone: "Not/AZone"
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("doseAmount");
    expect(response.body.error.message).toContain("times");
    expect(response.body.error.message).toContain("daysOfWeek");
    expect(response.body.error.message).toContain("timezone");
  });

  it("rejects a schedule whose medicine is not owned by the user", async () => {
    const response = await request(app)
      .post("/api/v1/schedules")
      .set("Cookie", authCookie())
      .send({ ...validSchedule, medicine: otherMedicineId });
    expect(response.status).toBe(404);
  });

  it("requires authentication for schedule and dose routes", async () => {
    const schedule = await request(app).get("/api/v1/schedules");
    const dosesResponse = await request(app).get("/api/v1/doses/today");
    expect(schedule.status).toBe(401);
    expect(dosesResponse.status).toBe(401);
  });

  it("lists only owned schedules and supports a validated active filter", async () => {
    seedSchedule(scheduleId);
    seedSchedule(otherScheduleId, otherUserId);
    const response = await request(app)
      .get("/api/v1/schedules?isActive=true")
      .set("Cookie", authCookie());
    expect(response.status).toBe(200);
    expect(response.body.schedules).toHaveLength(1);
    expect(response.body.schedules[0].id).toBe(scheduleId);
  });

  it("retrieves, updates, and deletes only an owned schedule", async () => {
    seedSchedule(scheduleId);
    seedSchedule(otherScheduleId, otherUserId);
    seedDose(doseId, userId, "taken", scheduleId, new Date(Date.now() - 24 * 60 * 60 * 1000));
    seedDose(otherDoseId, userId, "upcoming", scheduleId, new Date(Date.now() + 24 * 60 * 60 * 1000));
    const cookie = authCookie();

    const retrieved = await request(app)
      .get(`/api/v1/schedules/${scheduleId}`)
      .set("Cookie", cookie);
    expect(retrieved.status).toBe(200);

    const updated = await request(app)
      .patch(`/api/v1/schedules/${scheduleId}`)
      .set("Cookie", cookie)
      .send({ times: ["10:30"] });
    expect(updated.status).toBe(200);
    expect(updated.body.schedule.times).toEqual(["10:30"]);

    const foreign = await request(app)
      .patch(`/api/v1/schedules/${otherScheduleId}`)
      .set("Cookie", cookie)
      .send({ times: ["11:30"] });
    expect(foreign.status).toBe(404);

    const deleted = await request(app)
      .delete(`/api/v1/schedules/${scheduleId}`)
      .set("Cookie", cookie);
    expect(deleted.status).toBe(204);
    expect(schedules.has(scheduleId)).toBe(false);
    expect(doses.has(doseId)).toBe(true);
    expect(doses.has(otherDoseId)).toBe(false);
  });

  it("rejects malformed schedule IDs", async () => {
    const response = await request(app)
      .get("/api/v1/schedules/not-an-id")
      .set("Cookie", authCookie());
    expect(response.status).toBe(400);
  });

  it("generates daily and multiple-time occurrences within configured dates", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    seedSchedule(scheduleId, userId, {
      startDate: new Date(`${yesterday}T00:00:00.000Z`),
      endDate: new Date(`${today}T00:00:00.000Z`),
      times: ["08:00", "20:00"],
      frequency: "multiple_daily"
    });
    const response = await request(app)
      .get(`/api/v1/doses?startDate=${yesterday}&endDate=${today}`)
      .set("Cookie", authCookie());
    expect(response.status).toBe(200);
    expect(response.body.doses).toHaveLength(4);
    expect(response.body.doses.every((dose) => ["upcoming", "missed"].includes(dose.status))).toBe(true);
  });

  it("generates selected weekdays and respects schedule start and end dates", async () => {
    const weekday = new Date(`${tomorrow}T00:00:00.000Z`).getUTCDay();
    seedSchedule(scheduleId, userId, {
      frequency: "selected_days",
      daysOfWeek: [weekday],
      startDate: new Date(`${tomorrow}T00:00:00.000Z`),
      endDate: new Date(`${tomorrow}T00:00:00.000Z`)
    });
    const response = await request(app)
      .get(`/api/v1/doses?startDate=${today}&endDate=${tomorrow}`)
      .set("Cookie", authCookie());
    expect(response.status).toBe(200);
    expect(response.body.doses).toHaveLength(1);
    expect(response.body.doses[0].localDate).toBe(tomorrow);
  });

  it("prevents duplicate dose generation and preserves completed history", async () => {
    seedSchedule(scheduleId);
    seedDose(doseId, userId, "taken", scheduleId, new Date(`${today}T09:00:00.000Z`));
    const endpoint = `/api/v1/doses?startDate=${today}&endDate=${today}`;
    await request(app).get(endpoint).set("Cookie", authCookie());
    const second = await request(app).get(endpoint).set("Cookie", authCookie());
    expect(second.status).toBe(200);
    expect(doses.size).toBe(1);
    expect(doses.get(doseId).status).toBe("taken");
  });

  it("returns today doses for active schedules in their local timezone", async () => {
    const localToday = localDateString(new Date(), "America/Los_Angeles");
    seedSchedule(scheduleId, userId, {
      timezone: "America/Los_Angeles",
      startDate: new Date(`${localToday}T00:00:00.000Z`)
    });
    const response = await request(app)
      .get("/api/v1/doses/today")
      .set("Cookie", authCookie());
    expect(response.status).toBe(200);
    expect(response.body.doses).toHaveLength(1);
    expect(response.body.doses[0].timezone).toBe("America/Los_Angeles");
  });

  it("updates only allowed status transitions and sets takenAt", async () => {
    seedDose(doseId, userId, "upcoming");
    const taken = await request(app)
      .patch(`/api/v1/doses/${doseId}/status`)
      .set("Cookie", authCookie())
      .send({ status: "taken" });
    expect(taken.status).toBe(200);
    expect(taken.body.dose.status).toBe("taken");
    expect(taken.body.dose.takenAt).toBeTruthy();

    const invalidTransition = await request(app)
      .patch(`/api/v1/doses/${doseId}/status`)
      .set("Cookie", authCookie())
      .send({ status: "skipped" });
    expect(invalidTransition.status).toBe(409);
  });

  it("allows an upcoming dose to be skipped", async () => {
    seedDose(doseId, userId, "upcoming");
    const response = await request(app)
      .patch(`/api/v1/doses/${doseId}/status`)
      .set("Cookie", authCookie())
      .send({ status: "skipped", notes: "User skipped this dose" });
    expect(response.status).toBe(200);
    expect(response.body.dose.status).toBe("skipped");
    expect(response.body.dose.notes).toBe("User skipped this dose");
    expect(response.body.dose).not.toHaveProperty("takenAt");
  });

  it("allows missed doses to be taken or skipped and clears takenAt when skipped", async () => {
    seedDose(doseId, userId, "missed");
    const taken = await request(app)
      .patch(`/api/v1/doses/${doseId}/status`)
      .set("Cookie", authCookie())
      .send({ status: "taken" });
    expect(taken.status).toBe(200);
    expect(taken.body.dose.takenAt).toBeTruthy();

    seedDose(otherDoseId, userId, "missed");
    const skipped = await request(app)
      .patch(`/api/v1/doses/${otherDoseId}/status`)
      .set("Cookie", authCookie())
      .send({ status: "skipped" });
    expect(skipped.status).toBe(200);
    expect(skipped.body.dose.status).toBe("skipped");
    expect(skipped.body.dose).not.toHaveProperty("takenAt");
  });

  it("prevents dose updates across users and returns 404 for nonexistent doses", async () => {
    seedDose(otherDoseId, otherUserId);
    const response = await request(app)
      .patch(`/api/v1/doses/${otherDoseId}/status`)
      .set("Cookie", authCookie())
      .send({ status: "taken" });
    expect(response.status).toBe(404);

    const nonexistent = await request(app)
      .patch(`/api/v1/doses/${doseId}/status`)
      .set("Cookie", authCookie())
      .send({ status: "taken" });
    expect(nonexistent.status).toBe(404);
  });

  it("validates dose IDs and date-range queries", async () => {
    const malformed = await request(app)
      .patch("/api/v1/doses/not-an-id/status")
      .set("Cookie", authCookie())
      .send({ status: "taken" });
    const invalidRange = await request(app)
      .get("/api/v1/doses?startDate=2026-02-31&endDate=2026-02-01")
      .set("Cookie", authCookie());
    expect(malformed.status).toBe(400);
    expect(invalidRange.status).toBe(400);
  });
});
