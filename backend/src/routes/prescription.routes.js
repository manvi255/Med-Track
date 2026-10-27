import { Router } from "express";
import {
  confirmPrescriptionController,
  deletePrescriptionController,
  getPrescriptionController,
  listPrescriptionsController,
  uploadPrescriptionController
} from "../controllers/prescription.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { uploadPrescriptionFile } from "../middleware/prescriptionUpload.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { validatePrescriptionId } from "../middleware/validatePrescriptionId.middleware.js";
import { confirmPrescriptionSchema } from "../validators/prescription.validators.js";

export const prescriptionRouter = Router();

function asyncHandler(handler) {
  return function handleAsyncRoute(req, res, next) {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

prescriptionRouter.post(
  "/upload",
  requireAuth,
  uploadPrescriptionFile,
  asyncHandler(uploadPrescriptionController)
);
prescriptionRouter.get("/", requireAuth, asyncHandler(listPrescriptionsController));
prescriptionRouter.get(
  "/:id",
  requireAuth,
  validatePrescriptionId,
  asyncHandler(getPrescriptionController)
);
prescriptionRouter.post(
  "/:id/confirm",
  requireAuth,
  validatePrescriptionId,
  validateBody(confirmPrescriptionSchema),
  asyncHandler(confirmPrescriptionController)
);
prescriptionRouter.delete(
  "/:id",
  requireAuth,
  validatePrescriptionId,
  asyncHandler(deletePrescriptionController)
);
