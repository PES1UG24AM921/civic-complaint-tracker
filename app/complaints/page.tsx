'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Complaint = {
  complaint_id: number;
  title: string;
  status: string;
  priority: string;
  escalation_level: number;
  sla_deadline: string | null;
  created_at: string;
  citizen_name: string;
  officer_name: string | null;
  category_name: string;
  department_name: string;
};

type CurrentUser = { role: 'citizen' | 'officer' | 'admin' };

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [complaintResponse, userResponse] = await Promise.all([
          fetch('/api/complaints'),
          fetch('/api/complaints/me'),
        ]);
        const complaintData = await complaintResponse.json();
        const userData = await userResponse.json();
        if (!complaintResponse.ok) throw new Error(complaintData.error || 'Unable to load complaints.');
        if (!userResponse.ok) throw new Error(userData.error || 'Unable to load your account.');
        setComplaints(complaintData);
        setUser(userData);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load complaints.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const filtered = useMemo(
    () => complaints.filter((complaint) =>
      (statusFilter === 'all' || complaint.status === statusFilter) &&
      (priorityFilter === 'all' || complaint.priority === priorityFilter)
    ),
    [complaints, statusFilter, priorityFilter]
  );

  return (
    <main className="shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">{user?.role === 'officer' ? 'Department queue' : user?.role === 'admin' ? 'All departments' : 'Your reports'}</p>
          <h2>Complaints</h2>
        </div>
        {user?.role === 'citizen' && <Link href="/complaints/new" className="button primary">Raise complaint</Link>}
      </header>

      {error && (
        <section className="panel" role="alert">
          <p>{error}</p>
          {error === 'Authentication required.' && <Link href="/login">Sign in to continue</Link>}
        </section>
      )}

      <div className="page-grid">
        <section className="panel">
          {loading ? <p className="empty">Loading complaints…</p> : filtered.length === 0 && !error ? (
            <p className="empty">No complaints match these filters.</p>
          ) : (
            <div className="list">
              {filtered.map((complaint) => (
                <article key={complaint.complaint_id} className="complaint-item">
                  <div className="status-row">
                    <span className="tag">#{complaint.complaint_id}</span>
                    <span className={`tag ${complaint.priority === 'critical' ? 'danger' : complaint.priority === 'high' ? 'warning' : 'success'}`}>
                      {complaint.priority}
                    </span>
                    <span className="tag">{complaint.status.replace('_', ' ')}</span>
                    {complaint.escalation_level > 0 && <span className="tag warning">Escalation {complaint.escalation_level}</span>}
                  </div>
                  <h3>{complaint.title}</h3>
                  <div className="meta">
                    <span>{complaint.department_name} · {complaint.category_name}</span>
                    <span>Filed by {complaint.citizen_name}</span>
                    <span>Created {new Date(complaint.created_at).toLocaleDateString()}</span>
                    {complaint.officer_name && <span>Officer: {complaint.officer_name}</span>}
                  </div>
                  <Link href={`/complaints/${complaint.complaint_id}`}>View details</Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="panel">
          <h3>Filter complaints</h3>
          <div className="form-stack">
            <label>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label>
              Priority
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                <option value="all">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
        </aside>
      </div>
    </main>
  );
}
