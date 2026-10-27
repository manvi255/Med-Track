export function Card({ className = "", children, ...props }) {
  return <section className={`card ${className}`.trim()} {...props}>{children}</section>;
}
