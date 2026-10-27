import { Router } from "express";
import { pushPublicKeyController, subscribePushController, unsubscribePushController } from "../controllers/push.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { pushSubscriptionSchema } from "../validators/notification.validators.js";

export const pushRouter = Router();

function asyncHandler(handler) {
  return function handleAsyncRoute(req, res, next) {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

pushRouter.get("/public-key", pushPublicKeyController);
pushRouter.post(
  "/subscribe",
  requireAuth,
  validateBody(pushSubscriptionSchema),
  asyncHandler(subscribePushController)
);
pushRouter.delete(
  "/subscribe",
  requireAuth,
  validateBody(pushSubscriptionSchema.pick({ endpoint: true })),
  asyncHandler(unsubscribePushController)
);
