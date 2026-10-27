import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboardAdherence, getDashboardSummary, getDashboardUpcoming } from "../api/resources.js";
import { Card } from "../components/Card.jsx";
import { Feedback } from "../components/Feedback.jsx";
import { LoadState } from "../components/LoadState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useRemoteData } from "../hooks/useRemoteData.js";

function formatTime(value) {
  return new Date(value).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function MetricCard({ label, value, note, accent }) {
  return (
    <Card className={`metric-card${accent ? " metric-card--accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </Card>
  );
}

export function DashboardPage() {
  const [period, setPeriod] = useState("7d");
  const loadDashboard = useCallback(async () => {
    const [summary, adherence, upcoming] = await Promise.all([
      getDashboardSummary(),
      getDashboardAdherence(period),
      getDashboardUpcoming(20)
    ]);
    return { summary, adherence, upcoming };
  }, [period]);
  const { data, isLoading, error, refresh } = useRemoteData(loadDashboard, [loadDashboard]);
  const summary = data?.summary;

  return (
    <>
      <PageHeader
        eyebrow="YOUR OVERVIEW"
        title="A clear view of your care"
        description="A private overview of the medicine, dose, and appointment information you have recorded."
      />
      <LoadState isLoading={isLoading} error={error} onRetry={refresh}>
        {data && (
          <>
            <section className="metric-grid" aria-label="Today's dashboard summary">
              <MetricCard label="Active medicines" value={summary.activeMedicineCount} note="Currently active in your list" accent />
              <MetricCard label="Doses today" value={summary.dosesScheduledToday} note={`${summary.dosesUpcomingToday} still upcoming`} />
              <MetricCard label="Taken today" value={summary.dosesTakenToday} note={`${summary.dosesSkippedToday} skipped · ${summary.dosesMissedToday} missed`} />
              <MetricCard label="Today's adherence" value={summary.adherenceToday == null ? "—" : `${summary.adherenceToday}%`} note="Recorded eligible doses only" />
              <MetricCard label="Upcoming visits" value={summary.upcomingAppointmentCount} note="Scheduled appointments" />
            </section>

            <div className="dashboard-panels">
              <Card className="analytics-card">
                <div className="panel-heading">
                  <div><p className="eyebrow">DOSE HISTORY</p><h2>Adherence trend</h2></div>
                  <label className="compact-select">
                    <span className="visually-hidden">Adherence time range</span>
                    <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                      <option value="7d">7 days</option>
                      <option value="30d">30 days</option>
                    </select>
                  </label>
                </div>
                <div className="adherence-summary">
                  <strong>{data.adherence.overallAdherence == null ? "—" : `${data.adherence.overallAdherence}%`}</strong>
                  <span>overall for {data.adherence.period}</span>
                </div>
                {data.adherence.dailyStats.length === 0 ? (
                  <div className="empty-inline">No adherence records in this range yet.</div>
                ) : (
                  <div className="adherence-chart" role="list" aria-label="Daily adherence">
                    {data.adherence.dailyStats.map((day) => {
                      const rate = day.adherenceRate ?? 0;
                      return (
                        <div className="chart-day" role="listitem" key={day.date} title={`${day.date}: ${day.adherenceRate == null ? "no eligible doses" : `${rate}% adherence`} (${day.taken}/${day.scheduled} taken)`}>
                          <div className="chart-track"><span style={{ height: `${rate}%` }} /></div>
                          <span>{new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: "narrow" })}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="metric-footnote">Adherence is taken doses divided by past eligible doses recorded as taken, skipped, or missed. Upcoming doses are excluded.</p>
              </Card>

              <Card className="analytics-card">
                <div className="panel-heading">
                  <div><p className="eyebrow">NEXT 7 DAYS</p><h2>Coming up</h2></div>
                </div>
                {!data.upcoming.upcomingDoses.length && !data.upcoming.upcomingAppointments.length ? (
                  <div className="empty-inline">Nothing upcoming has been recorded.</div>
                ) : (
                  <div className="upcoming-list">
                    {data.upcoming.upcomingDoses.map((dose) => (
                      <div className="upcoming-item" key={`dose-${dose.id}`}>
                        <span className="upcoming-mark upcoming-mark--dose">D</span>
                        <div><strong>{dose.medicineName}</strong><span>{dose.doseAmount} {dose.doseUnit} · {formatTime(dose.scheduledFor)}</span></div>
                      </div>
                    ))}
                    {data.upcoming.upcomingAppointments.map((appointment) => (
                      <div className="upcoming-item" key={`appointment-${appointment.id}`}>
                        <span className="upcoming-mark upcoming-mark--appointment">A</span>
                        <div><strong>{appointment.doctorName}</strong><span>{appointment.clinicName ? `${appointment.clinicName} · ` : ""}{formatTime(appointment.scheduledAt)}</span></div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="panel-link-row"><Link to="/schedules">View doses</Link><Link to="/appointments">View appointments</Link></div>
              </Card>
            </div>
            <Feedback>Times are displayed in your browser’s local timezone. Dashboard day boundaries use your configured application timezone.</Feedback>
          </>
        )}
      </LoadState>
    </>
  );
}
