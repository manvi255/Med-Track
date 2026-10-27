import { Router } from "express";
import {
  dashboardAdherenceController,
  dashboardSummaryController,
  dashboardUpcomingController
} from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validateQuery } from "../middleware/validateQuery.middleware.js";
import {
  dashboardAdherenceQuerySchema,
  dashboardEmptyQuerySchema,
  dashboardUpcomingQuerySchema
} from "../validators/dashboard.validators.js";

export const dashboardRouter = Router();

function asyncHandler(handler) {
  return function handleAsyncRoute(req, res, next) {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

dashboardRouter.get(
  "/summary",
  requireAuth,
  validateQuery(dashboardEmptyQuerySchema),
  asyncHandler(dashboardSummaryController)
);
dashboardRouter.get(
  "/adherence",
  requireAuth,
  validateQuery(dashboardAdherenceQuerySchema),
  asyncHandler(dashboardAdherenceController)
);
dashboardRouter.get(
  "/upcoming",
  requireAuth,
  validateQuery(dashboardUpcomingQuerySchema),
  asyncHandler(dashboardUpcomingController)
);
