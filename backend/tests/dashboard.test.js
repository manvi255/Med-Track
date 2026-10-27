import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import { env } from "../src/config/env.js";
import { localDateString } from "../src/utils/scheduleTime.js";

const userId = "111111111111111111111111";
const otherUserId = "222222222222222222222222";
const medicineId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const otherMedicineId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const scheduleId = "cccccccccccccccccccccccc";
const now = new Date("2026-10-27T12:00:00.000Z");
let medicines = [];
let doses = [];
let schedules = [];
let appointments = [];
const captured = { doseMatches: [], appointmentMatches: [], medicineMatches: [] };

function matches(record, query) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = record[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      const hasQueryOperator = ["$gte", "$lt", "$lte", "$in"]
        .some((operator) => operator in expected);
      if (!hasQueryOperator) return String(actual) === String(expected);
      if ("$gte" in expected && actual < expected.$gte) return false;
      if ("$lt" in expected && actual >= expected.$lt) return false;
      if ("$lte" in expected && actual > expected.$lte) return false;
      if ("$in" in expected && !expected.$in.includes(actual)) return false;
      return true;
    }
    return String(actual) === String(expected);
  });
}

function groupByLocalDate(items, timezone) {
  const grouped = new Map();
  for (const dose of items) {
    const date = localDateString(dose.scheduledFor, timezone);
    const stat = grouped.get(date) ?? {
      _id: date,
      scheduled: 0,
      taken: 0,
      skipped: 0,
      missed: 0,
      eligibleScheduled: 0,
      eligibleTaken: 0
    };
    stat.scheduled += 1;
    if (["taken", "skipped", "missed"].includes(dose.status)) stat[dose.status] += 1;
    if (dose.scheduledFor < now && ["taken", "skipped", "missed"].includes(dose.status)) {
      stat.eligibleScheduled += 1;
      if (dose.status === "taken") stat.eligibleTaken += 1;
    }
    grouped.set(date, stat);
  }
  return [...grouped.values()];
}

function evaluateDoseAggregation(pipeline) {
  const match = pipeline.find((stage) => stage.$match)?.$match;
  captured.doseMatches.push(match);
  const filtered = doses.filter((dose) => matches(dose, match));
  const group = pipeline.find((stage) => stage.$group)?.$group;
  if (group?._id?.$dateToString) {
    return groupByLocalDate(filtered, group._id.$dateToString.timezone);
  }

  const stat = {
    dosesScheduledToday: filtered.length,
    dosesTakenToday: filtered.filter((dose) => dose.status === "taken").length,
    dosesUpcomingToday: filtered.filter((dose) => dose.status === "upcoming").length,
    dosesSkippedToday: filtered.filter((dose) => dose.status === "skipped").length,
    dosesMissedToday: filtered.filter((dose) => dose.status === "missed").length,
    eligibleScheduled: filtered.filter((dose) => (
      dose.scheduledFor < now && ["taken", "skipped", "missed"].includes(dose.status)
    )).length,
    eligibleTaken: filtered.filter((dose) => dose.scheduledFor < now && dose.status === "taken").length
  };
  return filtered.length ? [stat] : [];
}

class MockUser {
  constructor(id) {
    this._id = id;
    this.name = "Dashboard User";
    this.email = "dashboard@example.com";
  }
  get id() { return this._id; }
  static async findById(id) {
    return id === userId || id === otherUserId ? new MockUser(id) : null;
  }
}

class MockQuery {
  constructor(values) { this.values = values; }
  select() { return this; }
  sort(order) {
    const [[field, direction]] = Object.entries(order);
    this.values.sort((left, right) => (left[field] - right[field]) * direction);
    return this;
  }
  skip(count) { this.values = this.values.slice(count); return this; }
  limit(count) { this.values = this.values.slice(0, count); return this; }
  populate(populations) {
    for (const dose of this.values) {
      const medicinePopulation = populations.find(({ path }) => path === "medicine");
      const schedulePopulation = populations.find(({ path }) => path === "schedule");
      const medicine = medicines.find((item) => String(item._id) === String(dose.medicine));
      const schedule = schedules.find((item) => String(item._id) === String(dose.schedule));
      dose.medicine = medicine && matches(medicine, medicinePopulation.match)
        ? { name: medicine.name }
        : null;
      dose.schedule = schedule && matches(schedule, schedulePopulation.match)
        ? { doseAmount: schedule.doseAmount, doseUnit: schedule.doseUnit }
        : null;
    }
    return this;
  }
  then(resolve, reject) { return Promise.resolve(this.values).then(resolve, reject); }
}

const MockMedicine = {
  countDocuments(filter) {
    captured.medicineMatches.push(filter);
    return Promise.resolve(medicines.filter((medicine) => matches(medicine, filter)).length);
  }
};

const MockDose = {
  aggregate: jest.fn(async (pipeline) => evaluateDoseAggregation(pipeline)),
  find(filter) {
    captured.doseMatches.push(filter);
    return new MockQuery(doses.filter((dose) => matches(dose, filter)));
  }
};

const MockAppointment = {
  countDocuments(filter) {
    captured.appointmentMatches.push(filter);
    return Promise.resolve(appointments.filter((item) => matches(item, filter)).length);
  },
  find(filter) {
    captured.appointmentMatches.push(filter);
    return new MockQuery(appointments.filter((item) => matches(item, filter)));
  }
};

jest.unstable_mockModule("../src/models/User.js", () => ({ User: MockUser }));
jest.unstable_mockModule("../src/models/Medicine.js", () => ({ Medicine: MockMedicine }));
jest.unstable_mockModule("../src/models/Dose.js", () => ({ Dose: MockDose }));
jest.unstable_mockModule("../src/models/Appointment.js", () => ({ Appointment: MockAppointment }));

const { app } = await import("../src/app.js");
const { getDashboardAdherence } = await import("../src/services/dashboard.service.js");

function authCookie(id = userId) {
  const token = jwt.sign({ sub: id }, env.JWT_SECRET, { expiresIn: "1h" });
  return `meditrack_auth=${token}`;
}

function seedDose(id, owner, scheduledFor, status, medicine = medicineId, schedule = scheduleId) {
  doses.push({ _id: id, user: owner, scheduledFor: new Date(scheduledFor), status, medicine, schedule });
}

function resetData() {
  medicines = [];
  doses = [];
  schedules = [];
  appointments = [];
  captured.doseMatches.length = 0;
  captured.appointmentMatches.length = 0;
  captured.medicineMatches.length = 0;
}

describe("dashboard analytics routes", () => {
  beforeEach(resetData);

  it("requires authentication on each dashboard endpoint", async () => {
    for (const endpoint of ["/summary", "/adherence", "/upcoming"]) {
      const response = await request(app).get(`/api/v1/dashboard${endpoint}`);
      expect(response.status).toBe(401);
    }
  });

  it("returns zero counts and null adherence for an empty dashboard", async () => {
    const response = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      activeMedicineCount: 0,
      dosesScheduledToday: 0,
      dosesTakenToday: 0,
      dosesUpcomingToday: 0,
      dosesSkippedToday: 0,
      dosesMissedToday: 0,
      adherenceToday: null,
      upcomingAppointmentCount: 0
    });
  });

  it("rejects unrecognized summary and upcoming query parameters", async () => {
    for (const endpoint of [
      "/api/v1/dashboard/summary?timezone=UTC",
      "/api/v1/dashboard/upcoming?userId=222222222222222222222222"
    ]) {
      const response = await request(app)
        .get(endpoint)
        .set("Cookie", authCookie());
      expect(response.status).toBe(400);
    }
  });

  it("summarizes only owned active medicines, today's doses, and upcoming appointments", async () => {
    medicines = [
      { _id: medicineId, user: userId, isActive: true },
      { _id: otherMedicineId, user: otherUserId, isActive: true },
      { _id: "eeeeeeeeeeeeeeeeeeeeeeee", user: userId, isActive: false }
    ];
    seedDose("100000000000000000000001", userId, "2026-10-27T01:00:00Z", "taken");
    seedDose("100000000000000000000002", userId, "2026-10-27T10:00:00Z", "skipped");
    seedDose("100000000000000000000003", userId, "2026-10-27T13:00:00Z", "upcoming");
    seedDose("100000000000000000000004", userId, "2026-10-27T14:00:00Z", "missed");
    seedDose("100000000000000000000005", otherUserId, "2026-10-27T11:00:00Z", "taken");
    appointments = [
      { user: userId, status: "scheduled", scheduledAt: new Date("2026-10-28T12:00:00Z") },
      { user: userId, status: "completed", scheduledAt: new Date("2026-10-28T12:00:00Z") },
      { user: otherUserId, status: "scheduled", scheduledAt: new Date("2026-10-29T12:00:00Z") }
    ];

    const response = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({
      activeMedicineCount: 1,
      dosesScheduledToday: 4,
      dosesTakenToday: 1,
      dosesUpcomingToday: 1,
      dosesSkippedToday: 1,
      dosesMissedToday: 1,
      adherenceToday: 50,
      upcomingAppointmentCount: 1
    });
    expect(captured.medicineMatches[0]).toEqual({ user: userId, isActive: true });
    expect(captured.appointmentMatches[0]).toMatchObject({
      user: userId,
      status: "scheduled"
    });
    expect(String(captured.doseMatches[0].user)).toBe(userId);
  });

  it("builds correct seven-day adherence and excludes upcoming or future doses", async () => {
    seedDose("100000000000000000000001", userId, "2026-10-21T08:00:00Z", "taken");
    seedDose("100000000000000000000002", userId, "2026-10-22T08:00:00Z", "skipped");
    seedDose("100000000000000000000003", userId, "2026-10-26T08:00:00Z", "missed");
    seedDose("100000000000000000000004", userId, "2026-10-27T13:00:00Z", "upcoming");
    seedDose("100000000000000000000005", userId, "2026-10-27T13:30:00Z", "taken");
    seedDose("100000000000000000000006", otherUserId, "2026-10-26T09:00:00Z", "taken");

    const response = await request(app)
      .get("/api/v1/dashboard/adherence?period=7d")
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      period: "7d",
      startDate: "2026-10-21",
      endDate: "2026-10-27",
      overallAdherence: 33.33
    });
    expect(response.body.dailyStats).toHaveLength(7);
    expect(response.body.dailyStats[0]).toMatchObject({
      date: "2026-10-21",
      scheduled: 1,
      taken: 1,
      adherenceRate: 100
    });
    expect(response.body.dailyStats[1]).toMatchObject({
      date: "2026-10-22",
      skipped: 1,
      adherenceRate: 0
    });
    expect(response.body.dailyStats[5]).toMatchObject({
      date: "2026-10-26",
      missed: 1,
      adherenceRate: 0
    });
    expect(response.body.dailyStats[6]).toMatchObject({
      date: "2026-10-27",
      scheduled: 2,
      taken: 1,
      adherenceRate: null
    });
    expect(String(captured.doseMatches[0].user)).toBe(userId);
  });

  it("returns thirty calendar days and null rates when there are no eligible doses", async () => {
    const response = await request(app)
      .get("/api/v1/dashboard/adherence?period=30d")
      .set("Cookie", authCookie());
    expect(response.status).toBe(200);
    expect(response.body.period).toBe("30d");
    expect(response.body.startDate).toBe("2026-09-28");
    expect(response.body.endDate).toBe("2026-10-27");
    expect(response.body.dailyStats).toHaveLength(30);
    expect(response.body.overallAdherence).toBeNull();
    expect(response.body.dailyStats.every((day) => day.adherenceRate === null)).toBe(true);
  });

  it("rejects unsupported periods and unrecognized query parameters", async () => {
    for (const query of ["period=90d", "timezone=Europe%2FLondon", "userId=222222222222222222222222"]) {
      const response = await request(app)
        .get(`/api/v1/dashboard/adherence?${query}`)
        .set("Cookie", authCookie());
      expect(response.status).toBe(400);
    }
  });

  it("uses configured timezone and daylight-saving aware UTC boundaries", async () => {
    const adherence = await getDashboardAdherence(userId, "7d", {
      now: new Date("2026-11-01T12:00:00.000Z"),
      timezone: "America/New_York"
    });
    expect(adherence.startDate).toBe("2026-10-26");
    expect(adherence.endDate).toBe("2026-11-01");
    expect(captured.doseMatches.at(-1).scheduledFor.$gte.toISOString())
      .toBe("2026-10-26T04:00:00.000Z");
    expect(captured.doseMatches.at(-1).scheduledFor.$lt.toISOString())
      .toBe("2026-11-02T05:00:00.000Z");
  });

  it("returns upcoming owned doses and appointments chronologically with bounded results", async () => {
    medicines = [
      { _id: medicineId, user: userId, name: "Medicine A" },
      { _id: otherMedicineId, user: otherUserId, name: "Private medicine" }
    ];
    schedules = [{ _id: scheduleId, user: userId, doseAmount: 2, doseUnit: "tablet" }];
    seedDose("100000000000000000000001", userId, "2026-10-28T12:00:00Z", "upcoming");
    seedDose("100000000000000000000002", userId, "2026-10-28T11:00:00Z", "upcoming");
    seedDose("100000000000000000000003", userId, "2026-10-28T10:00:00Z", "taken");
    seedDose("100000000000000000000004", userId, "2026-10-28T09:00:00Z", "skipped");
    seedDose("100000000000000000000005", otherUserId, "2026-10-28T08:00:00Z", "upcoming", otherMedicineId);
    appointments = [
      {
        _id: "200000000000000000000001",
        user: userId,
        doctorName: "Dr A",
        clinicName: "Clinic A",
        scheduledAt: new Date("2026-10-29T12:00:00Z"),
        appointmentType: "consultation",
        status: "scheduled"
      },
      {
        _id: "200000000000000000000002",
        user: userId,
        doctorName: "Cancelled doctor",
        scheduledAt: new Date("2026-10-28T12:00:00Z"),
        status: "cancelled"
      },
      {
        _id: "200000000000000000000003",
        user: userId,
        doctorName: "Completed doctor",
        scheduledAt: new Date("2026-10-28T13:00:00Z"),
        status: "completed"
      }
    ];

    const response = await request(app)
      .get("/api/v1/dashboard/upcoming?limit=1")
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body.upcomingDoses).toHaveLength(1);
    expect(response.body.upcomingDoses[0]).toMatchObject({
      scheduledFor: "2026-10-28T11:00:00.000Z",
      status: "upcoming",
      medicineName: "Medicine A",
      doseAmount: 2,
      doseUnit: "tablet"
    });
    expect(response.body.upcomingDoses[0]).not.toHaveProperty("notes");
    expect(response.body.upcomingAppointments).toHaveLength(1);
    expect(response.body.upcomingAppointments[0].doctorName).toBe("Dr A");
    expect(response.body.upcomingAppointments[0]).not.toHaveProperty("notes");
    expect(captured.doseMatches.at(-1).user).toBe(userId);
    expect(captured.appointmentMatches.at(-1).user).toBe(userId);
    expect(
      captured.doseMatches.at(-1).scheduledFor.$lt
        - captured.doseMatches.at(-1).scheduledFor.$gte
    ).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("rejects an invalid upcoming result limit", async () => {
    const response = await request(app)
      .get("/api/v1/dashboard/upcoming?limit=1000")
      .set("Cookie", authCookie());
    expect(response.status).toBe(400);
  });
});
