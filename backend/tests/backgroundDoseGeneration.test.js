import { jest } from "@jest/globals";

const now = new Date("2026-10-27T12:00:00.000Z");
const schedules = [
  {
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    user: "111111111111111111111111",
    medicine: "222222222222222222222222",
    isActive: true,
    startDate: new Date("2026-10-01T00:00:00.000Z"),
    timezone: "UTC",
    times: ["12:15"],
    frequency: "daily",
    daysOfWeek: []
  },
  {
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
    user: "111111111111111111111111",
    medicine: "333333333333333333333333",
    isActive: true,
    startDate: new Date("2026-10-01T00:00:00.000Z"),
    timezone: "America/Los_Angeles",
    times: ["08:30"],
    frequency: "selected_days",
    daysOfWeek: [2]
  }
];
const doses = new Map();

class MockQuery {
  constructor(values) { this.values = values; }
  sort(order) {
    const [[field, direction]] = Object.entries(order);
    this.values.sort((left, right) => String(left[field]).localeCompare(String(right[field])) * direction);
    return this;
  }
  select() { return this; }
  limit(count) { this.values = this.values.slice(0, count); return this; }
  then(resolve, reject) { return Promise.resolve(this.values).then(resolve, reject); }
}

const MockSchedule = {
  find(filter) {
    return new MockQuery(schedules.filter((schedule) => (
      schedule.isActive === filter.isActive
      && schedule.startDate <= filter.startDate.$lte
      && (!filter._id || schedule._id > filter._id.$gt)
    )));
  }
};

const MockDose = {
  async bulkWrite(operations) {
    for (const { updateOne } of operations) {
      const { schedule, scheduledFor } = updateOne.filter;
      const key = `${schedule}:${scheduledFor.toISOString()}`;
      if (!doses.has(key)) doses.set(key, updateOne.update.$setOnInsert);
    }
    return {};
  }
};

jest.unstable_mockModule("../src/models/Dose.js", () => ({ Dose: MockDose }));
jest.unstable_mockModule("../src/models/Schedule.js", () => ({ Schedule: MockSchedule }));
const { generateUpcomingDoseOccurrences } = await import("../src/services/doseGeneration.service.js");

describe("background dose occurrence generation", () => {
  beforeEach(() => doses.clear());

  it("generates upcoming occurrences automatically in bounded schedule pages and is idempotent", async () => {
    const generated = await generateUpcomingDoseOccurrences({ now, batchSize: 1 });
    expect(generated).toBeGreaterThan(0);
    expect([...doses.values()].every((dose) => dose.scheduledFor >= now)).toBe(true);

    const firstCount = doses.size;
    await generateUpcomingDoseOccurrences({ now, batchSize: 1 });
    expect(doses.size).toBe(firstCount);
  });
});
