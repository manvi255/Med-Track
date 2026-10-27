import { Button } from "./Button.jsx";
import { Feedback } from "./Feedback.jsx";

export function LoadState({ isLoading, error, onRetry, children }) {
  if (isLoading) return <Feedback>Loading your information…</Feedback>;
  if (error) {
    return (
      <Feedback variant="error">
        <span>{error}</span>{" "}
        {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
      </Feedback>
    );
  }
  return children;
}
