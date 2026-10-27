import { jest } from "@jest/globals";

const doseId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const userId = "111111111111111111111111";
const medicineId = "222222222222222222222222";
const scheduleId = "333333333333333333333333";
const now = new Date("2026-10-27T12:00:00.000Z");
const doses = [];
const schedules = [];
const medicines = [];
const notifications = new Map();
const updateMany = jest.fn(async () => ({ modifiedCount: 0 }));

function matches(record, query) {
  return Object.entries(query).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("$gte" in value && record[key] < value.$gte) return false;
      if ("$lt" in value && record[key] >= value.$lt) return false;
      if ("$in" in value && !value.$in.map(String).includes(String(record[key]))) return false;
      return true;
    }
    return String(record[key]) === String(value);
  });
}

class Query {
  constructor(values) { this.values = values; }
  select() { return this; }
  sort() { return this; }
  skip(count) { this.values = this.values.slice(count); return this; }
  limit(count) { this.values = this.values.slice(0, count); return this; }
  then(resolve, reject) { return Promise.resolve(this.values).then(resolve, reject); }
}

const MockDose = {
  find(query) {
    return new Query(doses.filter((dose) => matches(dose, query)));
  },
  async exists(query) {
    return doses.some((dose) => matches(dose, query));
  }
};

const MockSchedule = {
  find(query) {
    return new Query(schedules.filter((schedule) => query._id.$in.map(String).includes(schedule._id)));
  }
};

const MockMedicine = {
  find(query) {
    return new Query(medicines.filter((medicine) => query._id.$in.map(String).includes(medicine._id)));
  }
};

const MockNotification = {
  async updateOne(filter, update, options = {}) {
    const existing = notifications.get(filter.idempotencyKey);
    if (existing) return { upsertedCount: 0 };
    if (options.upsert) {
      notifications.set(filter.idempotencyKey, {
        _id: `${notifications.size + 1}`.padStart(24, "0"),
        ...update.$setOnInsert,
        pushAttemptCount: 0,
        createdAt: now
      });
      return { upsertedCount: 1 };
    }
    return { matchedCount: 0 };
  },
  async findOne(filter) {
    return [...notifications.values()].find((notification) => matches(notification, filter)) ?? null;
  },
  async findOneAndUpdate(filter, update) {
    const notification = [...notifications.values()].find((value) => (
      value._id === String(filter._id)
      && String(value.user) === String(filter.user)
      && value.pushAttemptCount < filter.pushAttemptCount.$lt
      && (
        filter.$or.some((clause) => clause.pushDeliveryStatus?.$in?.includes(value.pushDeliveryStatus))
      )
    ));
    if (!notification) return null;
    Object.assign(notification, update.$set);
    notification.pushAttemptCount += update.$inc.pushAttemptCount;
    return notification;
  },
  updateMany,
  find() { return new Query([]); },
  async updateOneStatus(filter, update) {
    const notification = [...notifications.values()].find((value) => value._id === String(filter._id));
    if (notification) Object.assign(notification, update.$set);
  }
};

jest.unstable_mockModule("../src/models/Dose.js", () => ({ Dose: MockDose }));
jest.unstable_mockModule("../src/models/Schedule.js", () => ({ Schedule: MockSchedule }));
jest.unstable_mockModule("../src/models/Medicine.js", () => ({ Medicine: MockMedicine }));
jest.unstable_mockModule("../src/models/Notification.js", () => ({
  Notification: {
    ...MockNotification,
    updateOne: async (filter, update, options) => {
      if (filter.pushDeliveryStatus) return MockNotification.updateOneStatus(filter, update);
      return MockNotification.updateOne(filter, update, options);
    }
  }
}));
const sendMinimalPushToUser = jest.fn(async () => ({ status: "sent" }));
jest.unstable_mockModule("../src/services/push.service.js", () => ({
  hasVapidConfiguration: () => true,
  MAX_PUSH_ATTEMPTS: 3,
  sendMinimalPushToUser
}));

const {
  createDueDoseReminders,
  retryPendingPushDeliveries
} = await import("../src/services/notification.service.js");

function seedEligibleDose(id = doseId, overrides = {}) {
  const scheduledFor = new Date(now.getTime() + 15 * 60 * 1000);
  const dose = {
    _id: id,
    user: userId,
    medicine: medicineId,
    schedule: scheduleId,
    scheduledFor,
    localDate: "2026-10-27",
    timezone: "UTC",
    status: "upcoming",
    ...overrides
  };
  doses.push(dose);
  schedules.push({
    _id: scheduleId,
    user: userId,
    medicine: medicineId,
    isActive: true,
    reminders: { enabled: true, leadMinutes: 15 },
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    timezone: "UTC",
    times: ["12:15"],
    frequency: "daily",
    daysOfWeek: []
  });
  medicines.push({
    _id: medicineId,
    name: "Example medicine",
    user: userId,
    isActive: true,
    startDate: new Date("2026-01-01T00:00:00.000Z")
  });
}

describe("dose reminder generation", () => {
  beforeEach(() => {
    doses.length = 0;
    schedules.length = 0;
    medicines.length = 0;
    notifications.clear();
    updateMany.mockClear();
    sendMinimalPushToUser.mockReset();
    sendMinimalPushToUser.mockResolvedValue({ status: "sent" });
  });

  it("creates a medicine- and time-specific notification for an eligible upcoming dose", async () => {
    seedEligibleDose();
    const created = await createDueDoseReminders({ now, leadMinutes: 15 });

    expect(created).toBe(1);
    const notification = notifications.get(`dose_reminder:${doseId}`);
    expect(notification).toMatchObject({
      type: "dose_reminder",
      title: "Dose reminder",
      message: "Example medicine is scheduled for 12:15 PM (UTC).",
      relatedDose: doseId,
      user: userId
    });
    expect(notification.message).toContain("12:15 PM");
    expect(sendMinimalPushToUser).toHaveBeenCalledTimes(1);
  });

  it.each(["taken", "skipped"])("does not remind for a %s dose", async (status) => {
    seedEligibleDose(doseId, { status });
    expect(await createDueDoseReminders({ now, leadMinutes: 15 })).toBe(0);
    expect(notifications.size).toBe(0);
  });

  it("prevents duplicate reminders on repeated or overlapping executions", async () => {
    seedEligibleDose();
    await createDueDoseReminders({ now, leadMinutes: 15 });
    await createDueDoseReminders({ now: new Date(now.getTime() + 1000), leadMinutes: 15 });

    expect(notifications.size).toBe(1);
    expect(sendMinimalPushToUser).toHaveBeenCalledTimes(1);
  });

  it("retains the in-app notification when push delivery fails", async () => {
    seedEligibleDose();
    sendMinimalPushToUser.mockRejectedValue(new Error("provider details"));
    await createDueDoseReminders({ now, leadMinutes: 15 });
    expect(notifications.size).toBe(1);
    expect([...notifications.values()][0].pushDeliveryStatus).toBe("failed");
  });

  it.each([
    ["inactive schedule", "schedule", { isActive: false }],
    ["inactive medicine", "medicine", { isActive: false }],
    ["obsolete time", "schedule", { times: ["12:45"] }]
  ])("excludes an %s", async (_label, target, overrides) => {
    seedEligibleDose();
    const record = target === "schedule" ? schedules[0] : medicines[0];
    Object.assign(record, overrides);
    expect(await createDueDoseReminders({ now, leadMinutes: 15 })).toBe(0);
    expect(notifications.size).toBe(0);
  });

  it("uses a bounded indexed time window and caps each batch", async () => {
    seedEligibleDose();
    await createDueDoseReminders({ now, leadMinutes: 15, windowMinutes: 1, batchSize: 1 });
    expect(notifications.size).toBe(1);
  });

  it("uses the schedule's lead time and reminder enabled setting", async () => {
    seedEligibleDose();
    schedules[0].reminders.leadMinutes = 10;
    expect(await createDueDoseReminders({ now, leadMinutes: 15 })).toBe(0);
    expect(await createDueDoseReminders({
      now: new Date(now.getTime() + 7 * 60 * 1000),
      leadMinutes: 30
    })).toBe(1);
  });

  it("does not create reminders when the schedule preference is disabled", async () => {
    seedEligibleDose();
    schedules[0].reminders.enabled = false;
    expect(await createDueDoseReminders({ now })).toBe(0);
    expect(notifications.size).toBe(0);
  });

  it("finalizes expired and exhausted push claims before retrying", async () => {
    await retryPendingPushDeliveries(now);

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      createdAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
    });
    expect(updateMany.mock.calls[1][0]).toMatchObject({
      pushDeliveryStatus: "sending",
      pushAttemptCount: { $gte: 3 }
    });
  });
});
