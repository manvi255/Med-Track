export function Button({ variant = "primary", className = "", type = "button", ...props }) {
  return (
    <button
      className={`button button--${variant} ${className}`.trim()}
      type={type}
      {...props}
    />
  );
}
