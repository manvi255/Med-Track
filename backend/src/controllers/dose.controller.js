import { updateDoseStatus, listDosesByDateRange, listTodayDoses } from "../services/dose.service.js";

function serializeDose(dose) {
  return {
    id: dose.id ?? dose._id.toString(),
    medicine: dose.medicine.toString(),
    schedule: dose.schedule.toString(),
    scheduledFor: dose.scheduledFor,
    localDate: dose.localDate,
    timezone: dose.timezone,
    status: dose.status,
    ...(dose.takenAt === undefined ? {} : { takenAt: dose.takenAt }),
    ...(dose.notes === undefined ? {} : { notes: dose.notes }),
    createdAt: dose.createdAt,
    updatedAt: dose.updatedAt
  };
}

export async function listTodayDosesController(req, res) {
  const doses = await listTodayDoses(req.user.id);
  res.status(200).json({ doses: doses.map(serializeDose) });
}

export async function listDosesController(req, res) {
  const { startDate, endDate } = req.validatedQuery;
  const doses = await listDosesByDateRange(req.user.id, startDate, endDate);
  res.status(200).json({ doses: doses.map(serializeDose) });
}

export async function updateDoseStatusController(req, res) {
  const dose = await updateDoseStatus(req.user.id, req.params.id, req.body);
  res.status(200).json({ dose: serializeDose(dose) });
}
