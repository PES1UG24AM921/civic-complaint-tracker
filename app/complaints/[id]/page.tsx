export default function ComplaintDetailPage({ params }: { params: { id: string } }) {
  return (
    <main className="shell">
      <header className="page-header">
        <h2>Complaint #{params.id}</h2>
      </header>

      <section className="panel">
        <div className="status-row">
          <span className="tag">Open</span>
          <span className="tag warning">High priority</span>
        </div>

        <h3>Pothole near main bus stop</h3>
        <p>
          The road surface is broken outside the city bus stand and is creating a traffic risk for pedestrians and drivers.
        </p>

        <div className="meta">
          <span>Department: Roads & Transport</span>
          <span>•</span>
          <span>SLA due: 12 hours</span>
        </div>
      </section>
    </main>
  );
}
