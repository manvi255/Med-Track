export function Feedback({ children, variant = "info", role }) {
  return (
    <div className={`feedback feedback--${variant}`} role={role ?? (variant === "error" ? "alert" : "status")}>
      {children}
    </div>
  );
}
