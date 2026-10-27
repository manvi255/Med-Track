# MediTrack frontend foundation

## Requirements

- Node.js 20 or newer
- npm
- MediTrack backend running locally on port 5000

## Local development

From this directory:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The Vite development server runs at `http://localhost:5173`. The default API base URL is `http://localhost:5000/api/v1`; override it in the local `.env` using `VITE_API_BASE_URL` if the backend is hosted elsewhere. Vite environment variables are public browser configuration, not a place for secrets.

Start the backend separately from `backend` with `npm run dev`. Its `CORS_ORIGIN` must include the exact frontend origin `http://localhost:5173` (this is the backend's default). Keep the browser and API hostnames consistent; for example, use `localhost` for both rather than mixing it with `127.0.0.1`. The backend enables credentialed CORS and its auth cookie is HTTP-only, `SameSite=Lax`, and not `Secure` in development. The frontend Axios client sends requests with credentials enabled. Do not use a wildcard CORS origin with cookies.

## Build

```powershell
npm run build
npm run preview
```

## Integrated features

The interface uses the backend's cookie-based session; no token is written to browser storage. Registration and login call `POST /auth/register` and `POST /auth/login`, refresh restoration calls `GET /auth/me`, and sign-out calls `POST /auth/logout`. Axios sends credentials for API requests.

The protected workspace is connected to these `/api/v1` resources:

| Page | API operations |
|---|---|
| Dashboard | `GET /dashboard/summary`, `/dashboard/adherence?period=7d|30d`, `/dashboard/upcoming?limit=20` |
| Medicines | `GET/POST /medicines`, `PATCH/DELETE /medicines/:id` |
| Schedules & doses | `GET/POST /schedules`, `PATCH/DELETE /schedules/:id`, `GET /doses/today`, `GET /doses?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`, `PATCH /doses/:id/status` |
| Prescriptions | `GET /prescriptions`, `GET /prescriptions/:id`, `POST /prescriptions/upload` (multipart field `file`), `POST /prescriptions/:id/confirm`, `DELETE /prescriptions/:id` |
| Appointments | `GET/POST /appointments`, `PATCH/DELETE /appointments/:id` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `DELETE /notifications/:id` |

### Time and review behavior

- Appointment date/time input is interpreted in the browser's IANA timezone and submitted as an ISO timestamp with an offset. The selected timezone is sent with the appointment.
- Schedule times are local `HH:mm` values in the selected IANA timezone. Dose history filters use calendar dates; dose timestamps are displayed in the browser's local timezone.
- The dashboard adherence chart uses the backend's configured timezone and omits the adherence percentage when there are no eligible recorded doses.
- The backend's `GET /doses/today` may record overdue upcoming doses as missed when requested. The schedules page explains this behavior.
- Prescription upload accepts JPEG, PNG, or WebP images up to 5 MB. OCR output is shown only in the authenticated review screen. OCR text is not automatically converted to medicine records; users must enter/review the full medicine details and explicitly confirm them.
- Appointment and notification responses intentionally omit private notes and push subscription data.

The backend test script is `npm test` from `backend/`; it points to the isolated `meditrack-test` database configured in `backend/tests/setupEnv.js`. Frontend production validation is `npm run build` from this directory.
