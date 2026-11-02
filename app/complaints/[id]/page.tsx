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
  history?: Array<{ history_id: number; old_status: string | null; new_status: string; changed_at: string }>;
  escalation_history?: Array<{ escalation_id: number; from_level: number; to_level: number; escalated_at: string }>;
};

type Comment = {
  _id?: { $oid?: string } | string;
  user_id: number;
  user_name: string;
  body: string;
  created_at: string;
};

type CurrentUser = { user_id: number; role: 'citizen' | 'officer' | 'admin' };

function getCommentId(comment: Comment) {
  if (typeof comment._id === 'string') return comment._id;
  return comment._id && '$oid' in comment._id ? comment._id.$oid ?? '' : '';
}

export default function ComplaintDetailPage({ params }: { params: { id: string } }) {
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
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

  const loadComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(params.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load comments.');
      setComments(data);
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : 'Unable to load comments.');
    }
  }, [params.id]);

  useEffect(() => { void loadComplaint(); }, [loadComplaint]);
  useEffect(() => { if (!loading && complaint) { void loadComments(); } }, [complaint, loadComments, loading]);

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

  async function addComment() {
    if (!newComment.trim()) return;
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(params.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to add comment.');
      setNewComment('');
      await loadComments();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to add comment.');
    }
  }

  async function saveCommentEdit(commentId: string) {
    if (!drafts[commentId]?.trim()) return;
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(params.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId, body: drafts[commentId].trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to edit comment.');
      setEditingCommentId(null);
      await loadComments();
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'Unable to edit comment.');
    }
  }

  async function deleteComment(commentId: string) {
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(params.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to delete comment.');
      await loadComments();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete comment.');
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

          <section className="panel" style={{ marginTop: 20 }}>
            <h3>Status timeline</h3>
            {complaint.history && complaint.history.length > 0 ? (
              <div className="list">
                {complaint.history.map((entry) => (
                  <div className="complaint-item" key={entry.history_id}>
                    <div className="status-row">
                      <span className="tag">{entry.old_status ?? 'created'}</span>
                      <span className="tag success">→ {entry.new_status}</span>
                    </div>
                    <div className="meta"><span>{new Date(entry.changed_at).toLocaleString()}</span></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">No status changes recorded yet.</p>
            )}
          </section>

          <section className="panel" style={{ marginTop: 20 }}>
            <h3>Escalation history</h3>
            {complaint.escalation_history && complaint.escalation_history.length > 0 ? (
              <div className="list">
                {complaint.escalation_history.map((entry) => (
                  <div className="complaint-item" key={entry.escalation_id}>
                    <strong>Level {entry.from_level} → {entry.to_level}</strong>
                    <div className="meta"><span>{new Date(entry.escalated_at).toLocaleString()}</span></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">No escalations have been recorded for this complaint.</p>
            )}
          </section>

          <section className="panel" style={{ marginTop: 20 }}>
            <h3>Comments</h3>
            {comments.length === 0 ? (<p className="empty">No comments yet.</p>) : (
              <div className="list">
                {comments.map((comment) => {
                  const commentId = getCommentId(comment);
                  const isOwner = user?.user_id === comment.user_id;
                  const isEditing = editingCommentId === commentId;
                  return (
                    <div key={commentId || `${comment.user_id}-${comment.created_at}`} className="complaint-item">
                      <div className="status-row">
                        <strong>{comment.user_name}</strong>
                        <span className="tag">{new Date(comment.created_at).toLocaleString()}</span>
                      </div>
                      {isEditing ? (
                        <>
                          <textarea value={drafts[commentId] ?? comment.body} onChange={(event) => setDrafts((current) => ({ ...current, [commentId]: event.target.value }))} />
                          <div className="status-row">
                            <button type="button" onClick={() => void saveCommentEdit(commentId)}>Save</button>
                            <button type="button" className="button secondary" onClick={() => setEditingCommentId(null)}>Cancel</button>
                          </div>
                        </>
                      ) : (
                        <p>{comment.body}</p>
                      )}
                      {(isOwner || user?.role === 'admin') && !isEditing && (
                        <div className="status-row">
                          <button type="button" className="button secondary" onClick={() => {
                            setEditingCommentId(commentId);
                            setDrafts((current) => ({ ...current, [commentId]: comment.body }));
                          }}>Edit</button>
                          <button type="button" className="button secondary" onClick={() => { if (commentId) void deleteComment(commentId); }}>Delete</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {user && (
              <div style={{ marginTop: 16 }}>
                <label>
                  Add a comment
                  <textarea value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Write a response…" />
                </label>
                <button type="button" disabled={!newComment.trim()} onClick={() => { void addComment(); }}>Post comment</button>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
