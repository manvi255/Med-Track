import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";

const TOKEN_LIFETIME = "1h";

export function serializeUser(user) {
  return {
    id: user.id ?? user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function generateAuthToken(userId) {
  return jwt.sign({ sub: userId.toString() }, env.JWT_SECRET, {
    expiresIn: TOKEN_LIFETIME
  });
}

export async function registerUser({ name, email, password }) {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const user = new User({ name, email, password });
  try {
    await user.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "An account with this email already exists");
    }
    throw error;
  }

  return {
    user,
    token: generateAuthToken(user.id)
  };
}

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new ApiError(401, "Invalid email or password");
  }

  return {
    user,
    token: generateAuthToken(user.id)
  };
}

export async function getAuthenticatedUser(userId) {
  return User.findById(userId);
}
