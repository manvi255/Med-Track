import { jest } from "@jest/globals";

const {
  doseReminderCronExpression,
  initializeDoseReminderJob,
  runDoseReminderJob,
  stopDoseReminderJob
} = await import("../src/services/reminderJob.service.js");

describe("dose reminder cron lifecycle", () => {
  afterEach(async () => {
    await stopDoseReminderJob();
    jest.restoreAllMocks();
  });

  it("does not start a cron job in test environments", () => {
    const scheduleTask = jest.fn();
    expect(initializeDoseReminderJob({
      environment: "test",
      enabled: true,
      scheduleTask
    })).toBeNull();
    expect(scheduleTask).not.toHaveBeenCalled();
  });

  it("initializes only one cron job and registers a bounded recurring schedule", () => {
    const task = { stop: jest.fn() };
    const scheduleTask = jest.fn(() => task);
    const first = initializeDoseReminderJob({
      environment: "development",
      enabled: true,
      scheduleTask,
      runJob: jest.fn()
    });
    const second = initializeDoseReminderJob({
      environment: "development",
      enabled: true,
      scheduleTask,
      runJob: jest.fn()
    });

    expect(first).toBe(task);
    expect(second).toBe(task);
    expect(scheduleTask).toHaveBeenCalledTimes(1);
    expect(scheduleTask.mock.calls[0][0]).toBe(doseReminderCronExpression);
    expect(scheduleTask.mock.calls[0][2]).toMatchObject({ noOverlap: true });
  });

  it("handles scheduled job errors with safe operational logs", async () => {
    const safeLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const runJob = jest.fn(async () => {
      throw new Error("sensitive provider or database details");
    });
    let callback;
    initializeDoseReminderJob({
      environment: "development",
      enabled: true,
      scheduleTask(_expression, onTick) {
        callback = onTick;
        return { stop: jest.fn() };
      },
      runJob
    });

    await callback();
    expect(runJob).toHaveBeenCalledTimes(1);
    expect(safeLog).toHaveBeenCalledWith("Dose reminder job failed", "Error");
    expect(safeLog.mock.calls.flat().join(" ")).not.toContain("sensitive");
  });

  it("prevents overlapping invocations in one process", async () => {
    let releaseFirst;
    const firstRun = runDoseReminderJob({
      generateOccurrences: jest.fn(async () => 0),
      createReminders: () => new Promise((resolve) => { releaseFirst = resolve; }),
      createAppointmentReminders: jest.fn(),
      retryPush: jest.fn()
    });
    await Promise.resolve();
    const overlap = await runDoseReminderJob({
      generateOccurrences: jest.fn(async () => 0),
      createReminders: jest.fn(),
      createAppointmentReminders: jest.fn(),
      retryPush: jest.fn()
    });
    expect(overlap).toEqual({ skipped: true });

    releaseFirst(1);
    expect(await firstRun).toEqual({
      skipped: false,
      dosesGenerated: 0,
      remindersCreated: 1,
      appointmentRemindersCreated: undefined,
      pushAttempts: undefined
    });
  });

  it("runs dose and appointment reminder creation through the same job", async () => {
    const generateOccurrences = jest.fn(async () => 1);
    const createReminders = jest.fn(async () => 2);
    const createAppointmentReminders = jest.fn(async () => 3);
    const retryPush = jest.fn(async () => 4);

    await expect(runDoseReminderJob({
      generateOccurrences,
      createReminders,
      createAppointmentReminders,
      retryPush,
      now: new Date("2026-10-27T12:00:00.000Z")
    })).resolves.toEqual({
      skipped: false,
      dosesGenerated: 1,
      remindersCreated: 2,
      appointmentRemindersCreated: 3,
      pushAttempts: 4
    });
    expect(createReminders).toHaveBeenCalledTimes(1);
    expect(generateOccurrences).toHaveBeenCalledTimes(1);
    expect(generateOccurrences).toHaveBeenCalledWith({ now: new Date("2026-10-27T12:00:00.000Z") });
    expect(createAppointmentReminders).toHaveBeenCalledTimes(1);
    expect(retryPush).toHaveBeenCalledTimes(1);
  });
});
