import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="auth-loading" role="status">Checking your secure session…</div>;
  return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
