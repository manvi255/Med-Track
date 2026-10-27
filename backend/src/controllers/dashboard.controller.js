import {
  getDashboardAdherence,
  getDashboardSummary,
  getDashboardUpcoming
} from "../services/dashboard.service.js";

export async function dashboardSummaryController(req, res) {
  const summary = await getDashboardSummary(req.user.id);
  res.status(200).json({ summary });
}

export async function dashboardAdherenceController(req, res) {
  const adherence = await getDashboardAdherence(req.user.id, req.validatedQuery.period);
  res.status(200).json(adherence);
}

export async function dashboardUpcomingController(req, res) {
  const upcoming = await getDashboardUpcoming(req.user.id, req.validatedQuery);
  res.status(200).json(upcoming);
}
