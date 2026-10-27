import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Button } from "../components/Button.jsx";
import { FormField } from "../components/FormField.jsx";
import { Feedback } from "../components/Feedback.jsx";

export function LoginPage() {
  const { login, user, isLoading, authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && user) return <Navigate to="/dashboard" replace />;

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(form);
      navigate(location.state?.from ?? "/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Link to="/login" className="brand brand--auth">
          <span className="brand-mark" aria-hidden="true">+</span>
          <span>Medi<span>Track</span></span>
        </Link>
        <div className="auth-message">
          <p className="eyebrow">A CALMER WAY TO KEEP TRACK</p>
          <h1>Your care routine,<br />all in one place.</h1>
          <p>Keep medicines, schedules, appointments, and reminders organized in a private space made for you.</p>
        </div>
        <p className="auth-footnote">For personal organization only. Always follow guidance from your care team.</p>
      </section>

      <section className="auth-panel" aria-labelledby="login-title">
        <div className="auth-form-wrap">
          <p className="eyebrow">WELCOME BACK</p>
          <h2 id="login-title">Sign in to MediTrack</h2>
          <p className="form-intro">Use the email address connected to your account.</p>
          {authError && <Feedback variant="error">{authError}</Feedback>}
          {error && <Feedback variant="error">{error}</Feedback>}
          <form onSubmit={handleSubmit} className="auth-form">
            <FormField
              id="email"
              type="email"
              label="Email address"
              autoComplete="email"
              value={form.email}
              onChange={updateField}
              required
            />
            <FormField
              id="password"
              type="password"
              label="Password"
              autoComplete="current-password"
              value={form.password}
              onChange={updateField}
              required
            />
            <Button type="submit" className="auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="auth-switch">New to MediTrack? <Link to="/register">Create an account</Link></p>
        </div>
      </section>
    </main>
  );
}
