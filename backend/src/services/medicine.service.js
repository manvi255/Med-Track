import { Medicine } from "../models/Medicine.js";
import { ApiError } from "../utils/ApiError.js";

function medicineNotFound() {
  return new ApiError(404, "Medicine not found");
}

export function createMedicine(userId, medicineData) {
  return new Medicine({
    ...medicineData,
    user: userId
  }).save();
}

export function listMedicines(userId) {
  return Medicine.find({ user: userId }).sort({ createdAt: -1 });
}

export async function getMedicine(userId, medicineId) {
  const medicine = await Medicine.findOne({ _id: medicineId, user: userId });
  if (!medicine) {
    throw medicineNotFound();
  }
  return medicine;
}

export async function updateMedicine(userId, medicineId, medicineData) {
  const medicine = await Medicine.findOne({ _id: medicineId, user: userId });
  if (!medicine) {
    throw medicineNotFound();
  }

  const startDate = medicineData.startDate ?? medicine.startDate;
  const endDate = medicineData.endDate ?? medicine.endDate;
  if (endDate && startDate && endDate < startDate) {
    throw new ApiError(400, "endDate must not precede startDate");
  }

  Object.assign(medicine, medicineData);
  return medicine.save();
}

export async function deleteMedicine(userId, medicineId) {
  const medicine = await Medicine.findOneAndDelete({ _id: medicineId, user: userId });
  if (!medicine) {
    throw medicineNotFound();
  }
}
