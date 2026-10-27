import {
  createAppointment,
  deleteAppointment,
  getAppointment,
  listAppointments,
  updateAppointment
} from "../services/appointment.service.js";

function serializeAppointment(appointment) {
  return {
    id: appointment.id ?? appointment._id.toString(),
    doctorName: appointment.doctorName,
    ...(appointment.clinicName === undefined ? {} : { clinicName: appointment.clinicName }),
    ...(appointment.location === undefined ? {} : { location: appointment.location }),
    appointmentType: appointment.appointmentType,
    scheduledAt: appointment.scheduledAt,
    timezone: appointment.timezone,
    status: appointment.status,
    reminders: {
      enabled: appointment.reminders.enabled,
      leadHours: appointment.reminders.leadHours
    },
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt
  };
}

export async function createAppointmentController(req, res) {
  const appointment = await createAppointment(req.user.id, req.body);
  res.status(201).json({ appointment: serializeAppointment(appointment) });
}

export async function listAppointmentsController(req, res) {
  const result = await listAppointments(req.user.id, req.validatedQuery);
  res.status(200).json({
    appointments: result.appointments.map(serializeAppointment),
    pagination: result.pagination
  });
}

export async function getAppointmentController(req, res) {
  const appointment = await getAppointment(req.user.id, req.params.id);
  res.status(200).json({ appointment: serializeAppointment(appointment) });
}

export async function updateAppointmentController(req, res) {
  const appointment = await updateAppointment(req.user.id, req.params.id, req.body);
  res.status(200).json({ appointment: serializeAppointment(appointment) });
}

export async function deleteAppointmentController(req, res) {
  await deleteAppointment(req.user.id, req.params.id);
  res.status(204).end();
}
