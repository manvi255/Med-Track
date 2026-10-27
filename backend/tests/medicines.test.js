import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import { env } from "../src/config/env.js";

const currentUserId = "111111111111111111111111";
const otherUserId = "222222222222222222222222";
const ownedMedicineId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const otherMedicineId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const medicines = new Map();
let nextMedicineId = 1;

class MockUser {
  constructor(id) {
    this._id = id;
    this.name = "Test User";
    this.email = "test@example.com";
    this.createdAt = new Date("2026-01-01T00:00:00.000Z");
    this.updatedAt = this.createdAt;
  }

  get id() {
    return this._id;
  }

  static async findById(id) {
    return id === currentUserId || id === otherUserId ? new MockUser(id) : null;
  }
}

function matches(medicine, filter) {
  return medicine
    && medicine._id === String(filter._id)
    && medicine.user === String(filter.user);
}

class MockMedicine {
  constructor(data) {
    this._id = (nextMedicineId++).toString(16).padStart(24, "0");
    Object.assign(this, data);
    this.createdAt = new Date();
    this.updatedAt = this.createdAt;
  }

  get id() {
    return this._id;
  }

  async save() {
    this.updatedAt = new Date();
    this.isActive ??= true;
    medicines.set(this._id, this);
    return this;
  }

  static find(filter) {
    const records = [...medicines.values()].filter(
      (medicine) => medicine.user === String(filter.user)
    );
    return {
      sort() {
        return Promise.resolve(records);
      }
    };
  }

  static async findOne(filter) {
    return [...medicines.values()].find((medicine) => matches(medicine, filter)) ?? null;
  }

  static async findOneAndDelete(filter) {
    const medicine = [...medicines.values()].find((record) => matches(record, filter));
    if (medicine) medicines.delete(medicine._id);
    return medicine ?? null;
  }
}

jest.unstable_mockModule("../src/models/User.js", () => ({ User: MockUser }));
jest.unstable_mockModule("../src/models/Medicine.js", () => ({ Medicine: MockMedicine }));

const { app } = await import("../src/app.js");

const validMedicine = {
  name: "  User-entered medicine ",
  category: "medication",
  dosage: "500 mg",
  form: "tablet",
  frequency: "Once daily",
  instructions: "Take with water",
  startDate: "2026-10-01",
  endDate: "2026-10-10"
};

function authCookie(userId = currentUserId) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "1h" });
  return `meditrack_auth=${token}`;
}

function seedMedicine(id, userId) {
  const medicine = new MockMedicine({
    ...validMedicine,
    _id: id,
    user: userId,
    startDate: new Date(validMedicine.startDate),
    endDate: new Date(validMedicine.endDate),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  medicines.set(id, medicine);
  return medicine;
}

describe("medicine routes", () => {
  beforeEach(() => {
    medicines.clear();
    nextMedicineId = 1;
  });

  it("creates a medicine for the authenticated user", async () => {
    const response = await request(app)
      .post("/api/v1/medicines")
      .set("Cookie", authCookie())
      .send({ ...validMedicine, user: otherUserId });

    expect(response.status).toBe(400);
    expect(medicines.size).toBe(0);

    const created = await request(app)
      .post("/api/v1/medicines")
      .set("Cookie", authCookie())
      .send(validMedicine);

    expect(created.status).toBe(201);
    expect(created.body.medicine).toMatchObject({
      name: "User-entered medicine",
      category: "medication",
      dosage: "500 mg",
      isActive: true
    });
    expect(created.body.medicine).not.toHaveProperty("user");
    expect([...medicines.values()][0].user).toBe(currentUserId);
  });

  it("rejects invalid medicine data and inconsistent dates", async () => {
    const response = await request(app)
      .post("/api/v1/medicines")
      .set("Cookie", authCookie())
      .send({ ...validMedicine, name: " ", category: "unrecognized", startDate: "invalid" });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("name");
    expect(response.body.error.message).toContain("category");
    expect(response.body.error.message).toContain("startDate");

    const invalidDates = await request(app)
      .post("/api/v1/medicines")
      .set("Cookie", authCookie())
      .send({ ...validMedicine, endDate: "2026-09-30" });

    expect(invalidDates.status).toBe(400);
    expect(invalidDates.body.error.message).toContain("endDate");
  });

  it("rejects requests without authentication", async () => {
    const response = await request(app).get("/api/v1/medicines");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { message: "Authentication required" } });
  });

  it("lists only medicines belonging to the authenticated user", async () => {
    seedMedicine(ownedMedicineId, currentUserId);
    seedMedicine(otherMedicineId, otherUserId);

    const response = await request(app)
      .get("/api/v1/medicines")
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body.medicines).toHaveLength(1);
    expect(response.body.medicines[0].id).toBe(ownedMedicineId);
  });

  it("retrieves a medicine owned by the authenticated user", async () => {
    seedMedicine(ownedMedicineId, currentUserId);

    const response = await request(app)
      .get(`/api/v1/medicines/${ownedMedicineId}`)
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body.medicine.id).toBe(ownedMedicineId);
    expect(response.body.medicine).not.toHaveProperty("user");
  });

  it("returns 404 for a medicine owned by another user", async () => {
    seedMedicine(otherMedicineId, otherUserId);

    const response = await request(app)
      .get(`/api/v1/medicines/${otherMedicineId}`)
      .set("Cookie", authCookie());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { message: "Medicine not found" } });
  });

  it("updates an owned medicine", async () => {
    seedMedicine(ownedMedicineId, currentUserId);

    const response = await request(app)
      .patch(`/api/v1/medicines/${ownedMedicineId}`)
      .set("Cookie", authCookie())
      .send({ dosage: "1000 IU", isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.medicine).toMatchObject({
      id: ownedMedicineId,
      dosage: "1000 IU",
      isActive: false
    });
    expect(medicines.get(ownedMedicineId).user).toBe(currentUserId);
  });

  it("rejects attempts to change the medicine owner", async () => {
    seedMedicine(ownedMedicineId, currentUserId);

    const response = await request(app)
      .patch(`/api/v1/medicines/${ownedMedicineId}`)
      .set("Cookie", authCookie())
      .send({ user: otherUserId });

    expect(response.status).toBe(400);
    expect(medicines.get(ownedMedicineId).user).toBe(currentUserId);
  });

  it("rejects an update that would make the medicine dates inconsistent", async () => {
    seedMedicine(ownedMedicineId, currentUserId);

    const response = await request(app)
      .patch(`/api/v1/medicines/${ownedMedicineId}`)
      .set("Cookie", authCookie())
      .send({ endDate: "2026-09-30" });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("endDate");
    expect(medicines.get(ownedMedicineId).endDate.toISOString()).toBe(
      "2026-10-10T00:00:00.000Z"
    );
  });

  it("does not allow modifying another user's medicine", async () => {
    seedMedicine(otherMedicineId, otherUserId);

    const response = await request(app)
      .patch(`/api/v1/medicines/${otherMedicineId}`)
      .set("Cookie", authCookie())
      .send({ name: "Changed by another user" });

    expect(response.status).toBe(404);
    expect(medicines.get(otherMedicineId).name).toBe("  User-entered medicine ");
  });

  it("deletes an owned medicine", async () => {
    seedMedicine(ownedMedicineId, currentUserId);

    const response = await request(app)
      .delete(`/api/v1/medicines/${ownedMedicineId}`)
      .set("Cookie", authCookie());

    expect(response.status).toBe(204);
    expect(medicines.has(ownedMedicineId)).toBe(false);
  });

  it("returns 404 for a nonexistent medicine", async () => {
    const response = await request(app)
      .get(`/api/v1/medicines/${ownedMedicineId}`)
      .set("Cookie", authCookie());

    expect(response.status).toBe(404);
  });

  it("rejects malformed medicine IDs", async () => {
    const response = await request(app)
      .get("/api/v1/medicines/not-an-object-id")
      .set("Cookie", authCookie());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { message: "Invalid medicine ID" } });
  });
});
