import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";

export function validateAppointmentId(req, _res, next) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id) || !mongoose.isValidObjectId(req.params.id)) {
    next(new ApiError(400, "Invalid appointment ID"));
    return;
  }
  next();
}
