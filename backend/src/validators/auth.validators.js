import { z } from "zod";

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be no more than 72 characters")
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be no more than 72 UTF-8 bytes"
  });

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().trim().email("Email must be valid").max(254, "Email is too long").transform(
    (email) => email.toLowerCase()
  ),
  password: passwordSchema
});

export const loginSchema = z.object({
  email: z.string().trim().email("Email must be valid").max(254, "Email is too long").transform(
    (email) => email.toLowerCase()
  ),
  password: passwordSchema
});
