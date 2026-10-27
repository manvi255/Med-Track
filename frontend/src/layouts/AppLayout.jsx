import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const navigation = [
  { to: "/dashboard", label: "Overview", glyph: "O" },
  { to: "/medicines", label: "Medicines", glyph: "M" },
  { to: "/schedules", label: "Schedules & doses", glyph: "S" },
  { to: "/prescriptions", label: "Prescriptions", glyph: "P" },
  { to: "/appointments", label: "Appointments", glyph: "A" },
  { to: "/notifications", label: "Notifications", glyph: "N" }
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setLogoutError("");
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(error.message);
    } finally {
      setIsLoggingOut(false);
    }
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`}>
        <NavLink to="/dashboard" className="brand" onClick={closeMenu} aria-label="MediTrack home">
          <span className="brand-mark" aria-hidden="true">+</span>
          <span>Medi<span>Track</span></span>
        </NavLink>

        <p className="nav-caption">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}
              onClick={closeMenu}
            >
              <span className="nav-glyph" aria-hidden="true">{item.glyph}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-note">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>Your care, organized</strong>
            <span>Private to your account</span>
          </div>
        </div>
      </aside>

      {menuOpen && <button className="mobile-scrim" onClick={closeMenu} aria-label="Close navigation" />}

      <div className="app-main">
        <header className="topbar">
          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-context">
            <span className="topbar-label">PERSONAL HEALTHSPACE</span>
            <span className="topbar-subtitle">A little more clarity, every day.</span>
          </div>
          <div className="user-area">
            <div className="user-avatar" aria-hidden="true">{user?.name?.slice(0, 1)?.toUpperCase() ?? "U"}</div>
            <div className="user-name">
              <strong>{user?.name ?? "Your account"}</strong>
              <span>Personal account</span>
            </div>
            <button className="logout-button" type="button" onClick={handleLogout} disabled={isLoggingOut}>
              {isLoggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>

        <main className="content-area">
          {logoutError && <p className="logout-error" role="alert">{logoutError}</p>}
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>MediTrack</span>
          <span>Organize your care. Your information stays yours.</span>
        </footer>
      </div>
    </div>
  );
}
