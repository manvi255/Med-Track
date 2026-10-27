import { z } from "zod";

const pageNumber = z.string()
  .regex(/^\d{1,7}$/, "Must be a valid positive integer")
  .transform(Number)
  .pipe(z.number().int().min(1).max(1000000));
const pageLimit = z.string()
  .regex(/^\d{1,3}$/, "Must be an integer from 1 to 100")
  .transform(Number)
  .pipe(z.number().int().min(1).max(100));

export const notificationListQuerySchema = z.object({
  page: pageNumber.optional(),
  limit: pageLimit.optional()
}).strict();

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(4096).refine(
    (endpoint) => endpoint.startsWith("https://"),
    "Subscription endpoint must use HTTPS"
  ),
  expirationTime: z.number().nonnegative().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256)
  }).strict()
}).strict();
