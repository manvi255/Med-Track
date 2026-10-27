# MediTrack backend

This repository contains an Express API with environment validation, MongoDB connection startup, centralized errors, CORS/security middleware, a database-aware health endpoint, cookie-based user authentication, medicine management, dosage schedules, dose tracking, private prescription OCR/review, in-app notifications, appointment management, and optional browser push.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB Community Server running locally, or a MongoDB Atlas deployment

## Install and configure

From the `backend` directory:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` locally and set `MONGODB_URI` to your own local or Atlas connection string and `JWT_SECRET` to a random value of at least 32 characters. Generate a value in PowerShell with:

```powershell
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64url'))"
```

Copy the output directly into your local `.env`; do not share it or commit `.env`. Startup validates that `JWT_SECRET` has at least 32 characters and is not an example placeholder.

See [Environment variables](#environment-variables) for every current variable and its purpose. `.env` and private uploaded files are excluded by `.gitignore`.

## Run and test

```powershell
npm run dev
```

The server connects to MongoDB before listening on the configured port (5000 by default). If MongoDB cannot be reached, startup fails with a clear error rather than serving an API that cannot use its database.

```powershell
npm start
npm test
```

`GET /api/v1/health` reports API status and whether Mongoose is connected. It returns HTTP 200 when connected and HTTP 503 with a degraded status when the database is unavailable. Tests exercise the unavailable-database response without connecting to a database.

## Authentication

The API provides `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/me`. Registration and login set a one-hour JWT in an HTTP-only cookie scoped to `/api/v1`. The cookie uses `SameSite=Lax` and is marked `Secure` in production; browser clients making cross-origin requests must send credentials, and the configured `CORS_ORIGIN` must match their origin. Password hashes are excluded from normal user queries and serialized responses.

Logout clears the browser cookie but does not revoke a JWT that has already been issued. Such a token remains valid until its one-hour expiration; server-side revocation is not implemented.

Authentication route tests use an isolated in-memory User model mock and do not connect to or modify a development or production database.

## Dosage schedules and dose tracking

Schedule and dose endpoints require the authenticated HTTP-only cookie. The owner is always derived from authentication; the API rejects client-supplied owner IDs and verifies medicine ownership when creating or changing a schedule.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/schedules` | Create a schedule for an owned medicine; returns `201`. |
| `GET` | `/api/v1/schedules` | List owned schedules. Optional filters: `medicine` and `isActive=true\|false`. |
| `GET` | `/api/v1/schedules/:id` | Retrieve an owned schedule. |
| `PATCH` | `/api/v1/schedules/:id` | Update allowed schedule fields. |
| `DELETE` | `/api/v1/schedules/:id` | Delete an owned schedule; returns `204`. Historical dose records are retained. |
| `GET` | `/api/v1/doses/today` | List doses for each schedule's current local calendar date. |
| `GET` | `/api/v1/doses?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | List dose occurrences within the inclusive local-date range. |
| `PATCH` | `/api/v1/doses/:id/status` | Mark an upcoming or missed dose as taken or skipped. |

Example schedule creation request:

```json
{
  "medicine": "64b000000000000000000001",
  "doseAmount": 1,
  "doseUnit": "tablet",
  "frequency": "selected_days",
  "times": ["08:00", "20:00"],
  "daysOfWeek": [1, 3, 5],
  "startDate": "2026-10-01",
  "endDate": "2026-12-31",
  "timezone": "Asia/Kolkata",
  "reminders": { "enabled": true, "leadMinutes": 15 },
  "instructions": "Use the instructions supplied by your care team"
}
```

Times use 24-hour local `HH:mm` format. `daily` and `multiple_daily` schedules occur on every calendar day in the configured date range; each configured time creates one occurrence. `selected_days` schedules occur only on the supplied weekdays (`0` is Sunday). The timezone must be a valid IANA identifier.

Occurrences are generated on demand when a dose list is requested and automatically by the reminder worker for upcoming active schedules. Generation converts each schedule's local date and time to a UTC `scheduledFor` instant. A nonexistent local time during a spring-forward daylight-saving gap is skipped; for an ambiguous fall-back time, the earlier instant is selected. Unique schedule-and-instant indexing plus upsert generation prevents duplicates. The background generator only inserts future occurrences and does not change a dose to missed because push delivery failed. Dose-list requests may still create historical occurrences as `missed` and move overdue upcoming records to `missed`; completed dose records are never overwritten by regeneration. Updating or deleting a schedule removes only its future `upcoming` occurrences and associated reminders; historical dose records are retained.

Example status update request:

```json
{
  "status": "taken",
  "notes": "Recorded by the user"
}
```

Allowed transitions are `upcoming -> taken`, `upcoming -> skipped`, `missed -> taken`, and `missed -> skipped`. A `taken` status records `takenAt`; skipping clears it. These endpoints record the user's schedule and dose status and do not provide medical advice.

Schedule and dose route tests use isolated model mocks. Model validation tests use in-memory Mongoose documents without connecting to a database.

## Notifications and browser push

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/notifications?page=1&limit=20` | List the authenticated user's notifications, newest first. Page starts at 1; limit is 1–100. |
| `GET` | `/api/v1/notifications/unread-count` | Return only the current user's unread count. |
| `PATCH` | `/api/v1/notifications/:id/read` | Mark one owned notification as read; repeated calls are idempotent. |
| `PATCH` | `/api/v1/notifications/read-all` | Mark all current-user notifications as read. |
| `DELETE` | `/api/v1/notifications/:id` | Delete an owned notification; returns `204`. |
| `GET` | `/api/v1/push/public-key` | Return the VAPID public key, or `null` when push is unavailable. Never returns the private key. |
| `POST` | `/api/v1/push/subscribe` | Save the authenticated user's browser subscription. |
| `DELETE` | `/api/v1/push/subscribe` | Remove the current user's subscription by endpoint. |

Browser push setup: the authenticated frontend's Notifications page can request browser permission, register its same-origin service worker, fetch `GET /api/v1/push/public-key`, and save the resulting browser subscription through `POST /api/v1/push/subscribe`. Unsubscribe by sending `{ "endpoint": "https://push-service.example/subscription-id" }` to `DELETE /api/v1/push/subscribe`. Subscription keys and endpoints are excluded from ordinary model selection and are never included in API responses or logs. Configure HTTPS and access controls for the MongoDB deployment because subscription data is stored there.

VAPID setup uses `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`. Generate a key pair locally with `npx web-push generate-vapid-keys`; keep the private key only in local `.env` or a secret manager. If either key is missing, push is reported unavailable while in-app notifications continue to work. Dose push messages include the medicine name and scheduled local time so the reminder can be identified; they do not include instructions, prescription text, appointment notes, subscription data, or credentials. Appointment push messages include the appointment's localized date and time without doctor or location details. Subscriptions receiving HTTP 404/410 are removed.

The server starts one `node-cron` worker after MongoDB connects. It runs once per minute (`* * * * *`), generates upcoming dose occurrences for active schedules before evaluating reminders, and checks indexed, bounded upcoming dose and appointment ranges. Schedule reminder lead time (`reminders.leadMinutes`, 1–1440) and appointment lead times (`reminders.leadHours`, 1–10 unique whole hours from 1 to 720) are saved per record. Their defaults come from `DOSE_REMINDER_LEAD_MINUTES` (15) and `APPOINTMENT_REMINDER_LEAD_HOURS` (`24,1`). Missed worker intervals are caught up while the dose or appointment is still in the future; an event that has already passed is not sent as an upcoming reminder. Set `DOSE_REMINDER_JOB_ENABLED=false` to disable the worker. The job does not run when `NODE_ENV=test`; process-local overlap prevention and atomic database idempotency/claims protect concurrent executions across instances and restarts. Push failures leave in-app notifications intact and are retried at most three times with a delay, for up to 24 hours. Notifications never update dose status; taken/skipped actions use the authenticated dose-status endpoint.

Reminder and notification tests use isolated model mocks; they do not send real push messages or modify a development/production database.

## Appointment management

All appointment endpoints require the authenticated HTTP-only cookie. Appointment ownership is derived from the authenticated user; do not include a `user` field. `scheduledAt` must be an ISO 8601 datetime with a timezone offset (for example, `2026-10-28T12:00:00.000Z`) and is stored as a UTC instant. `timezone` must be a valid IANA timezone and determines how the reminder's appointment time is formatted. Appointment notes are accepted and stored for the owner but intentionally omitted from API responses and push notifications.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/appointments` | Create an appointment; returns `201`. |
| `GET` | `/api/v1/appointments?page=1&limit=20&status=scheduled&period=upcoming` | List owned appointments with optional status/period filters and pagination. |
| `GET` | `/api/v1/appointments/:id` | Retrieve an owned appointment. |
| `PATCH` | `/api/v1/appointments/:id` | Update an owned appointment. |
| `DELETE` | `/api/v1/appointments/:id` | Delete an owned appointment; returns `204`. |

`period` accepts `upcoming` or `past`; `status` accepts `scheduled`, `completed`, or `cancelled`. Page starts at 1 and limit is 1–100. The response includes appointment data and a pagination object. Example create request:

```json
{
  "doctorName": "Dr Example",
  "clinicName": "Local clinic",
  "location": "Main Street",
  "appointmentType": "consultation",
  "scheduledAt": "2026-10-28T12:00:00.000Z",
  "timezone": "Asia/Kolkata",
  "reminders": { "enabled": true, "leadHours": [24, 1] },
  "notes": "Bring the requested documents"
}
```

The response contains the appointment ID, non-note appointment fields, reminder setting, and timestamps; it does not contain `user` or `notes`. Appointment types are `consultation`, `follow_up`, `test`, `procedure`, and `other`.

Example response:

```json
{
  "appointment": {
    "id": "aaaaaaaaaaaaaaaaaaaaaaaa",
    "doctorName": "Dr Example",
    "clinicName": "Local clinic",
    "location": "Main Street",
    "appointmentType": "consultation",
    "scheduledAt": "2026-10-28T12:00:00.000Z",
    "timezone": "Asia/Kolkata",
    "status": "scheduled",
    "reminders": { "enabled": true, "leadHours": [24, 1] },
    "createdAt": "2026-10-27T12:00:00.000Z",
    "updatedAt": "2026-10-27T12:00:00.000Z"
  }
}
```

The shared minute worker generates reminders at each appointment's configured `leadHours` for scheduled appointments with reminders enabled. Reminder records use an idempotency key scoped to appointment, scheduled instant, and lead time. They contain only generic appointment reminder text and the appointment's localized date/time, not the doctor, location, or notes. Cancelled or completed appointments are excluded. Changing the scheduled time, status, or reminder setting removes existing appointment reminder notifications so obsolete pending deliveries are not retried; a new reminder is generated at the appropriate lead time after a reschedule. Push delivery reuses the configured VAPID service; in-app notifications remain available when push is unconfigured or fails.

Run appointment tests with `npm test -- --runTestsByPath tests/appointments.test.js tests/appointmentModel.test.js`. The suite uses model mocks and does not send push notifications or access a development/production database.

## Dashboard analytics

All dashboard endpoints require the authenticated HTTP-only cookie and derive ownership from the authenticated user. They do not accept a user ID or caller-supplied timezone.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/dashboard/summary` | Return active medicine, today's dose, adherence, and future scheduled-appointment counts. |
| `GET` | `/api/v1/dashboard/adherence?period=7d` | Return daily and overall adherence for the last 7 or 30 calendar days, including today. |
| `GET` | `/api/v1/dashboard/upcoming?limit=50` | Return upcoming dose occurrences and appointments in the next seven days. Limit is 1–100 per list; default is 50. |

Example summary response:

```json
{
  "summary": {
    "activeMedicineCount": 2,
    "dosesScheduledToday": 3,
    "dosesTakenToday": 1,
    "dosesUpcomingToday": 1,
    "dosesSkippedToday": 1,
    "dosesMissedToday": 0,
    "adherenceToday": 50,
    "upcomingAppointmentCount": 1
  }
}
```

`activeMedicineCount` counts the user's medicines with `isActive=true`. `dosesScheduledToday` counts dose occurrence documents scheduled in today's calendar range, regardless of status; the four status fields count those same occurrences by their persisted Dose status. `upcomingAppointmentCount` counts appointments owned by the user with status `scheduled` and `scheduledAt` at or after the current instant. Today and adherence percentages are based on eligible occurrences: only explicitly persisted `taken`, `skipped`, or `missed` doses whose `scheduledFor` is before the current instant enter the adherence denominator. The numerator is the eligible `taken` count. Upcoming and future occurrences are excluded; an overdue `upcoming` dose is not inferred to be missed. If there are no eligible occurrences, adherence is `null`.

Adherence response shape:

```json
{
  "period": "7d",
  "startDate": "2026-10-21",
  "endDate": "2026-10-27",
  "overallAdherence": 50,
  "dailyStats": [
    {
      "date": "2026-10-21",
      "scheduled": 2,
      "taken": 1,
      "skipped": 1,
      "missed": 0,
      "adherenceRate": 50
    }
  ]
}
```

The `period` parameter accepts only `7d` or `30d` and defaults to `7d`. Each `scheduled` value counts dose occurrences in that calendar day, including future `upcoming` occurrences; status totals reflect stored statuses. Adherence rates use only explicitly completed eligible occurrences (as defined above). Daily and overall rates are percentages rounded to two decimal places, or `null` when the relevant eligible-dose denominator is empty. Reminders do not affect these metrics.

Upcoming response shape:

```json
{
  "upcomingDoses": [
    {
      "id": "aaaaaaaaaaaaaaaaaaaaaaaa",
      "scheduledFor": "2026-10-28T08:00:00.000Z",
      "status": "upcoming",
      "medicineName": "Medicine A",
      "doseAmount": 1,
      "doseUnit": "tablet"
    }
  ],
  "upcomingAppointments": [
    {
      "id": "bbbbbbbbbbbbbbbbbbbbbbbb",
      "doctorName": "Dr Example",
      "clinicName": "Local clinic",
      "scheduledAt": "2026-10-29T12:00:00.000Z",
      "appointmentType": "consultation",
      "status": "scheduled"
    }
  ]
}
```

Dashboard calendar boundaries use `USER_TIMEZONE` (the application's documented timezone setting; currently the User schema does not persist an individual timezone). If individual timezone preferences are added to User in a future module, they can replace this fallback. All database comparisons use UTC instants, while local-day bounds and adherence grouping use the configured IANA timezone; boundaries are calculated per calendar day so 23- and 25-hour daylight-saving days are handled. Dose records are grouped from `scheduledFor`, not `localDate`, because `localDate` is stored in each schedule's timezone. Upcoming lists are sorted by scheduled instant, limited independently, and include only safe medicine, schedule, and appointment fields; notes and unrelated private data are not returned.

Dashboard tests use isolated model mocks and do not connect to or modify a development or production database. Run them with `npm test -- --runTestsByPath tests/dashboard.test.js`.

## Prescription upload and OCR

Prescription endpoints require the authenticated HTTP-only cookie:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/prescriptions/upload` | Upload one JPEG, PNG, or WebP image using multipart field `file` (maximum 5 MB); returns `201`. |
| `GET` | `/api/v1/prescriptions` | List the authenticated user's prescription metadata. |
| `GET` | `/api/v1/prescriptions/:id` | Retrieve an owned prescription with OCR text and unverified suggestions. |
| `POST` | `/api/v1/prescriptions/:id/confirm` | Confirm medicine details reviewed and submitted by the user. |
| `DELETE` | `/api/v1/prescriptions/:id` | Delete an owned prescription and its private image; returns `204`. |

Upload the image as multipart form data with a `file` field. The API checks that the image signature matches the declared MIME type, creates a random server-side filename, and stores the file in the ignored `storage/prescriptions` directory with private permissions. The storage key and filesystem path are never returned by the API.

OCR currently recognizes English text. Extracted text is returned for user review, with common direct identifiers such as labeled patient name, date of birth, phone, address, and email redacted before storage. Medicine suggestions remain empty: OCR does not infer a medicine, dosage, frequency, duration, or instructions. An OCR failure is recorded with a generic safe message and does not expose worker errors or prescription text in logs.

No medicine is created until the user submits a reviewed confirmation request:

```json
{
  "medicines": [
    {
      "name": "User-reviewed medicine name",
      "category": "medication",
      "dosage": "500 mg",
      "frequency": "Once daily",
      "startDate": "2026-10-01"
    }
  ]
}
```

Confirmation uses the existing medicine validation rules, assigns ownership from authentication, does not create schedules, and is idempotent for a prescription and confirmed item. Deleting a prescription removes its uploaded image but leaves already-confirmed medicine records intact. No image download route is currently exposed.

Prescription tests use mocked models/OCR and clean only files created during their own test run. They do not connect to or modify a development or production database.

## Medicine management

All medicine endpoints require the authenticated HTTP-only cookie. Each medicine is scoped to its owner; clients must not send an owner ID. Dates should be supplied as `YYYY-MM-DD` strings or ISO datetimes. The API stores user-entered dosage and frequency information without prescribing or inferring medical advice.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/medicines` | Create a medicine; returns `201`. |
| `GET` | `/api/v1/medicines` | List the authenticated user's medicines. |
| `GET` | `/api/v1/medicines/:id` | Retrieve one medicine owned by the authenticated user. |
| `PATCH` | `/api/v1/medicines/:id` | Update supplied medicine fields; owner cannot be changed. |
| `DELETE` | `/api/v1/medicines/:id` | Delete an owned medicine; returns `204`. |

Example create request:

```json
{
  "name": "Example medicine",
  "category": "medication",
  "dosage": "500 mg",
  "form": "tablet",
  "frequency": "Once daily",
  "instructions": "Take with water",
  "startDate": "2026-10-01",
  "endDate": "2026-10-10"
}
```

Example partial update request:

```json
{
  "dosage": "1000 IU",
  "isActive": false
}
```

Medicine route tests use isolated model mocks and do not connect to or modify a development or production database.

## Environment variables

| Variable | Purpose | Required now or later | Secret? | Where to obtain or generate it |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Selects development, test, or production behavior. | No; defaults to `development`. | No | Set locally when you need a different mode. |
| `PORT` | HTTP listening port. | No; defaults to `5000`. | No | Choose an available local port if needed. |
| `MONGODB_URI` | MongoDB connection URI. | Required now to start the server. | It may contain database credentials; keep credential-bearing URIs private. | Use `mongodb://127.0.0.1:27017/meditrack` for a local MongoDB instance, or copy your own URI from MongoDB Atlas. |
| `JWT_SECRET` | Secret used to sign and verify authentication JWTs. | Required to start the backend. | Yes | Generate locally with the Node.js `crypto.randomBytes` command above. |
| `CORS_ORIGIN` | Comma-separated allowed browser origins. | No; defaults to `http://localhost:5173`. | No | Set this to the frontend origin(s) you control. |
| `USER_TIMEZONE` | Application timezone used when calculating dashboard calendar days; schedule and appointment records retain their own timezone. | No; defaults to `UTC`. | No | Choose a timezone such as `Asia/Kolkata` from the IANA timezone database. |
| `WEB_PUSH_PUBLIC_KEY` | VAPID public key used by a browser push subscription. | Optional; required to send browser push. | No | Generate both VAPID keys locally with `npx web-push generate-vapid-keys`. |
| `WEB_PUSH_PRIVATE_KEY` | VAPID signing key. | Optional; required to send browser push. | Yes | Generated alongside the public key; keep it only in your local `.env` or a secret manager. |
| `WEB_PUSH_SUBJECT` | VAPID contact URI. | No; defaults to `mailto:admin@example.com`. | No | Set a `mailto:` address you control before enabling push. |
| `DOSE_REMINDER_LEAD_MINUTES` | Minutes before a scheduled dose to create a reminder. | No; defaults to `15`. | No | Set an integer from 1 to 1440. |
| `APPOINTMENT_REMINDER_LEAD_HOURS` | Comma-separated hours before appointments to create reminders. | No; defaults to `24,1`. | No | Set 1–10 unique whole-hour values between 1 and 720, such as `24,1`. |
| `DOSE_REMINDER_JOB_ENABLED` | Enables the scheduled reminder worker outside tests. | No; defaults to `true`; always disabled in tests. | No | Set to `false` to disable the worker. |

No email-service credentials, upload-directory setting, or upload-size setting is currently read by the application; those should be added when their related features are implemented.

## Pending feature work

The current source has no supplement, medical-record, analytics, or dashboard modules. `web-push` is used for optional privacy-preserving reminders; it does not transmit prescription data or notes.

Prescription OCR uses the installed `tesseract.js` JavaScript/WASM implementation and does not require installing the Tesseract Windows executable. OCR output may be incomplete or incorrect; it is provided only for user review and must not be treated as medical advice.

The API provides browser subscription endpoints, but a frontend service worker is not included in this backend module. Browser push should be tested end-to-end from a secure origin with configured VAPID keys before production use.

The `storage/medical-records` directory is a private placeholder, not an upload endpoint or a complete storage implementation. OCR-extracted medicine information must be presented for user review and confirmation before saving; OCR output is not medical advice.
