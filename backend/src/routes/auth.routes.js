import { Router } from "express";
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
  requireAuth
} from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { loginUser, registerUser, serializeUser } from "../services/auth.service.js";
import { loginSchema, registerSchema } from "../validators/auth.validators.js";

export const authRouter = Router();

function asyncHandler(handler) {
  return function handleAsyncRoute(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

authRouter.post("/register", validateBody(registerSchema), asyncHandler(async (req, res) => {
  const { user, token } = await registerUser(req.body);
  res.cookie(AUTH_COOKIE_NAME, token, { ...AUTH_COOKIE_OPTIONS, maxAge: AUTH_COOKIE_MAX_AGE });
  res.status(201).json({ user: serializeUser(user) });
}));

authRouter.post("/login", validateBody(loginSchema), asyncHandler(async (req, res) => {
  const { user, token } = await loginUser(req.body);
  res.cookie(AUTH_COOKIE_NAME, token, { ...AUTH_COOKIE_OPTIONS, maxAge: AUTH_COOKIE_MAX_AGE });
  res.status(200).json({ user: serializeUser(user) });
}));

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS);
  res.status(200).json({ message: "Logged out successfully" });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});
