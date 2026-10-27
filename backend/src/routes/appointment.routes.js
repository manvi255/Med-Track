import { Router } from "express";
import {
  createAppointmentController,
  deleteAppointmentController,
  getAppointmentController,
  listAppointmentsController,
  updateAppointmentController
} from "../controllers/appointment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validateAppointmentId } from "../middleware/validateAppointmentId.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { validateQuery } from "../middleware/validateQuery.middleware.js";
import {
  appointmentListQuerySchema,
  createAppointmentSchema,
  updateAppointmentSchema
} from "../validators/appointment.validators.js";

export const appointmentRouter = Router();

function asyncHandler(handler) {
  return function handleAsyncRoute(req, res, next) {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

appointmentRouter.route("/")
  .post(requireAuth, validateBody(createAppointmentSchema), asyncHandler(createAppointmentController))
  .get(
    requireAuth,
    validateQuery(appointmentListQuerySchema),
    asyncHandler(listAppointmentsController)
  );

appointmentRouter.route("/:id")
  .all(requireAuth, validateAppointmentId)
  .get(asyncHandler(getAppointmentController))
  .patch(validateBody(updateAppointmentSchema), asyncHandler(updateAppointmentController))
  .delete(asyncHandler(deleteAppointmentController));
