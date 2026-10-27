import { Router } from "express";
import {
  deleteNotificationController,
  listNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
  unreadCountController
} from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { validateNotificationId } from "../middleware/validateNotificationId.middleware.js";
import { validateQuery } from "../middleware/validateQuery.middleware.js";
import { notificationListQuerySchema } from "../validators/notification.validators.js";

export const notificationRouter = Router();

function asyncHandler(handler) {
  return function handleAsyncRoute(req, res, next) {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

notificationRouter.get(
  "/",
  requireAuth,
  validateQuery(notificationListQuerySchema),
  asyncHandler(listNotificationsController)
);
notificationRouter.get("/unread-count", requireAuth, asyncHandler(unreadCountController));
notificationRouter.patch("/read-all", requireAuth, asyncHandler(markAllNotificationsReadController));
notificationRouter.patch(
  "/:id/read",
  requireAuth,
  validateNotificationId,
  asyncHandler(markNotificationReadController)
);
notificationRouter.delete(
  "/:id",
  requireAuth,
  validateNotificationId,
  asyncHandler(deleteNotificationController)
);
