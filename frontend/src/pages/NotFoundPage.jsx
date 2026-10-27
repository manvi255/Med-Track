import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <Link to="/dashboard" className="brand">
        <span className="brand-mark" aria-hidden="true">+</span>
        <span>Medi<span>Track</span></span>
      </Link>
      <p className="eyebrow">404 · PAGE NOT FOUND</p>
      <h1>This page isn’t in your care plan.</h1>
      <p>Check the address, or head back to your dashboard.</p>
      <Link className="button button--primary" to="/dashboard">Go to dashboard</Link>
    </main>
  );
}
