import { createHash } from "node:crypto";
import { Medicine } from "../models/Medicine.js";
import { Prescription } from "../models/Prescription.js";
import { ApiError } from "../utils/ApiError.js";
import { extractPrescriptionText } from "./prescriptionOcr.service.js";

const MIME_EXTENSION = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
});

export function sanitizeOriginalFilename(filename) {
  const leafName = String(filename ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  const sanitized = leafName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .slice(0, 255);
  return sanitized || "prescription-image";
}

export function detectImageMime(buffer) {
  if (buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 16
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
    && ["VP8 ", "VP8L", "VP8X"].includes(buffer.toString("ascii", 12, 16))) {
    return "image/webp";
  }
  return null;
}

function safeOcrError() {
  return "Text could not be extracted from this image. Review it manually or upload a clearer image.";
}

function serializeMedicine(medicine) {
  return {
    id: medicine.id ?? medicine._id.toString(),
    name: medicine.name,
    category: medicine.category,
    dosage: medicine.dosage,
    ...(medicine.form === undefined ? {} : { form: medicine.form }),
    frequency: medicine.frequency,
    ...(medicine.instructions === undefined ? {} : { instructions: medicine.instructions }),
    startDate: medicine.startDate,
    ...(medicine.endDate === undefined ? {} : { endDate: medicine.endDate }),
    isActive: medicine.isActive,
    createdAt: medicine.createdAt,
    updatedAt: medicine.updatedAt
  };
}

export function serializePrescription(prescription, { includeReviewContent = false } = {}) {
  return {
    id: prescription.id ?? prescription._id.toString(),
    originalFilename: prescription.originalFilename,
    mimeType: prescription.mimeType,
    status: prescription.status,
    ...(includeReviewContent ? {
      extractedText: prescription.extractedText,
      medicines: prescription.medicines
    } : {}),
    ...(prescription.errorMessage ? { errorMessage: prescription.errorMessage } : {}),
    createdAt: prescription.createdAt,
    updatedAt: prescription.updatedAt
  };
}

export async function uploadPrescription({ userId, file, storageKey, mimeType }) {
  const prescription = new Prescription({
    user: userId,
    originalFilename: sanitizeOriginalFilename(file.originalname),
    mimeType,
    storageKey,
    status: "processing",
    medicines: []
  });

  try {
    await prescription.save();
  } catch {
    await Prescription.deleteOne({ _id: prescription._id, user: userId });
    throw new ApiError(500, "Unable to save prescription upload");
  }

  try {
    const extractedText = await extractPrescriptionText(file.path);
    prescription.extractedText = extractedText.slice(0, 100000);
    prescription.status = "review_required";
    if (!extractedText) {
      prescription.errorMessage = safeOcrError();
    }
    await prescription.save();
  } catch {
    prescription.status = "failed";
    prescription.errorMessage = safeOcrError();
    try {
      await prescription.save();
    } catch {
      await Prescription.deleteOne({
        _id: prescription._id,
        user: userId
      });
      throw new ApiError(500, "Unable to save prescription processing status");
    }
  }

  return prescription;
}

export function listPrescriptions(userId) {
  return Prescription.find({ user: userId }).sort({ createdAt: -1 });
}

export async function getPrescription(userId, prescriptionId) {
  const prescription = await Prescription.findOne({
    _id: prescriptionId,
    user: userId
  });
  if (!prescription) throw new ApiError(404, "Prescription not found");
  return prescription;
}

function hashConfirmation(medicines) {
  return createHash("sha256").update(JSON.stringify(medicines)).digest("hex");
}

async function findConfirmedMedicines(userId, ids) {
  return Medicine.find({ _id: { $in: ids }, user: userId });
}

export async function confirmPrescription(userId, prescriptionId, reviewedMedicines) {
  const requestHash = hashConfirmation(reviewedMedicines);
  const ownedPrescription = await Prescription.findOne({
    _id: prescriptionId,
    user: userId
  }).select("+confirmationHash +confirmedMedicineIds");

  if (!ownedPrescription) throw new ApiError(404, "Prescription not found");
  if (ownedPrescription.status === "confirmed") {
    if (ownedPrescription.confirmationHash !== requestHash) {
      throw new ApiError(409, "Prescription was already confirmed with different medicine details");
    }
    const medicines = await findConfirmedMedicines(userId, ownedPrescription.confirmedMedicineIds);
    return { prescription: ownedPrescription, medicines };
  }
  if (ownedPrescription.status !== "review_required") {
    throw new ApiError(409, "Prescription is not ready for confirmation");
  }
  if (ownedPrescription.confirmationHash && ownedPrescription.confirmationHash !== requestHash) {
    throw new ApiError(409, "A previous confirmation attempt used different medicine details");
  }

  const prescription = await Prescription.findOneAndUpdate({
    _id: prescriptionId,
    user: userId,
    status: "review_required",
    ...(ownedPrescription.confirmationHash ? { confirmationHash: requestHash } : {
      $or: [{ confirmationHash: { $exists: false } }, { confirmationHash: null }]
    })
  }, {
    $set: { status: "processing", confirmationHash: requestHash }
  }, { new: true }).select("+confirmationHash +confirmedMedicineIds");

  if (!prescription) {
    throw new ApiError(409, "Prescription is already being processed");
  }

  try {
    const confirmedMedicines = [];
    for (const [index, medicineData] of reviewedMedicines.entries()) {
      const sourceFilter = {
        user: userId,
        sourcePrescription: prescription._id,
        sourceSuggestionIndex: index
      };
      let medicine = await Medicine.findOne(sourceFilter);
      if (!medicine) {
        medicine = new Medicine({
          ...medicineData,
          user: userId,
          sourcePrescription: prescription._id,
          sourceSuggestionIndex: index
        });
        try {
          await medicine.save();
        } catch (error) {
          if (error?.code !== 11000) throw error;
          medicine = await Medicine.findOne(sourceFilter);
          if (!medicine) throw error;
        }
      }

      await Prescription.updateOne({
        _id: prescriptionId,
        user: userId,
        status: "processing",
        confirmationHash: requestHash
      }, {
        $addToSet: { confirmedMedicineIds: medicine._id }
      });
      confirmedMedicines.push(medicine);
    }

    await Prescription.updateOne({
      _id: prescriptionId,
      user: userId,
      status: "processing",
      confirmationHash: requestHash
    }, {
      $set: { status: "confirmed" }
    });
    prescription.status = "confirmed";
    prescription.confirmedMedicineIds = confirmedMedicines.map(({ _id }) => _id);
    return { prescription, medicines: confirmedMedicines };
  } catch {
    await Prescription.updateOne({
      _id: prescriptionId,
      user: userId,
      status: "processing",
      confirmationHash: requestHash
    }, {
      $set: { status: "review_required" }
    });
    throw new ApiError(500, "Unable to confirm prescription");
  }
}

export async function deletePrescription(userId, prescriptionId, removeFile) {
  const existing = await Prescription.findOne({
    _id: prescriptionId,
    user: userId
  }).select("+storageKey");
  if (!existing) throw new ApiError(404, "Prescription not found");
  if (existing.status === "processing") {
    throw new ApiError(409, "Prescription is currently being processed");
  }
  const originalStatus = existing.status;

  const prescription = await Prescription.findOneAndUpdate({
    _id: prescriptionId,
    user: userId,
    status: originalStatus
  }, {
    $set: { status: "processing" }
  }, { new: true }).select("+storageKey");
  if (!prescription) throw new ApiError(409, "Prescription is currently being processed");

  try {
    await removeFile(prescription.storageKey);
  } catch {
    await Prescription.updateOne({
      _id: prescriptionId,
      user: userId,
      status: "processing"
    }, {
      $set: { status: originalStatus }
    });
    throw new ApiError(500, "Unable to remove prescription file");
  }

  try {
    const deleted = await Prescription.findOneAndDelete({
      _id: prescriptionId,
      user: userId,
      status: "processing"
    });
    if (!deleted) throw new Error("Prescription delete did not match");
  } catch {
    await Prescription.updateOne({
      _id: prescriptionId,
      user: userId,
      status: "processing"
    }, {
      $set: { status: originalStatus }
    });
    throw new ApiError(500, "Unable to delete prescription");
  }
}

export function getPrescriptionExtension(mimeType) {
  return MIME_EXTENSION[mimeType];
}

export { serializeMedicine };
