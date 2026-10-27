import { useCallback, useEffect, useRef, useState } from "react";
import {
  deletePushSubscription,
  deleteNotification,
  getPushPublicKey,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerPushSubscription,
  updateDoseStatus
} from "../api/resources.js";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { Feedback } from "../components/Feedback.jsx";
import { LoadState } from "../components/LoadState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useRemoteData } from "../hooks/useRemoteData.js";

function decodeApplicationServerKey(encodedKey) {
  const padding = "=".repeat((4 - encodedKey.length % 4) % 4);
  const base64 = `${encodedKey}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [doseBusyId, setDoseBusyId] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pollError, setPollError] = useState("");
  const pollingRef = useRef(false);
  const loadNotifications = useCallback(async () => {
    const [result, unreadCount] = await Promise.all([
      listNotifications({ page, limit: 20 }),
      getUnreadNotificationCount()
    ]);
    return { ...result, unreadCount };
  }, [page]);
  const { data, setData, isLoading, error, refresh } = useRemoteData(loadNotifications, [loadNotifications]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || pollingRef.current) return;
      pollingRef.current = true;
      try {
        setData(await loadNotifications());
        setPollError("");
      } catch (requestError) {
        setPollError(requestError.message);
      } finally {
        pollingRef.current = false;
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications, setData]);

  useEffect(() => {
    let active = true;
    async function readPushState() {
      if (!("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (active) setPushEnabled(Boolean(subscription));
    }
    readPushState().catch((requestError) => {
      if (active) setActionError(requestError.message);
    });
    return () => { active = false; };
  }, []);

  async function enablePush() {
    setActionError("");
    setNotice("");
    setPushBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Browser push notifications are not supported by this browser.");
      }
      if (!("Notification" in window)) {
        throw new Error("Browser notification permission is not supported.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Allow notifications in your browser settings to enable push reminders.");
      }
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      const publicKey = await getPushPublicKey();
      if (!publicKey) throw new Error("Browser push is not configured on the backend.");
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(publicKey)
        });
      await registerPushSubscription(subscription.toJSON());
      setPushEnabled(true);
      setNotice("Browser push reminders are enabled on this device.");
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    setActionError("");
    setNotice("");
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/service-worker.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        try {
          await deletePushSubscription(subscription.endpoint);
        } catch (requestError) {
          if (requestError.status !== 404) throw requestError;
        }
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
      setNotice("Browser push reminders are disabled on this device.");
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setPushBusy(false);
    }
  }

  async function markRead(notification) {
    setActionError("");
    setNotice("");
    try {
      await markNotificationRead(notification.id);
      setNotice("Notification marked as read.");
      await refresh();
    } catch (requestError) {
      setActionError(requestError.message);
    }
  }

  async function markAllRead() {
    setActionError("");
    setNotice("");
    try {
      const count = await markAllNotificationsRead();
      setNotice(`${count} notification${count === 1 ? "" : "s"} marked as read.`);
      await refresh();
    } catch (requestError) {
      setActionError(requestError.message);
    }
  }

  async function removeNotification(notification) {
    setActionError("");
    try {
      await deleteNotification(notification.id);
      setNotice("Notification deleted.");
      await refresh();
    } catch (requestError) {
      setActionError(requestError.message);
    }
  }

  async function changeDoseStatus(notification, status) {
    if (!notification.relatedDose || doseBusyId) return;
    setActionError("");
    setNotice("");
    setDoseBusyId(notification.relatedDose);
    try {
      await updateDoseStatus(notification.relatedDose, { status });
      setNotice(status === "taken" ? "Dose marked as taken." : "Dose marked as skipped.");
      await refresh();
    } catch (requestError) {
      setActionError(requestError.message);
      await refresh();
    } finally {
      setDoseBusyId("");
    }
  }

  return (
    <>
      <PageHeader eyebrow="UPDATES" title="Notifications" description="Review in-app reminders and manage browser push delivery for this device.">
        <Button variant="secondary" disabled={!data?.unreadCount} onClick={markAllRead}>Mark all read</Button>
      </PageHeader>
      {notice && <Feedback>{notice}</Feedback>}
      {actionError && <Feedback variant="error">{actionError}</Feedback>}
      {pollError && <Feedback variant="error">Could not refresh notifications: {pollError}</Feedback>}
      <Card className="push-preferences">
        <div>
          <h2>Browser reminders</h2>
          <p>Allow this device to receive reminders when MediTrack is not open. Browser permission and backend push configuration are required.</p>
        </div>
        <Button variant="secondary" disabled={pushBusy} onClick={pushEnabled ? disablePush : enablePush}>
          {pushBusy ? "Updating…" : pushEnabled ? "Disable on this device" : "Enable on this device"}
        </Button>
      </Card>
      {data && <Feedback>{data.unreadCount} unread notification{data.unreadCount === 1 ? "" : "s"}</Feedback>}
      <LoadState isLoading={isLoading} error={error} onRetry={refresh}>
        {!data?.notifications?.length ? (
          <Card className="empty-state"><span className="empty-icon">N</span><h2>No notifications yet</h2><p>In-app reminders and updates will appear here when available.</p></Card>
        ) : (
          <>
            <div className="notification-list">
              {data.notifications.map((notification) => (
                <Card className={`notification-card${notification.readAt ? "" : " notification-card--unread"}`} key={notification.id}>
                  <span className={`notification-mark notification-mark--${notification.type}`}>{notification.type === "dose_reminder" ? "D" : "A"}</span>
                  <div className="notification-copy">
                    <div className="entity-title-row"><h2>{notification.title}</h2>{!notification.readAt && <span className="unread-dot" aria-label="Unread" />}</div>
                    <p>{notification.message}</p>
                    {notification.dose && (
                      <p className="notification-dose-status">
                        {notification.dose.medicineName ?? "Medicine"} · {notification.dose.status}
                        {notification.dose.scheduledFor && (
                          <> · {new Intl.DateTimeFormat([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: notification.dose.timezone
                          }).format(new Date(notification.dose.scheduledFor))} ({notification.dose.timezone})</>
                        )}
                      </p>
                    )}
                    <span className="entity-meta">{new Date(notification.createdAt).toLocaleString()} · Push {notification.pushDeliveryStatus}</span>
                  </div>
                  <div className="entity-actions">
                    {notification.dose && ["upcoming", "missed"].includes(notification.dose.status) && (
                      <>
                        <Button
                          disabled={Boolean(doseBusyId)}
                          onClick={() => changeDoseStatus(notification, "taken")}
                        >
                          {doseBusyId === notification.relatedDose ? "Saving…" : "Mark taken"}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={Boolean(doseBusyId)}
                          onClick={() => changeDoseStatus(notification, "skipped")}
                        >
                          Skip
                        </Button>
                      </>
                    )}
                    {!notification.readAt && <Button variant="secondary" onClick={() => markRead(notification)}>Mark read</Button>}
                    <Button variant="danger" onClick={() => removeNotification(notification)}>Delete</Button>
                  </div>
                </Card>
              ))}
            </div>
            <div className="pagination-row">
              <span>{data.pagination.total} notifications</span>
              <div>
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span>Page {page} of {Math.max(data.pagination.totalPages, 1)}</span>
                <Button variant="secondary" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </LoadState>
    </>
  );
}
