import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Button } from "../components/Button.jsx";
import { FormField } from "../components/FormField.jsx";
import { Feedback } from "../components/Feedback.jsx";

export function RegisterPage() {
  const { register, user, isLoading, authError } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
      await register(form);
      navigate("/dashboard", { replace: true });
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
          <p className="eyebrow">YOUR PERSONAL HEALTHSPACE</p>
          <h1>Small steps.<br />More peace of mind.</h1>
          <p>Create a private account to keep your care routine easier to manage.</p>
        </div>
        <p className="auth-footnote">For personal organization only. Always follow guidance from your care team.</p>
      </section>
      <section className="auth-panel" aria-labelledby="register-title">
        <div className="auth-form-wrap">
          <p className="eyebrow">GET STARTED</p>
          <h2 id="register-title">Create your account</h2>
          <p className="form-intro">Your information is kept in your private account.</p>
          {authError && <Feedback variant="error">{authError}</Feedback>}
          {error && <Feedback variant="error">{error}</Feedback>}
          <form onSubmit={handleSubmit} className="auth-form">
            <FormField
              id="name"
              label="Your name"
              autoComplete="name"
              value={form.name}
              onChange={updateField}
              required
            />
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
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={updateField}
              required
            />
            <p className="field-hint">Use at least 8 characters.</p>
            <Button type="submit" className="auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
