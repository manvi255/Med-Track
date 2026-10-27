import { randomUUID } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import multer from "multer";
import { ApiError } from "../utils/ApiError.js";
import {
  ensurePrescriptionStorageDirectory,
  PRESCRIPTION_STORAGE_DIR,
  removePrescriptionFile
} from "../utils/prescriptionFiles.js";
import { getPrescriptionExtension } from "../services/prescription.service.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    mkdir(PRESCRIPTION_STORAGE_DIR, { recursive: true, mode: 0o700 })
      .then(() => callback(null, PRESCRIPTION_STORAGE_DIR))
      .catch(() => callback(new ApiError(500, "Prescription storage is unavailable")));
  },
  filename(_req, file, callback) {
    const extension = getPrescriptionExtension(file.mimetype);
    if (!extension) {
      callback(new ApiError(400, "Only JPEG, PNG, and WebP images are supported"));
      return;
    }
    callback(null, `${randomUUID()}.${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter(_req, file, callback) {
    if (!getPrescriptionExtension(file.mimetype)) {
      callback(new ApiError(400, "Only JPEG, PNG, and WebP images are supported"));
      return;
    }
    callback(null, true);
  }
}).single("file");

export async function uploadPrescriptionFile(req, res, next) {
  try {
    await ensurePrescriptionStorageDirectory();
  } catch {
    next(new ApiError(500, "Prescription storage is unavailable"));
    return;
  }

  upload(req, res, async (error) => {
    if (!error) {
      if (req.file?.path) {
        try {
          await chmod(req.file.path, 0o600);
        } catch {
          try {
            await removePrescriptionFile(req.file.filename);
          } catch {
            next(new ApiError(500, "Unable to secure uploaded file"));
            return;
          }
          next(new ApiError(500, "Unable to secure uploaded file"));
          return;
        }
      }
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "File must be no larger than 5 MB"
        : "Invalid prescription upload";
      next(new ApiError(status, message));
      return;
    }

    next(error instanceof ApiError
      ? error
      : new ApiError(500, "Unable to receive prescription upload"));
  });
}
