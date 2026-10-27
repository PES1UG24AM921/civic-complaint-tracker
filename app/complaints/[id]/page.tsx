'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Complaint = {
  complaint_id: number;
  citizen_id: number;
  title: string;
  priority: string;
  status: string;
  escalation_level: number;
  created_at: string;
  sla_deadline: string | null;
  resolved_at: string | null;
  citizen_name: string;
  officer_name: string | null;
  category_name: string;
  department_name: string;
  incident: { description?: string; location?: string | null } | null;
};

type CurrentUser = { user_id: number; role: 'citizen' | 'officer' | 'admin' };

export default function ComplaintDetailPage({ params }: { params: { id: string } }) {
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [nextStatus, setNextStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadComplaint = useCallback(async () => {
    try {
      const [complaintResponse, userResponse] = await Promise.all([
        fetch(`/api/complaints/${encodeURIComponent(params.id)}`),
        fetch('/api/complaints/me'),
      ]);
      const complaintData = await complaintResponse.json();
      const userData = await userResponse.json();
      if (!complaintResponse.ok) throw new Error(complaintData.error || 'Unable to load complaint.');
      if (!userResponse.ok) throw new Error(userData.error || 'Unable to load your account.');
      setComplaint(complaintData);
      setUser(userData);
      setNextStatus(complaintData.status);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load complaint.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { void loadComplaint(); }, [loadComplaint]);

  async function updateComplaint(body: { status?: string; assigned_officer_id?: number }) {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/complaints/${encodeURIComponent(params.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to update complaint.');
      await loadComplaint();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update complaint.');
    } finally {
      setSaving(false);
    }
  }

  const canManage = user?.role === 'officer' || user?.role === 'admin';
  const canClaim = user?.role === 'officer' && complaint?.status === 'open';

  return (
    <main className="shell">
      <header className="page-header">
        <h2>{complaint ? `Complaint #${complaint.complaint_id}` : 'Complaint details'}</h2>
        <Link href="/complaints" className="button secondary">Back to complaints</Link>
      </header>

      {error && (
        <section className="panel" role="alert">
          <p>{error}</p>
          {error === 'Authentication required.' && <Link href="/login">Sign in to continue</Link>}
        </section>
      )}
      {loading && <section className="panel"><p className="empty">Loading complaint…</p></section>}

      {!loading && complaint && (
        <>
          <section className="panel">
            <div className="status-row">
              <span className="tag">{complaint.status.replace('_', ' ')}</span>
              <span className={`tag ${complaint.priority === 'critical' ? 'danger' : complaint.priority === 'high' ? 'warning' : 'success'}`}>
                {complaint.priority}
              </span>
              {complaint.escalation_level > 0 && <span className="tag warning">Escalation level {complaint.escalation_level}</span>}
            </div>
            <h3>{complaint.title}</h3>
            <p>{complaint.incident?.description || 'No description was attached to this complaint.'}</p>
            <div className="meta">
              <span>Department: {complaint.department_name}</span>
              <span>Category: {complaint.category_name}</span>
              <span>Filed by: {complaint.citizen_name}</span>
              {complaint.incident?.location && <span>Location: {complaint.incident.location}</span>}
              {complaint.officer_name && <span>Officer: {complaint.officer_name}</span>}
              <span>Created: {new Date(complaint.created_at).toLocaleString()}</span>
              {complaint.sla_deadline && <span>SLA deadline: {new Date(complaint.sla_deadline).toLocaleString()}</span>}
              {complaint.resolved_at && <span>Resolved: {new Date(complaint.resolved_at).toLocaleString()}</span>}
            </div>
          </section>

          {canManage && (
            <section className="panel" style={{ marginTop: 20 }}>
              <h3>Update complaint</h3>
              <div className="form-stack">
                <label>
                  Status
                  <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                    <option value="open">Open</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <button type="button" disabled={saving || nextStatus === complaint.status} onClick={() => void updateComplaint({ status: nextStatus })}>
                  {saving ? 'Saving…' : 'Save status'}
                </button>
                {canClaim && (
                  <button type="button" disabled={saving || !user} onClick={() => user && void updateComplaint({ assigned_officer_id: user.user_id })}>
                    {saving ? 'Claiming…' : 'Claim this complaint'}
                  </button>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
