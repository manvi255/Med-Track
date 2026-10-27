import { Router } from "express";
import {
  listDosesController,
  listTodayDosesController,
  updateDoseStatusController
} from "../controllers/dose.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { validateDoseId } from "../middleware/validateDoseId.middleware.js";
import { validateQuery } from "../middleware/validateQuery.middleware.js";
import {
  doseRangeQuerySchema,
  updateDoseStatusSchema
} from "../validators/schedule.validators.js";

export const doseRouter = Router();

function asyncHandler(handler) {
  return function handleAsyncRoute(req, res, next) {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

doseRouter.get("/today", requireAuth, asyncHandler(listTodayDosesController));
doseRouter.get("/", requireAuth, validateQuery(doseRangeQuerySchema), asyncHandler(listDosesController));
doseRouter.patch(
  "/:id/status",
  requireAuth,
  validateDoseId,
  validateBody(updateDoseStatusSchema),
  asyncHandler(updateDoseStatusController)
);
