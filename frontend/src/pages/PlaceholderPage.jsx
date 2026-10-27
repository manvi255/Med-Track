import { Card } from "../components/Card.jsx";
import { PageHeader } from "../components/PageHeader.jsx";

export function PlaceholderPage({ title, eyebrow = "YOUR WORKSPACE", description }) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <Card className="placeholder-card">
        <span className="placeholder-mark" aria-hidden="true">+</span>
        <h2>This space is ready for you</h2>
        <p>We’re laying the foundation for this area. Your information will appear here once its experience is connected.</p>
        <span className="coming-label">Feature foundation</span>
      </Card>
    </>
  );
}
