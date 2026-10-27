'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Complaint = {
  complaint_id: number;
  title: string;
  status: string;
  priority: string;
  escalation_level: number;
  sla_deadline: string | null;
  category_name: string;
  department_name: string;
  officer_name: string | null;
};

type CurrentUser = { role: string; department_name: string | null };

export default function OfficerDashboardPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
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
        if (!complaintResponse.ok) throw new Error(complaintData.error || 'Unable to load department queue.');
        if (!userResponse.ok) throw new Error(userData.error || 'Unable to load your account.');
        if (userData.role !== 'officer' && userData.role !== 'admin') {
          throw new Error('This dashboard is only for officers and administrators.');
        }
        setComplaints(complaintData);
        setUser(userData);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load department queue.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const active = complaints.filter((complaint) => !['resolved', 'closed'].includes(complaint.status));
  const overdue = active.filter((complaint) =>
    complaint.sla_deadline !== null && new Date(complaint.sla_deadline).getTime() < Date.now()
  );
  const assigned = active.filter((complaint) => complaint.status === 'assigned' || complaint.status === 'in_progress');

  return (
    <main className="shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">{user?.department_name || (user?.role === 'admin' ? 'All departments' : 'Department')}</p>
          <h2>Officer dashboard</h2>
        </div>
        <Link href="/complaints" className="button secondary">Complaint list</Link>
      </header>

      {error && (
        <section className="panel" role="alert">
          <p>{error}</p>
          {error === 'Authentication required.' && <Link href="/login">Sign in to continue</Link>}
        </section>
      )}

      <section className="grid stats">
        <div className="card"><span>Active in queue</span><strong>{active.length}</strong></div>
        <div className="card"><span>Assigned / in progress</span><strong>{assigned.length}</strong></div>
        <div className="card"><span>Past SLA deadline</span><strong>{overdue.length}</strong></div>
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <h3>Department queue</h3>
        {loading ? <p className="empty">Loading department complaints…</p> : active.length === 0 && !error ? (
          <p className="empty">No active complaints in this queue.</p>
        ) : (
          <div className="list">
            {active.map((complaint) => {
              const isOverdue = overdue.some((item) => item.complaint_id === complaint.complaint_id);
              return (
                <article key={complaint.complaint_id} className="complaint-item">
                  <div className="status-row">
                    <span className="tag">#{complaint.complaint_id}</span>
                    <span className="tag">{complaint.department_name} · {complaint.category_name}</span>
                    <span className={`tag ${isOverdue ? 'danger' : 'success'}`}>{isOverdue ? 'Overdue' : complaint.status.replace('_', ' ')}</span>
                    {complaint.escalation_level > 0 && <span className="tag warning">Escalation {complaint.escalation_level}</span>}
                  </div>
                  <h3>{complaint.title}</h3>
                  <div className="meta">
                    <span>Priority: {complaint.priority}</span>
                    <span>{complaint.officer_name ? `Officer: ${complaint.officer_name}` : 'Unassigned'}</span>
                    {complaint.sla_deadline && <span>SLA: {new Date(complaint.sla_deadline).toLocaleString()}</span>}
                  </div>
                  <Link href={`/complaints/${complaint.complaint_id}`}>Review and update</Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
