import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { validateMedicineId } from "../middleware/validateMedicineId.middleware.js";
import {
  createMedicineController,
  deleteMedicineController,
  getMedicineController,
  listMedicinesController,
  updateMedicineController
} from "../controllers/medicine.controller.js";
import {
  createMedicineSchema,
  updateMedicineSchema
} from "../validators/medicine.validators.js";

export const medicineRouter = Router();

function asyncHandler(handler) {
  return function handleAsyncRoute(req, res, next) {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

medicineRouter.route("/")
  .post(requireAuth, validateBody(createMedicineSchema), asyncHandler(createMedicineController))
  .get(requireAuth, asyncHandler(listMedicinesController));

medicineRouter.route("/:id")
  .all(requireAuth, validateMedicineId)
  .get(asyncHandler(getMedicineController))
  .patch(validateBody(updateMedicineSchema), asyncHandler(updateMedicineController))
  .delete(asyncHandler(deleteMedicineController));
