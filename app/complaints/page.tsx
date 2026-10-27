import Link from 'next/link';

const complaints = [
  {
    id: 101,
    title: 'Deep pothole near main bus stop',
    status: 'open',
    priority: 'high',
    department: 'Roads & Transport',
    createdAt: '2026-10-20',
  },
  {
    id: 102,
    title: 'Water supply interruption in Block C',
    status: 'assigned',
    priority: 'critical',
    department: 'Water Works',
    createdAt: '2026-10-18',
  },
  {
    id: 103,
    title: 'Garbage overflow beside park gate',
    status: 'in_progress',
    priority: 'medium',
    department: 'Sanitation',
    createdAt: '2026-10-16',
  },
];

export default function ComplaintsPage() {
  return (
    <main className="shell">
      <header className="page-header">
        <h2>Complaint queue</h2>
        <Link href="/complaints/new" className="button primary">Raise complaint</Link>
      </header>

      <div className="page-grid">
        <section className="panel">
          <div className="list">
            {complaints.map((complaint) => (
              <article key={complaint.id} className="complaint-item">
                <div className="status-row">
                  <span className="tag">#{complaint.id}</span>
                  <span className={`tag ${complaint.priority === 'critical' ? 'danger' : complaint.priority === 'high' ? 'warning' : 'success'}`}>
                    {complaint.priority}
                  </span>
                  <span className="tag">{complaint.status}</span>
                </div>
                <h3>{complaint.title}</h3>
                <div className="meta">
                  <span>{complaint.department}</span>
                  <span>•</span>
                  <span>{complaint.createdAt}</span>
                </div>
                <Link href={`/complaints/${complaint.id}`}>View details</Link>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel">
          <h3>Filters</h3>
          <form>
            <label>
              Status
              <select defaultValue="all">
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
            <label>
              Priority
              <select defaultValue="all">
                <option value="all">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
            </label>
          </form>
        </aside>
      </div>
    </main>
  );
}
