import { useCallback, useState } from "react";
import { createAppointment, deleteAppointment, listAppointments, updateAppointment } from "../api/resources.js";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { Feedback } from "../components/Feedback.jsx";
import { FormField } from "../components/FormField.jsx";
import { LoadState } from "../components/LoadState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useRemoteData } from "../hooks/useRemoteData.js";

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const appointmentTypes = ["consultation", "follow_up", "test", "procedure", "other"];
const emptyForm = () => ({
  doctorName: "",
  clinicName: "",
  location: "",
  appointmentType: "consultation",
  scheduledAt: "",
  status: "scheduled",
  reminders: { enabled: true, leadHours: ["24", "1"] }
});

function localDateTimeValue(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatAppointmentTime(value, timezone) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  });
}

function formFromAppointment(appointment) {
  return {
    doctorName: appointment.doctorName,
    clinicName: appointment.clinicName ?? "",
    location: appointment.location ?? "",
    appointmentType: appointment.appointmentType,
    scheduledAt: localDateTimeValue(appointment.scheduledAt),
    status: appointment.status,
    reminders: {
      enabled: appointment.reminders.enabled,
      leadHours: (appointment.reminders.leadHours ?? [24, 1]).map(String)
    }
  };
}

function appointmentPayload(form) {
  return {
    doctorName: form.doctorName,
    ...(form.clinicName ? { clinicName: form.clinicName } : {}),
    ...(form.location ? { location: form.location } : {}),
    appointmentType: form.appointmentType,
    scheduledAt: new Date(form.scheduledAt).toISOString(),
    timezone: browserTimezone,
    status: form.status,
    reminders: {
      enabled: form.reminders.enabled,
      ...(form.reminders.enabled
        ? { leadHours: form.reminders.leadHours.map(Number) }
        : {})
    }
  };
}

export function AppointmentsPage() {
  const [filter, setFilter] = useState({ status: "", period: "upcoming", page: 1 });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadAppointments = useCallback(
    () => listAppointments({ ...filter, status: filter.status || undefined, period: filter.period || undefined, limit: 10 }),
    [filter]
  );
  const { data, isLoading, error, refresh } = useRemoteData(loadAppointments, [loadAppointments]);
  const numericReminderLeads = form.reminders.leadHours.map(Number);
  const duplicateReminderLeads = new Set(numericReminderLeads).size !== numericReminderLeads.length;

  function startCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setActionError("");
    setShowForm(true);
  }

  function startEdit(appointment) {
    setForm(formFromAppointment(appointment));
    setEditingId(appointment.id);
    setActionError("");
    setShowForm(true);
  }

  async function submitAppointment(event) {
    event.preventDefault();
    setActionError("");
    setNotice("");
    setIsSaving(true);
    try {
      if (editingId) {
        await updateAppointment(editingId, appointmentPayload(form));
        setNotice("Appointment updated.");
      } else {
        await createAppointment(appointmentPayload(form));
        setNotice("Appointment created.");
      }
      setShowForm(false);
      setEditingId(null);
      await refresh();
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAppointment(appointment) {
    if (!window.confirm(`Delete the appointment with ${appointment.doctorName}?`)) return;
    setActionError("");
    try {
      await deleteAppointment(appointment.id);
      setNotice("Appointment deleted.");
      await refresh();
    } catch (requestError) {
      setActionError(requestError.message);
    }
  }

  async function toggleAppointmentCompleted(appointment, checked) {
    setActionError("");
    setNotice("");
    try {
      await updateAppointment(appointment.id, { status: checked ? "completed" : "scheduled" });
      setNotice(checked ? "Appointment marked as completed." : "Appointment marked as scheduled.");
      await refresh();
    } catch (requestError) {
      setActionError(requestError.message);
    }
  }

  function updateReminderLead(index, value) {
    setForm({
      ...form,
      reminders: {
        ...form.reminders,
        leadHours: form.reminders.leadHours.map((hours, leadIndex) => (
          leadIndex === index ? value : hours
        ))
      }
    });
  }

  return (
    <>
      <PageHeader eyebrow="YOUR CARE VISITS" title="Appointments" description="Keep upcoming appointments organized. Reminder delivery is managed by MediTrack’s backend.">
        <Button onClick={startCreate}>Add appointment</Button>
      </PageHeader>
      {notice && <Feedback>{notice}</Feedback>}
      {actionError && <Feedback variant="error">{actionError}</Feedback>}

      {showForm && (
        <Card className="editor-card">
          <div className="editor-heading">
            <div><p className="eyebrow">{editingId ? "UPDATE VISIT" : "NEW VISIT"}</p><h2>{editingId ? "Edit appointment" : "Add an appointment"}</h2></div>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Close</Button>
          </div>
          <form className="data-form" onSubmit={submitAppointment}>
            <FormField id="doctorName" label="Doctor or care provider" value={form.doctorName} onChange={(event) => setForm({ ...form, doctorName: event.target.value })} maxLength={200} required />
            <FormField id="clinicName" label="Clinic (optional)" value={form.clinicName} onChange={(event) => setForm({ ...form, clinicName: event.target.value })} maxLength={200} />
            <FormField id="location" label="Location (optional)" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} maxLength={500} />
            <label className="form-field">
              <span>Appointment type</span>
              <select value={form.appointmentType} onChange={(event) => setForm({ ...form, appointmentType: event.target.value })}>
                {appointmentTypes.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}
              </select>
            </label>
            <FormField id="scheduledAt" type="datetime-local" label="Date and time" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} required />
            {editingId && (
              <label className="form-field">
                <span>Status</span>
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            )}
            <label className="check-field form-field--wide">
              <input type="checkbox" checked={form.reminders.enabled} onChange={(event) => setForm({
                ...form,
                reminders: { ...form.reminders, enabled: event.target.checked }
              })} />
              <span>Enable appointment reminders</span>
            </label>
            <fieldset className="form-field form-field--wide weekday-field">
              <legend>Reminder times before the appointment</legend>
              <div className="dose-time-list">
                {form.reminders.leadHours.map((hours, index) => (
                  <div className="dose-time-row" key={`appointment-reminder-${index}`}>
                    <FormField
                      id={`appointmentReminder-${index}`}
                      type="number"
                      label={`Reminder ${index + 1} (hours before)`}
                      min="1"
                      max="720"
                      step="1"
                      value={hours}
                      disabled={!form.reminders.enabled}
                      required={form.reminders.enabled}
                      onChange={(event) => updateReminderLead(index, event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!form.reminders.enabled || form.reminders.leadHours.length === 1}
                      onClick={() => setForm({
                        ...form,
                        reminders: {
                          ...form.reminders,
                          leadHours: form.reminders.leadHours.filter((_, leadIndex) => leadIndex !== index)
                        }
                      })}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!form.reminders.enabled || form.reminders.leadHours.length >= 10}
                  onClick={() => setForm({
                    ...form,
                    reminders: { ...form.reminders, leadHours: [...form.reminders.leadHours, "2"] }
                  })}
                >
                  Add reminder time
                </Button>
              </div>
            </fieldset>
            {form.reminders.enabled && duplicateReminderLeads && (
              <p className="form-hint form-field--wide">Reminder lead times must be unique.</p>
            )}
            <p className="form-hint form-field--wide">Date and time are interpreted in this browser’s timezone: {browserTimezone}.</p>
            {actionError && <Feedback variant="error">{actionError}</Feedback>}
            <div className="form-actions form-field--wide">
              <Button type="submit" disabled={isSaving || (form.reminders.enabled && duplicateReminderLeads)}>{isSaving ? "Saving…" : editingId ? "Save changes" : "Create appointment"}</Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="list-toolbar">
        <label className="compact-select">
          <span>Status</span>
          <select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value, page: 1 })}>
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="compact-select">
          <span>Date range</span>
          <select value={filter.period} onChange={(event) => setFilter({ ...filter, period: event.target.value, page: 1 })}>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="">Any date</option>
          </select>
        </label>
      </div>
      <LoadState isLoading={isLoading} error={error} onRetry={refresh}>
        {!data?.appointments?.length ? (
          <Card className="empty-state"><span className="empty-icon">A</span><h2>No appointments found</h2><p>Your appointments will appear here after you add one.</p><Button onClick={startCreate}>Add appointment</Button></Card>
        ) : (
          <>
            <div className="status-summary">
              <span className="status-summary__item">Total: {data.appointments.length}</span>
              <span className="status-summary__item">Completed: {data.appointments.filter((appointment) => appointment.status === "completed").length}</span>
              <span className="status-summary__item">Pending: {data.appointments.filter((appointment) => appointment.status !== "completed" && appointment.status !== "cancelled").length}</span>
            </div>
            <div className="entity-list">
              {data.appointments.map((appointment) => (
                <Card className="entity-card" key={appointment.id}>
                  <div className="entity-mark entity-mark--appointment">A</div>
                  <div className="entity-main">
                    <div className="entity-title-row"><h2>{appointment.doctorName}</h2><span className={`status-pill status-pill--${appointment.status}`}>{appointment.status}</span></div>
                    <p>{formatAppointmentTime(appointment.scheduledAt, appointment.timezone)} · {appointment.appointmentType.replace("_", " ")}</p>
                    <span className="entity-meta">{[appointment.clinicName, appointment.location].filter(Boolean).join(" · ") || appointment.timezone}</span>
                    <span className="entity-meta">
                      Reminders {appointment.reminders.enabled
                        ? `on (${(appointment.reminders.leadHours ?? []).join(", ")}h before)`
                        : "off"} · {appointment.timezone}
                    </span>
                  </div>
                  <div className="entity-actions">
                    <label className="check-field appointment-done-toggle">
                      <input
                        type="checkbox"
                        checked={appointment.status === "completed"}
                        onChange={(event) => toggleAppointmentCompleted(appointment, event.target.checked)}
                      />
                      <span>Done</span>
                    </label>
                    <Button variant="secondary" onClick={() => startEdit(appointment)}>Edit</Button>
                    <Button variant="danger" onClick={() => removeAppointment(appointment)}>Delete</Button>
                  </div>
                </Card>
              ))}
            </div>
            <div className="pagination-row">
              <span>{data.pagination.total} appointment{data.pagination.total === 1 ? "" : "s"}</span>
              <div>
                <Button variant="secondary" disabled={filter.page <= 1} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Previous</Button>
                <span>Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)}</span>
                <Button variant="secondary" disabled={filter.page >= data.pagination.totalPages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next</Button>
              </div>
            </div>
          </>
        )}
      </LoadState>
    </>
  );
}
