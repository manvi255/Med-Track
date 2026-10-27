import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { AppLayout } from "./layouts/AppLayout.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { MedicinesPage } from "./pages/MedicinesPage.jsx";
import { SchedulesPage } from "./pages/SchedulesPage.jsx";
import { AppointmentsPage } from "./pages/AppointmentsPage.jsx";
import { NotificationsPage } from "./pages/NotificationsPage.jsx";
import { PrescriptionsPage } from "./pages/PrescriptionsPage.jsx";
import { ProtectedRoute } from "./routes/ProtectedRoute.jsx";
import { PublicOnlyRoute } from "./routes/PublicOnlyRoute.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/medicines" element={<MedicinesPage />} />
              <Route path="/schedules" element={<SchedulesPage />} />
              <Route path="/prescriptions" element={<PrescriptionsPage />} />
              <Route path="/appointments" element={<AppointmentsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
