import { Router } from "express";
import {
  createScheduleController,
  deleteScheduleController,
  getScheduleController,
  listSchedulesController,
  updateScheduleController
} from "../controllers/schedule.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { validateQuery } from "../middleware/validateQuery.middleware.js";
import { validateScheduleId } from "../middleware/validateScheduleId.middleware.js";
import { createScheduleSchema, scheduleListQuerySchema, updateScheduleSchema } from "../validators/schedule.validators.js";

export const scheduleRouter = Router();

function asyncHandler(handler) {
  return function handleAsyncRoute(req, res, next) {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

scheduleRouter.route("/")
  .post(requireAuth, validateBody(createScheduleSchema), asyncHandler(createScheduleController))
  .get(requireAuth, validateQuery(scheduleListQuerySchema), asyncHandler(listSchedulesController));

scheduleRouter.route("/:id")
  .all(requireAuth, validateScheduleId)
  .get(asyncHandler(getScheduleController))
  .patch(validateBody(updateScheduleSchema), asyncHandler(updateScheduleController))
  .delete(asyncHandler(deleteScheduleController));
