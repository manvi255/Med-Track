import { describe, expect, it } from "@jest/globals";
import { Schedule } from "../src/models/Schedule.js";
import { Dose } from "../src/models/Dose.js";
import {
  buildDoseOccurrences
} from "../src/services/doseGeneration.service.js";
import {
  localDateString,
  resolveLocalDateTime
} from "../src/utils/scheduleTime.js";

describe("schedule and dose model validation", () => {
  const common = {
    user: "111111111111111111111111",
    medicine: "222222222222222222222222",
    doseAmount: 1,
    doseUnit: "tablet",
    frequency: "daily",
    times: ["09:00"],
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    timezone: "UTC"
  };

  it("accepts a valid schedule and rejects invalid amount, duplicate times, and date order", async () => {
    await expect(new Schedule(common).validate()).resolves.toBeUndefined();
    await expect(new Schedule({ ...common, doseAmount: 0 }).validate()).rejects.toMatchObject({
      name: "ValidationError"
    });
    await expect(new Schedule({ ...common, times: ["09:00", "09:00"] }).validate()).rejects.toMatchObject({
      name: "ValidationError"
    });
    await expect(new Schedule({
      ...common,
      endDate: new Date("2025-12-31T00:00:00.000Z")
    }).validate()).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("requires unique selected weekdays and a valid IANA timezone", async () => {
    await expect(new Schedule({
      ...common,
      frequency: "selected_days",
      daysOfWeek: []
    }).validate()).rejects.toMatchObject({ name: "ValidationError" });
    await expect(new Schedule({
      ...common,
      frequency: "selected_days",
      daysOfWeek: [1, 1]
    }).validate()).rejects.toMatchObject({ name: "ValidationError" });
    await expect(new Schedule({ ...common, timezone: "Invalid/Zone" }).validate())
      .rejects.toMatchObject({ name: "ValidationError" });
    await expect(new Schedule({
      ...common,
      daysOfWeek: [1]
    }).validate()).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("validates dose occurrence fields and uses a unique schedule/time index", async () => {
    const dose = new Dose({
      user: common.user,
      medicine: common.medicine,
      schedule: "333333333333333333333333",
      scheduledFor: new Date(),
      localDate: "2026-01-01",
      timezone: "UTC"
    });
    await expect(dose.validate()).resolves.toBeUndefined();
    expect(Dose.schema.indexes()).toContainEqual([
      { schedule: 1, scheduledFor: 1 },
      { unique: true, background: true }
    ]);
  });
});

describe("timezone-aware dose occurrence generation", () => {
  const schedule = {
    _id: "333333333333333333333333",
    user: "111111111111111111111111",
    medicine: "222222222222222222222222",
    isActive: true,
    frequency: "daily",
    times: ["09:30"],
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    timezone: "America/New_York"
  };

  it("converts local times to the correct UTC instant across standard and daylight time", () => {
    const winter = resolveLocalDateTime("2026-01-15", "09:30", "America/New_York");
    const summer = resolveLocalDateTime("2026-07-15", "09:30", "America/New_York");
    expect(winter.toISOString()).toBe("2026-01-15T14:30:00.000Z");
    expect(summer.toISOString()).toBe("2026-07-15T13:30:00.000Z");
    expect(localDateString(summer, "America/New_York")).toBe("2026-07-15");
  });

  it("skips nonexistent spring-forward times and chooses the earlier fall-back occurrence", () => {
    expect(resolveLocalDateTime("2026-03-08", "02:30", "America/New_York")).toBeNull();
    expect(resolveLocalDateTime("2026-11-01", "01:30", "America/New_York").toISOString())
      .toBe("2026-11-01T05:30:00.000Z");
  });

  it("builds occurrences while respecting schedule date bounds, weekday selection, and DST", () => {
    const selected = {
      ...schedule,
      frequency: "selected_days",
      daysOfWeek: [0],
      times: ["02:30"],
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-20T00:00:00.000Z")
    };
    const occurrences = buildDoseOccurrences(
      [selected],
      "2026-03-08",
      "2026-03-15",
      new Date("2026-03-01T00:00:00.000Z")
    );
    expect(occurrences.map(({ localDate }) => localDate)).toEqual(["2026-03-15"]);
    expect(occurrences[0].scheduledFor.toISOString()).toBe("2026-03-15T06:30:00.000Z");
  });
});
