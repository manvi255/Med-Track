import {
  countUnreadNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  serializeNotification
} from "../services/notification.service.js";

export async function listNotificationsController(req, res) {
  const result = await listNotifications(req.user.id, req.validatedQuery);
  res.status(200).json({
    notifications: result.notifications.map(serializeNotification),
    pagination: result.pagination
  });
}

export async function unreadCountController(req, res) {
  const count = await countUnreadNotifications(req.user.id);
  res.status(200).json({ unreadCount: count });
}

export async function markNotificationReadController(req, res) {
  const notification = await markNotificationRead(req.user.id, req.params.id);
  res.status(200).json({ notification: serializeNotification(notification) });
}

export async function markAllNotificationsReadController(req, res) {
  const modifiedCount = await markAllNotificationsRead(req.user.id);
  res.status(200).json({ modifiedCount });
}

export async function deleteNotificationController(req, res) {
  await deleteNotification(req.user.id, req.params.id);
  res.status(204).end();
}
