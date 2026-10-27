import { z } from "zod";

const pageLimit = z.string()
  .regex(/^\d{1,3}$/, "Must be an integer from 1 to 100")
  .transform(Number)
  .pipe(z.number().int().min(1).max(100));

export const dashboardEmptyQuerySchema = z.object({}).strict();

export const dashboardAdherenceQuerySchema = z.object({
  period: z.enum(["7d", "30d"]).default("7d")
}).strict();

export const dashboardUpcomingQuerySchema = z.object({
  limit: pageLimit.optional()
}).strict();
