import { useCallback, useMemo, useState } from "react";
import {
  createSchedule,
  deleteSchedule,
  listDoseHistory,
  listMedicines,
  listSchedules,
  listTodayDoses,
  updateDoseStatus,
  updateSchedule
} from "../api/resources.js";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { Feedback } from "../components/Feedback.jsx";
import { FormField } from "../components/FormField.jsx";
import { LoadState } from "../components/LoadState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useRemoteData } from "../hooks/useRemoteData.js";

const todayDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const emptySchedule = () => ({
  medicine: "",
  doseAmount: "",
  doseUnit: "",
  frequency: "",
  times: [""],
  daysOfWeek: [],
  startDate: todayDate(),
  endDate: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  instructions: "",
  reminders: { enabled: true, leadMinutes: "15" },
  isActive: true
});
const weekDays = [
  ["Sun", 0], ["Mon", 1], ["Tue", 2], ["Wed", 3],
  ["Thu", 4], ["Fri", 5], ["Sat", 6]
];

function makePayload(form) {
  return {
    medicine: form.medicine,
    doseAmount: Number(form.doseAmount),
    doseUnit: form.doseUnit,
    frequency: form.frequency,
    times: form.times,
    daysOfWeek: form.frequency === "selected_days" ? form.daysOfWeek : [],
    startDate: form.startDate,
    ...(form.endDate ? { endDate: form.endDate } : {}),
    timezone: form.timezone,
    reminders: {
      enabled: form.reminders.enabled,
      leadMinutes: Number(form.reminders.leadMinutes)
    },
    ...(form.instructions ? { instructions: form.instructions } : {}),
    isActive: form.isActive
  };
}

function asDate(value) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function SchedulesPage() {
  const [section, setSection] = useState("today");
  const [form, setForm] = useState(emptySchedule);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [range, setRange] = useState({ startDate: todayDate(), endDate: todayDate() });
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const loadBase = useCallback(async () => {
    const [schedules, medicines, doses] = await Promise.all([
      listSchedules(),
      listMedicines(),
      listTodayDoses()
    ]);
    return { schedules, medicines, doses };
  }, []);
  const { data, isLoading, error, refresh } = useRemoteData(loadBase, [loadBase]);
  const medicineById = useMemo(
    () => new Map((data?.medicines ?? []).map((medicine) => [medicine.id, medicine])),
    [data?.medicines]
  );
  const scheduleById = useMemo(
    () => new Map((data?.schedules ?? []).map((schedule) => [schedule.id, schedule])),
    [data?.schedules]
  );
  const duplicateTimes = new Set(form.times).size !== form.times.length;
  const missingMultipleDailyTime = form.frequency === "multiple_daily" && form.times.length < 2;

  function beginCreate() {
    setForm({ ...emptySchedule(), medicine: data?.medicines?.[0]?.id ?? "" });
    setEditingId(null);
    setActionError("");
    setShowForm(true);
  }

  function beginEdit(schedule) {
    setForm({
      medicine: schedule.medicine,
      doseAmount: String(schedule.doseAmount),
      doseUnit: schedule.doseUnit,
      frequency: schedule.frequency,
      times: [...schedule.times],
      daysOfWeek: schedule.daysOfWeek ?? [],
      startDate: new Date(schedule.startDate).toISOString().slice(0, 10),
      endDate: schedule.endDate ? new Date(schedule.endDate).toISOString().slice(0, 10) : "",
      timezone: schedule.timezone,
      instructions: schedule.instructions ?? "",
      reminders: {
        enabled: schedule.reminders?.enabled ?? true,
        leadMinutes: String(schedule.reminders?.leadMinutes ?? 15)
      },
      isActive: schedule.isActive
    });
    setEditingId(schedule.id);
    setActionError("");
    setShowForm(true);
  }

  async function submitSchedule(event) {
    event.preventDefault();
    setActionError("");
    setNotice("");
    setIsSaving(true);
    try {
      if (editingId) {
        await updateSchedule(editingId, makePayload(form));
        setNotice("Schedule updated. Future upcoming doses were refreshed by the backend.");
      } else {
        await createSchedule(makePayload(form));
        setNotice("Schedule created.");
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

  async function removeSchedule(schedule) {
    const medicineName = medicineById.get(schedule.medicine)?.name ?? "this schedule";
    if (!window.confirm(`Delete the schedule for ${medicineName}? Future upcoming doses will also be removed.`)) return;
    setActionError("");
    try {
      await deleteSchedule(schedule.id);
      setNotice("Schedule deleted.");
      await refresh();
    } catch (requestError) {
      setActionError(requestError.message);
    }
  }

  async function changeDoseStatus(dose, status) {
    setActionError("");
    setNotice("");
    try {
      await updateDoseStatus(dose.id, { status });
      setNotice(status === "taken" ? "Dose marked as taken." : "Dose marked as skipped.");
      await refresh();
      if (historyLoaded) await loadHistory();
    } catch (requestError) {
      setActionError(requestError.message);
    }
  }

  async function loadHistory(event) {
    event?.preventDefault();
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const doses = await listDoseHistory(range.startDate, range.endDate);
      setHistory(doses);
      setHistoryLoaded(true);
    } catch (requestError) {
      setHistoryError(requestError.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  function updateDoseTime(index, time) {
    setForm({
      ...form,
      times: form.times.map((value, timeIndex) => timeIndex === index ? time : value)
    });
  }

  function addDoseTime() {
    setForm({ ...form, times: [...form.times, "12:00"] });
  }

  function removeDoseTime(index) {
    setForm({ ...form, times: form.times.filter((_, timeIndex) => timeIndex !== index) });
  }

  return (
    <>
      <PageHeader
        eyebrow="YOUR ROUTINES"
        title="Schedules & doses"
        description="Review your schedules, today's dose records, and a date range of dose history."
      >
        <Button onClick={beginCreate} disabled={!data?.medicines?.length}>Create schedule</Button>
      </PageHeader>
      {notice && <Feedback>{notice}</Feedback>}
      {actionError && <Feedback variant="error">{actionError}</Feedback>}

      <div className="tab-row" role="tablist" aria-label="Schedule and dose views">
        {[
          ["today", "Today's doses"],
          ["schedules", "Schedules"],
          ["history", "Dose history"]
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={section === id} className={`view-tab${section === id ? " view-tab--active" : ""}`} onClick={() => setSection(id)}>
            {label}
          </button>
        ))}
      </div>

      {showForm && (
        <Card className="editor-card">
          <div className="editor-heading">
            <div>
              <p className="eyebrow">{editingId ? "UPDATE ROUTINE" : "NEW ROUTINE"}</p>
              <h2>{editingId ? "Edit schedule" : "Create a schedule"}</h2>
            </div>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Close</Button>
          </div>
          <form className="data-form" onSubmit={submitSchedule}>
            <label className="form-field">
              <span>Medicine</span>
              <select value={form.medicine} onChange={(event) => setForm({ ...form, medicine: event.target.value })} required>
                <option value="">Choose a medicine</option>
                {(data?.medicines ?? []).map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name}</option>)}
              </select>
            </label>
            <FormField id="doseAmount" type="number" label="Dose amount" min="0.000001" step="any" value={form.doseAmount} onChange={(event) => setForm({ ...form, doseAmount: event.target.value })} required />
            <FormField id="doseUnit" label="Dose unit" placeholder="tablet, mL, mg…" value={form.doseUnit} onChange={(event) => setForm({ ...form, doseUnit: event.target.value })} maxLength={50} required />
            <label className="form-field">
              <span>Frequency pattern</span>
              <select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value, daysOfWeek: [] })} required>
                <option value="" disabled>Choose a pattern</option>
                <option value="daily">Daily</option>
                <option value="multiple_daily">Multiple times daily</option>
                <option value="selected_days">Selected days</option>
              </select>
            </label>
            <fieldset className="form-field form-field--wide weekday-field">
              <legend>Dose times ({form.timezone})</legend>
              <div className="dose-time-list">
                {form.times.map((time, index) => (
                  <div className="dose-time-row" key={`dose-time-${index}`}>
                    <label className="form-field">
                      <span>Dose time {index + 1}</span>
                      <input type="time" value={time} onChange={(event) => updateDoseTime(index, event.target.value)} required />
                    </label>
                    <Button type="button" variant="secondary" disabled={form.times.length === 1} onClick={() => removeDoseTime(index)}>Remove</Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" disabled={form.times.length >= 24} onClick={addDoseTime}>Add another time</Button>
              </div>
            </fieldset>
            {missingMultipleDailyTime && <p className="form-hint form-field--wide">Add at least two times for a multiple-times-daily schedule.</p>}
            {duplicateTimes && <p className="form-hint form-field--wide">Each dose time must be unique.</p>}
            {form.frequency === "selected_days" && (
              <fieldset className="form-field form-field--wide weekday-field">
                <legend>Days of week</legend>
                <div className="weekday-options">
                  {weekDays.map(([label, day]) => (
                    <label className="check-field" key={day}>
                      <input
                        type="checkbox"
                        checked={form.daysOfWeek.includes(day)}
                        onChange={(event) => setForm({
                          ...form,
                          daysOfWeek: event.target.checked
                            ? [...form.daysOfWeek, day]
                            : form.daysOfWeek.filter((value) => value !== day)
                        })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <FormField id="startDate" type="date" label="Start date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required />
            <FormField id="endDate" type="date" label="End date (optional)" min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
            <FormField id="timezone" label="IANA timezone" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} required />
            <label className="check-field form-field--wide">
              <input
                type="checkbox"
                checked={form.reminders.enabled}
                onChange={(event) => setForm({
                  ...form,
                  reminders: { ...form.reminders, enabled: event.target.checked }
                })}
              />
              <span>Enable reminders for this schedule</span>
            </label>
            <FormField
              id="reminderLeadMinutes"
              type="number"
              label="Reminder lead time (minutes)"
              min="1"
              max="1440"
              step="1"
              value={form.reminders.leadMinutes}
              onChange={(event) => setForm({
                ...form,
                reminders: { ...form.reminders, leadMinutes: event.target.value }
              })}
              disabled={!form.reminders.enabled}
              required={form.reminders.enabled}
            />
            <label className="form-field form-field--wide">
              <span>Instructions (optional)</span>
              <textarea rows="2" maxLength={2000} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} />
            </label>
            {editingId && <label className="check-field form-field--wide"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Schedule is active</label>}
            {actionError && <Feedback variant="error">{actionError}</Feedback>}
            <div className="form-actions form-field--wide">
              <Button type="submit" disabled={isSaving || !data?.medicines?.length || duplicateTimes || missingMultipleDailyTime}>{isSaving ? "Saving…" : editingId ? "Save changes" : "Create schedule"}</Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <LoadState isLoading={isLoading} error={error} onRetry={refresh}>
        {!data?.medicines?.length && section === "schedules" && (
          <Feedback>Add a medicine before creating a schedule.</Feedback>
        )}
        {section === "today" && (
          <>
            <Feedback>Today’s dose list is generated by the backend using each schedule’s timezone. Its endpoint records overdue upcoming doses as missed.</Feedback>
            {!data?.doses?.length ? (
              <Card className="empty-state"><span className="empty-icon">D</span><h2>No doses for today</h2><p>No dose occurrences are currently recorded for today.</p></Card>
            ) : (
              <div className="entity-list">
                {data.doses.map((dose) => {
                  const schedule = scheduleById.get(dose.schedule);
                  const medicine = medicineById.get(dose.medicine);
                  return (
                    <Card className="entity-card" key={dose.id}>
                      <div className="entity-mark entity-mark--dose">D</div>
                      <div className="entity-main">
                        <div className="entity-title-row"><h2>{medicine?.name ?? "Medicine"}</h2><span className={`status-pill status-pill--${dose.status}`}>{dose.status}</span></div>
                        <p>{schedule ? `${schedule.doseAmount} ${schedule.doseUnit}` : "Dose details unavailable"} · {asDate(dose.scheduledFor)}</p>
                        <span className="entity-meta">Scheduled {dose.timezone} local time</span>
                      </div>
                      {["upcoming", "missed"].includes(dose.status) && (
                        <div className="entity-actions">
                          <Button onClick={() => changeDoseStatus(dose, "taken")}>Mark taken</Button>
                          <Button variant="secondary" onClick={() => changeDoseStatus(dose, "skipped")}>Skip</Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
        {section === "schedules" && (
          !data?.schedules?.length ? (
            <Card className="empty-state"><span className="empty-icon">S</span><h2>No schedules yet</h2><p>Create a schedule for one of your medicines to see it here.</p><Button onClick={beginCreate} disabled={!data?.medicines?.length}>Create schedule</Button></Card>
          ) : (
            <div className="entity-list">
              {data.schedules.map((schedule) => (
                <Card className="entity-card" key={schedule.id}>
                  <div className="entity-mark entity-mark--schedule">S</div>
                  <div className="entity-main">
                    <div className="entity-title-row"><h2>{medicineById.get(schedule.medicine)?.name ?? "Medicine"}</h2><span className={`status-pill ${schedule.isActive ? "status-pill--good" : "status-pill--muted"}`}>{schedule.isActive ? "Active" : "Inactive"}</span></div>
                    <p>{schedule.doseAmount} {schedule.doseUnit} · {schedule.frequency.replace("_", " ")} · {schedule.times.join(", ")}</p>
                    <span className="entity-meta">
                      {schedule.timezone} · from {new Date(schedule.startDate).toLocaleDateString()}
                      {" · reminders "}{schedule.reminders?.enabled ? `on (${schedule.reminders.leadMinutes} min before)` : "off"}
                    </span>
                  </div>
                  <div className="entity-actions"><Button variant="secondary" onClick={() => beginEdit(schedule)}>Edit</Button><Button variant="danger" onClick={() => removeSchedule(schedule)}>Delete</Button></div>
                </Card>
              ))}
            </div>
          )
        )}
      </LoadState>

      {section === "history" && (
        <Card className="history-card">
          <form className="history-filter" onSubmit={loadHistory}>
            <FormField id="historyStart" type="date" label="From" value={range.startDate} onChange={(event) => setRange({ ...range, startDate: event.target.value })} required />
            <FormField id="historyEnd" type="date" label="To" value={range.endDate} onChange={(event) => setRange({ ...range, endDate: event.target.value })} required />
            <Button type="submit" disabled={historyLoading}>{historyLoading ? "Loading…" : "Load history"}</Button>
          </form>
          {historyError && <Feedback variant="error">{historyError}</Feedback>}
          {historyLoading && <Feedback>Loading dose history…</Feedback>}
          {!historyLoading && historyLoaded && !history?.length && <div className="empty-inline">No doses were found in this date range.</div>}
          {!historyLoading && history?.length > 0 && (
            <div className="entity-list history-list">
              {history.map((dose) => (
                <div className="history-row" key={dose.id}>
                  <div><strong>{medicineById.get(dose.medicine)?.name ?? "Medicine"}</strong><span>{asDate(dose.scheduledFor)} · {dose.localDate}</span></div>
                  <span className={`status-pill status-pill--${dose.status}`}>{dose.status}</span>
                  {["upcoming", "missed"].includes(dose.status) && <div className="history-actions"><Button onClick={() => changeDoseStatus(dose, "taken")}>Taken</Button><Button variant="secondary" onClick={() => changeDoseStatus(dose, "skipped")}>Skip</Button></div>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
