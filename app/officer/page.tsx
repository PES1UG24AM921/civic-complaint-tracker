const queue = [
  { id: 201, title: 'Street light outage near signal', status: 'assigned', department: 'Electrical', sla: '4h remaining' },
  { id: 202, title: 'Drain blockage near municipal market', status: 'in_progress', department: 'Drainage', sla: '2h remaining' },
  { id: 203, title: 'Overflowing dustbin near school', status: 'open', department: 'Sanitation', sla: '9h remaining' },
];

export default function OfficerDashboardPage() {
  return (
    <main className="shell">
      <header className="page-header">
        <h2>Officer dashboard</h2>
      </header>

      <section className="grid stats">
        <div className="card">
          <span>Assigned</span>
          <strong>12</strong>
        </div>
        <div className="card">
          <span>Overdue</span>
          <strong>3</strong>
        </div>
        <div className="card">
          <span>SLA compliance</span>
          <strong>91%</strong>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <h3>Department queue</h3>
        <div className="list">
          {queue.map((item) => (
            <article key={item.id} className="complaint-item">
              <div className="status-row">
                <span className="tag">#{item.id}</span>
                <span className="tag">{item.department}</span>
                <span className={`tag ${item.status === 'open' ? 'warning' : 'success'}`}>{item.status}</span>
              </div>
              <h3>{item.title}</h3>
              <div className="meta">
                <span>{item.sla}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
