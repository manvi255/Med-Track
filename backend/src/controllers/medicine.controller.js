import {
  createMedicine,
  deleteMedicine,
  getMedicine,
  listMedicines,
  updateMedicine
} from "../services/medicine.service.js";

function serializeMedicine(medicine) {
  return {
    id: medicine.id ?? medicine._id.toString(),
    name: medicine.name,
    category: medicine.category,
    dosage: medicine.dosage,
    ...(medicine.form === undefined ? {} : { form: medicine.form }),
    frequency: medicine.frequency,
    ...(medicine.instructions === undefined ? {} : { instructions: medicine.instructions }),
    startDate: medicine.startDate,
    ...(medicine.endDate === undefined ? {} : { endDate: medicine.endDate }),
    isActive: medicine.isActive,
    createdAt: medicine.createdAt,
    updatedAt: medicine.updatedAt
  };
}

export async function createMedicineController(req, res) {
  const medicine = await createMedicine(req.user.id, req.body);
  res.status(201).json({ medicine: serializeMedicine(medicine) });
}

export async function listMedicinesController(req, res) {
  const medicines = await listMedicines(req.user.id);
  res.status(200).json({ medicines: medicines.map(serializeMedicine) });
}

export async function getMedicineController(req, res) {
  const medicine = await getMedicine(req.user.id, req.params.id);
  res.status(200).json({ medicine: serializeMedicine(medicine) });
}

export async function updateMedicineController(req, res) {
  const medicine = await updateMedicine(req.user.id, req.params.id, req.body);
  res.status(200).json({ medicine: serializeMedicine(medicine) });
}

export async function deleteMedicineController(req, res) {
  await deleteMedicine(req.user.id, req.params.id);
  res.status(204).end();
}
