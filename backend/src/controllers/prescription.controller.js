import { readFile } from "node:fs/promises";
import { ApiError } from "../utils/ApiError.js";
import {
  confirmPrescription,
  detectImageMime,
  deletePrescription,
  getPrescription,
  listPrescriptions,
  serializeMedicine,
  serializePrescription,
  uploadPrescription
} from "../services/prescription.service.js";
import { removePrescriptionFile } from "../utils/prescriptionFiles.js";

async function removeUpload(file) {
  if (!file?.filename) return;
  try {
    await removePrescriptionFile(file.filename);
  } catch {
    throw new ApiError(500, "Unable to clean up prescription upload");
  }
}

export async function uploadPrescriptionController(req, res) {
  if (!req.file) {
    throw new ApiError(400, "A prescription image file is required");
  }

  let actualMimeType;
  try {
    const contents = await readFile(req.file.path);
    actualMimeType = detectImageMime(contents);
  } catch {
    await removeUpload(req.file);
    throw new ApiError(400, "Uploaded file is not a valid supported image");
  }

  if (!actualMimeType || actualMimeType !== req.file.mimetype) {
    await removeUpload(req.file);
    throw new ApiError(400, "Uploaded file is not a valid supported image");
  }

  try {
    const prescription = await uploadPrescription({
      userId: req.user.id,
      file: req.file,
      storageKey: req.file.filename,
      mimeType: actualMimeType
    });
    res.status(201).json({
      prescription: serializePrescription(prescription, { includeReviewContent: true })
    });
  } catch (error) {
    await removeUpload(req.file);
    throw error instanceof ApiError ? error : new ApiError(500, "Unable to process prescription upload");
  }
}

export async function listPrescriptionsController(req, res) {
  const prescriptions = await listPrescriptions(req.user.id);
  res.status(200).json({
    prescriptions: prescriptions.map((prescription) => serializePrescription(prescription))
  });
}

export async function getPrescriptionController(req, res) {
  const prescription = await getPrescription(req.user.id, req.params.id);
  res.status(200).json({
    prescription: serializePrescription(prescription, { includeReviewContent: true })
  });
}

export async function confirmPrescriptionController(req, res) {
  const { prescription, medicines } = await confirmPrescription(
    req.user.id,
    req.params.id,
    req.body.medicines
  );
  res.status(200).json({
    prescription: serializePrescription(prescription, { includeReviewContent: true }),
    medicines: medicines.map(serializeMedicine)
  });
}

export async function deletePrescriptionController(req, res) {
  await deletePrescription(req.user.id, req.params.id, removePrescriptionFile);
  res.status(204).end();
}
