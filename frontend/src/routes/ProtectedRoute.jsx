import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Feedback } from "../components/Feedback.jsx";

export function ProtectedRoute() {
  const { user, isLoading, authError } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="auth-loading" role="status" aria-live="polite">
        <span className="loading-mark" aria-hidden="true">+</span>
        <p>Checking your secure session…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <>
      {authError && <Feedback variant="error">{authError}</Feedback>}
      <Outlet />
    </>
  );
}
