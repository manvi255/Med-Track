import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { getAuthenticatedUser, serializeUser } from "../services/auth.service.js";
import { ApiError } from "../utils/ApiError.js";

export const AUTH_COOKIE_NAME = "meditrack_auth";
export const AUTH_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/v1"
});
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 1000;

function getAuthCookie(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!cookie) return undefined;

  try {
    return decodeURIComponent(cookie.slice(AUTH_COOKIE_NAME.length + 1));
  } catch {
    return undefined;
  }
}

export async function requireAuth(req, _res, next) {
  const token = getAuthCookie(req);
  if (!token) {
    next(new ApiError(401, "Authentication required"));
    return;
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    next(new ApiError(401, "Authentication required"));
    return;
  }

  if (!payload || typeof payload !== "object" || typeof payload.sub !== "string") {
    next(new ApiError(401, "Authentication required"));
    return;
  }

  try {
    const user = await getAuthenticatedUser(payload.sub);
    if (!user) {
      next(new ApiError(401, "Authentication required"));
      return;
    }

    req.user = serializeUser(user);
    next();
  } catch (error) {
    next(error);
  }
}
