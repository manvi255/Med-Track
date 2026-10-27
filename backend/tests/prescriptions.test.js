import { readdir, stat, unlink, writeFile } from "node:fs/promises";
import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import { env } from "../src/config/env.js";
import { PRESCRIPTION_STORAGE_DIR } from "../src/utils/prescriptionFiles.js";

const userId = "111111111111111111111111";
const otherUserId = "222222222222222222222222";
const prescriptionId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const otherPrescriptionId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const prescriptions = new Map();
const medicines = new Map();
let nextMedicineId = 1;
let failPrescriptionSaveCount = 0;
let filesBeforeTest = new Set();

function isMatch(record, filter) {
  if (!record) return false;
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "$or") {
      if (!expected.some((clause) => isMatch(record, clause))) return false;
    } else if (expected && typeof expected === "object" && !(expected instanceof Date) && !Array.isArray(expected)) {
      if ("$ne" in expected && String(record[key]) === String(expected.$ne)) return false;
      if ("$exists" in expected && (record[key] !== undefined) !== expected.$exists) return false;
      if ("$in" in expected && !expected.$in.map(String).includes(String(record[key]))) return false;
    } else if (String(record[key]) !== String(expected)) {
      return false;
    }
  }
  return true;
}

class MockQuery {
  constructor(promise) {
    this.promise = Promise.resolve(promise);
  }

  select() { return this; }

  sort() {
    this.promise = this.promise.then((values) => values);
    return this;
  }

  then(resolve, reject) {
    return this.promise.then(resolve, reject);
  }
}

class MockUser {
  constructor(id) {
    this._id = id;
    this.id = id;
    this.name = "Prescription User";
    this.email = "prescription@example.com";
    this.createdAt = new Date();
    this.updatedAt = this.createdAt;
  }

  static async findById(id) {
    return [userId, otherUserId].includes(String(id)) ? new MockUser(String(id)) : null;
  }
}

class MockPrescription {
  constructor(data) {
    this._id = (data._id ?? `${prescriptions.size + 10}`.padStart(24, "0")).toString();
    Object.assign(this, data, { _id: this._id });
    this.id = this._id;
    this.status ??= "uploaded";
    this.extractedText ??= "";
    this.medicines ??= [];
    this.confirmedMedicineIds ??= [];
    this.createdAt ??= new Date();
    this.updatedAt ??= this.createdAt;
  }

  async save() {
    if (failPrescriptionSaveCount > 0) {
      failPrescriptionSaveCount -= 1;
      throw new Error("mock storage failure");
    }
    this.updatedAt = new Date();
    prescriptions.set(this._id, this);
    return this;
  }

  static find(filter) {
    return new MockQuery([...prescriptions.values()].filter((value) => isMatch(value, filter)));
  }

  static findOne(filter) {
    return new MockQuery([...prescriptions.values()].find((value) => isMatch(value, filter)) ?? null);
  }

  static findOneAndUpdate(filter, update) {
    const prescription = [...prescriptions.values()].find((value) => isMatch(value, filter));
    if (prescription) Object.assign(prescription, update.$set);
    return new MockQuery(prescription ?? null);
  }

  static async updateOne(filter, update) {
    const prescription = [...prescriptions.values()].find((value) => isMatch(value, filter));
    if (!prescription) return { matchedCount: 0 };
    if (update.$addToSet?.confirmedMedicineIds) {
      const id = String(update.$addToSet.confirmedMedicineIds);
      if (!prescription.confirmedMedicineIds.some((existing) => String(existing) === id)) {
        prescription.confirmedMedicineIds.push(id);
      }
    }
    if (update.$set) Object.assign(prescription, update.$set);
    return { matchedCount: 1 };
  }

  static findOneAndDelete(filter) {
    const prescription = [...prescriptions.values()].find((value) => isMatch(value, filter));
    if (prescription) prescriptions.delete(prescription._id);
    return new MockQuery(prescription ?? null);
  }

  static async deleteOne(filter) {
    const prescription = [...prescriptions.values()].find((value) => isMatch(value, filter));
    if (prescription) prescriptions.delete(prescription._id);
    return { deletedCount: prescription ? 1 : 0 };
  }
}

class MockMedicine {
  constructor(data) {
    this._id = (nextMedicineId++).toString(16).padStart(24, "0");
    Object.assign(this, data);
    this.id = this._id;
    this.createdAt = new Date();
    this.updatedAt = this.createdAt;
    this.isActive ??= true;
  }

  async save() {
    const duplicate = [...medicines.values()].find((medicine) => (
      String(medicine.sourcePrescription) === String(this.sourcePrescription)
      && String(medicine.sourceSuggestionIndex) === String(this.sourceSuggestionIndex)
      && this.sourcePrescription !== undefined
    ));
    if (duplicate) {
      const error = new Error("duplicate key");
      error.code = 11000;
      throw error;
    }
    medicines.set(this._id, this);
    return this;
  }

  static find(filter) {
    const ids = filter._id?.$in?.map(String);
    return new MockQuery([...medicines.values()].filter((medicine) => (
      String(medicine.user) === String(filter.user)
      && (!ids || ids.includes(medicine._id))
    )));
  }

  static async findOne(filter) {
    return [...medicines.values()].find((medicine) => isMatch(medicine, filter)) ?? null;
  }
}

jest.unstable_mockModule("../src/models/User.js", () => ({ User: MockUser }));
jest.unstable_mockModule("../src/models/Prescription.js", () => ({ Prescription: MockPrescription }));
jest.unstable_mockModule("../src/models/Medicine.js", () => ({ Medicine: MockMedicine }));
jest.unstable_mockModule("../src/services/prescriptionOcr.service.js", () => ({
  extractPrescriptionText: jest.fn(async () => "User-entered text from a prescription")
}));

const { app } = await import("../src/app.js");
const { extractPrescriptionText } = await import("../src/services/prescriptionOcr.service.js");

const pngImage = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1
]);
const reviewedMedicine = {
  name: "User reviewed name",
  category: "medication",
  dosage: "500 mg",
  frequency: "Once daily",
  startDate: "2026-10-01"
};

function authCookie(owner = userId) {
  const token = jwt.sign({ sub: owner }, env.JWT_SECRET, { expiresIn: "1h" });
  return `meditrack_auth=${token}`;
}

async function newFiles() {
  const names = await readdir(PRESCRIPTION_STORAGE_DIR).catch(() => []);
  return names.filter((name) => !filesBeforeTest.has(name));
}

function seedPrescription(id, owner = userId, data = {}) {
  const prescription = new MockPrescription({
    _id: id,
    user: owner,
    originalFilename: "prescription.png",
    mimeType: "image/png",
    storageKey: `${id}.png`,
    status: "review_required",
    extractedText: "Recognized text",
    medicines: [],
    ...data
  });
  prescriptions.set(id, prescription);
  return prescription;
}

describe("prescription upload and review API", () => {
  beforeEach(async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    prescriptions.clear();
    medicines.clear();
    nextMedicineId = 1;
    failPrescriptionSaveCount = 0;
    extractPrescriptionText.mockReset();
    extractPrescriptionText.mockResolvedValue("User-entered text from a prescription");
    filesBeforeTest = new Set(await readdir(PRESCRIPTION_STORAGE_DIR).catch(() => []));
  });

  afterEach(async () => {
    const createdFiles = await newFiles();
    await Promise.all(createdFiles.map(async (filename) => {
      const filePath = `${PRESCRIPTION_STORAGE_DIR}\\${filename}`;
      await unlink(filePath).catch(() => {});
    }));
    jest.restoreAllMocks();
  });

  it("requires authentication for prescription APIs", async () => {
    const response = await request(app).get("/api/v1/prescriptions");
    expect(response.status).toBe(401);
  });

  it("uploads a supported image with a random private filename and OCR text", async () => {
    const response = await request(app)
      .post("/api/v1/prescriptions/upload")
      .set("Cookie", authCookie())
      .attach("file", pngImage, {
        filename: "..\\private\\My prescription.png",
        contentType: "image/png"
      });

    expect(response.status).toBe(201);
    expect(response.body.prescription).toMatchObject({
      originalFilename: "My prescription.png",
      mimeType: "image/png",
      status: "review_required",
      extractedText: "User-entered text from a prescription",
      medicines: []
    });
    expect(response.body.prescription).not.toHaveProperty("storageKey");
    expect(medicines.size).toBe(0);
    const [storedFile] = await newFiles();
    expect(storedFile).toMatch(/^[a-f\d-]{36}\.png$/i);
    expect(prescriptions.size).toBe(1);
    expect(prescriptions.values().next().value.storageKey).toBe(storedFile);
  });

  it.each([
    ["image/jpeg", "scan.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])],
    ["image/webp", "scan.webp", Buffer.from("RIFF0000WEBPVP8 ")]
  ])("accepts %s images after checking file signatures", async (contentType, filename, image) => {
    const response = await request(app)
      .post("/api/v1/prescriptions/upload")
      .set("Cookie", authCookie())
      .attach("file", image, { filename, contentType });

    expect(response.status).toBe(201);
    expect(response.body.prescription.mimeType).toBe(contentType);
  });

  it("rejects unsupported MIME types and oversized files", async () => {
    const unsupported = await request(app)
      .post("/api/v1/prescriptions/upload")
      .set("Cookie", authCookie())
      .attach("file", Buffer.from("not an image"), {
        filename: "file.gif",
        contentType: "image/gif"
      });
    expect(unsupported.status).toBe(400);

    const oversized = await request(app)
      .post("/api/v1/prescriptions/upload")
      .set("Cookie", authCookie())
      .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1, 1), {
        filename: "large.png",
        contentType: "image/png"
      });
    expect(oversized.status).toBe(413);
    expect(await newFiles()).toHaveLength(0);
  });

  it("rejects invalid image contents even when the MIME type is supported", async () => {
    const response = await request(app)
      .post("/api/v1/prescriptions/upload")
      .set("Cookie", authCookie())
      .attach("file", Buffer.from("not a PNG"), {
        filename: "fake.png",
        contentType: "image/png"
      });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/valid supported image/i);
    expect(await newFiles()).toHaveLength(0);
    expect(prescriptions.size).toBe(0);
  });

  it("marks OCR failures safely without logging or exposing the underlying error", async () => {
    extractPrescriptionText.mockRejectedValue(new Error("sensitive underlying OCR detail"));
    const response = await request(app)
      .post("/api/v1/prescriptions/upload")
      .set("Cookie", authCookie())
      .attach("file", pngImage, { filename: "scan.png", contentType: "image/png" });

    expect(response.status).toBe(201);
    expect(response.body.prescription.status).toBe("failed");
    expect(response.body.prescription.errorMessage).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toContain("sensitive underlying OCR detail");
    expect(prescriptions.size).toBe(1);
  });

  it("cleans up an uploaded file when the prescription cannot be saved", async () => {
    failPrescriptionSaveCount = 1;
    const response = await request(app)
      .post("/api/v1/prescriptions/upload")
      .set("Cookie", authCookie())
      .attach("file", pngImage, { filename: "scan.png", contentType: "image/png" });

    expect(response.status).toBe(500);
    expect(await newFiles()).toHaveLength(0);
  });

  it("removes the database record and file if OCR status cannot be persisted", async () => {
    extractPrescriptionText.mockImplementation(async () => {
      failPrescriptionSaveCount = 2;
      return "Recognized text";
    });
    const response = await request(app)
      .post("/api/v1/prescriptions/upload")
      .set("Cookie", authCookie())
      .attach("file", pngImage, { filename: "scan.png", contentType: "image/png" });

    expect(response.status).toBe(500);
    expect(prescriptions.size).toBe(0);
    expect(await newFiles()).toHaveLength(0);
  });

  it("lists and retrieves only prescriptions owned by the authenticated user", async () => {
    seedPrescription(prescriptionId);
    seedPrescription(otherPrescriptionId, otherUserId);
    const list = await request(app)
      .get("/api/v1/prescriptions")
      .set("Cookie", authCookie());
    expect(list.status).toBe(200);
    expect(list.body.prescriptions).toHaveLength(1);
    expect(list.body.prescriptions[0].id).toBe(prescriptionId);

    const foreign = await request(app)
      .get(`/api/v1/prescriptions/${otherPrescriptionId}`)
      .set("Cookie", authCookie());
    expect(foreign.status).toBe(404);
  });

  it("rejects invalid confirmation payloads and owner assignment", async () => {
    seedPrescription(prescriptionId);
    const response = await request(app)
      .post(`/api/v1/prescriptions/${prescriptionId}/confirm`)
      .set("Cookie", authCookie())
      .send({ medicines: [{ ...reviewedMedicine, user: otherUserId }] });
    expect(response.status).toBe(400);
    expect(medicines.size).toBe(0);
  });

  it("creates medicines only after confirmation and makes retries idempotent", async () => {
    seedPrescription(prescriptionId);
    const sendConfirmation = () => request(app)
      .post(`/api/v1/prescriptions/${prescriptionId}/confirm`)
      .set("Cookie", authCookie())
      .send({ medicines: [reviewedMedicine] });

    const first = await sendConfirmation();
    const retry = await sendConfirmation();
    expect(first.status).toBe(200);
    expect(first.body.medicines).toHaveLength(1);
    expect(first.body.medicines[0]).toMatchObject({
      name: reviewedMedicine.name,
      dosage: reviewedMedicine.dosage
    });
    expect(retry.status).toBe(200);
    expect(retry.body.medicines).toHaveLength(1);
    expect(medicines.size).toBe(1);
    expect([...medicines.values()][0].user).toBe(userId);
    expect([...medicines.values()][0]).not.toHaveProperty("schedule");
  });

  it("rejects changed details after a successful confirmation", async () => {
    seedPrescription(prescriptionId);
    await request(app)
      .post(`/api/v1/prescriptions/${prescriptionId}/confirm`)
      .set("Cookie", authCookie())
      .send({ medicines: [reviewedMedicine] });
    const response = await request(app)
      .post(`/api/v1/prescriptions/${prescriptionId}/confirm`)
      .set("Cookie", authCookie())
      .send({ medicines: [{ ...reviewedMedicine, name: "Changed after confirm" }] });
    expect(response.status).toBe(409);
    expect(medicines.size).toBe(1);
  });

  it("deletes only an owned prescription and its file, preserving confirmed medicines", async () => {
    const { randomUUID } = await import("node:crypto");
    const storageKey = `${randomUUID()}.png`;
    await writeFile(`${PRESCRIPTION_STORAGE_DIR}\\${storageKey}`, pngImage);
    const medicine = new MockMedicine({ ...reviewedMedicine, user: userId });
    medicines.set(medicine._id, medicine);
    seedPrescription(prescriptionId, userId, {
      status: "confirmed",
      storageKey,
      confirmedMedicineIds: [medicine._id]
    });

    const unauthorized = await request(app)
      .delete(`/api/v1/prescriptions/${prescriptionId}`)
      .set("Cookie", authCookie(otherUserId));
    expect(unauthorized.status).toBe(404);

    const response = await request(app)
      .delete(`/api/v1/prescriptions/${prescriptionId}`)
      .set("Cookie", authCookie());
    expect(response.status).toBe(204);
    expect(prescriptions.has(prescriptionId)).toBe(false);
    expect(medicines.has(medicine._id)).toBe(true);
    expect(await stat(`${PRESCRIPTION_STORAGE_DIR}\\${storageKey}`).catch(() => null)).toBeNull();
  });

  it("deletes a prescription when its image is already missing", async () => {
    seedPrescription(prescriptionId, userId, {
      storageKey: "ffffffff-ffff-4fff-8fff-ffffffffffff.png"
    });
    const response = await request(app)
      .delete(`/api/v1/prescriptions/${prescriptionId}`)
      .set("Cookie", authCookie());
    expect(response.status).toBe(204);
    expect(prescriptions.has(prescriptionId)).toBe(false);
  });

  it("refuses unsafe stored paths without deleting outside files", async () => {
    seedPrescription(prescriptionId, userId, { storageKey: "..\\..\\.env" });
    const response = await request(app)
      .delete(`/api/v1/prescriptions/${prescriptionId}`)
      .set("Cookie", authCookie());
    expect(response.status).toBe(500);
    expect(prescriptions.get(prescriptionId).status).toBe("review_required");
  });

  it("returns 404 for nonexistent prescriptions and rejects malformed IDs", async () => {
    const missing = await request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}`)
      .set("Cookie", authCookie());
    const malformed = await request(app)
      .delete("/api/v1/prescriptions/not-an-id")
      .set("Cookie", authCookie());
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});
