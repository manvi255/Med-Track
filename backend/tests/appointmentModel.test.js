import { Appointment } from "../src/models/Appointment.js";

const validAppointment = {
  user: "111111111111111111111111",
  doctorName: "Dr Example",
  appointmentType: "follow_up",
  scheduledAt: new Date("2026-10-28T12:00:00.000Z"),
  timezone: "Asia/Kolkata"
};

describe("Appointment model", () => {
  it("validates a valid appointment and applies reminder defaults", async () => {
    const appointment = new Appointment(validAppointment);
    await expect(appointment.validate()).resolves.toBeUndefined();
    expect(appointment.reminders.enabled).toBe(true);
    expect(appointment.reminders.leadHours.length).toBeGreaterThan(0);
    expect(appointment.schema.options.timestamps).toBe(true);
  });

  it.each([
    ["empty doctor", { doctorName: " " }],
    ["invalid timezone", { timezone: "Mars/Olympus" }],
    ["invalid appointment type", { appointmentType: "unknown" }],
    ["invalid date", { scheduledAt: new Date("invalid") }],
    ["missing required user", { user: undefined }]
  ])("rejects %s", async (_label, override) => {
    const appointment = new Appointment({ ...validAppointment, ...override });
    await expect(appointment.validate()).rejects.toThrow();
  });
});
