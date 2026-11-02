import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Civic Complaint & Incident Tracking System</p>
        <h1>Citizen-first service with SLA escalation</h1>
        <p>
          Track civic issues, enforce departmental ownership, and escalate overdue complaints
          automatically before service deadlines are missed.
        </p>
        <div className="actions">
          <Link href="/complaints" className="button primary">View complaints</Link>
          <Link href="/officer" className="button secondary">Officer dashboard</Link>
        </div>
      </section>

      <section className="grid stats">
        <div className="card">
          <span>Open issues</span>
          <strong>24</strong>
        </div>
        <div className="card">
          <span>At risk</span>
          <strong>7</strong>
        </div>
        <div className="card">
          <span>Escalated</span>
          <strong>3</strong>
        </div>
      </section>
    </main>
  );
}
