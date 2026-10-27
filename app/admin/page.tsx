'use client';

import { FormEvent, useEffect, useState } from 'react';

type Department = { dept_id: number; name: string };
type Category = { category_id: number; name: string; dept_id: number; department: string };
type User = { user_id: number; name: string; email: string; role: string; dept_id: number | null; department: string | null };
type Performance = { department: string; total: number; within_sla: number; avg_resolution_hrs: number | null };
type Overdue = { complaint_id: number; title: string; priority: string; status: string; escalation_level: number; department: string };

async function requestJson(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed.');
  return result;
}

export default function AdminPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [performance, setPerformance] = useState<Performance[]>([]);
  const [overdue, setOverdue] = useState<Overdue[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    try {
      const [departmentRows, categoryRows, userRows, performanceRows, overdueRows] = await Promise.all([
        requestJson('/api/departments'),
        requestJson('/api/departments/categories'),
        requestJson('/api/auth/users'),
        requestJson('/api/departments?report=performance'),
        requestJson('/api/departments?report=overdue'),
      ]);
      setDepartments(departmentRows);
      setCategories(categoryRows);
      setUsers(userRows);
      setPerformance(performanceRows);
      setOverdue(overdueRows);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load admin data.');
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function handleCreate(
    event: FormEvent<HTMLFormElement>,
    path: (form: FormData) => string,
    method = 'POST'
  ) {
    event.preventDefault();
    setMessage('');
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const data = Object.fromEntries(form.entries());
    try {
      await requestJson(path(form), method, data);
      formElement.reset();
      setMessage('Saved successfully.');
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save changes.');
    }
  }

  return (
    <main className="shell">
      <header className="page-header">
        <h2>Administration</h2>
        <button type="button" className="button secondary" onClick={() => { void fetch('/api/auth/logout', { method: 'POST' }).then(() => { window.location.href = '/login'; }); }}>
          Sign out
        </button>
      </header>
      {message && <p role="status" className="tag success">{message}</p>}
      {error && <p role="alert" className="tag danger">{error}</p>}

      <section className="grid stats">
        <div className="card"><span>Departments</span><strong>{departments.length}</strong></div>
        <div className="card"><span>Categories</span><strong>{categories.length}</strong></div>
        <div className="card"><span>Users</span><strong>{users.length}</strong></div>
        <div className="card"><span>Overdue complaints</span><strong>{overdue.length}</strong></div>
      </section>

      <section className="page-grid" style={{ marginTop: 24 }}>
        <div className="panel">
          <h3>Departments and categories</h3>
          <div className="list">
            {departments.map((department) => (
              <article className="complaint-item" key={department.dept_id}>
                <strong>{department.name}</strong>
                <div className="meta">
                  {categories.filter((category) => category.dept_id === department.dept_id).map((category) => category.name).join(', ') || 'No categories yet'}
                </div>
              </article>
            ))}
          </div>
          <form onSubmit={(event) => handleCreate(event, () => '/api/departments')}>
            <label>New department<input name="name" required minLength={2} maxLength={100} /></label>
            <button type="submit">Add department</button>
          </form>
          <form onSubmit={(event) => handleCreate(event, (form) => `/api/departments/${form.get('dept_id')}/categories`)} style={{ marginTop: 20 }}>
            <label>Department
              <select name="dept_id" required defaultValue="">
                <option value="" disabled>Select department</option>
                {departments.map((department) => <option key={department.dept_id} value={department.dept_id}>{department.name}</option>)}
              </select>
            </label>
            <label>New category<input name="name" required minLength={2} maxLength={100} /></label>
            <button type="submit">Add category</button>
          </form>
        </div>

        <div className="panel">
          <h3>Create account</h3>
          <form onSubmit={(event) => handleCreate(event, () => '/api/auth/users')}>
            <label>Name<input name="name" required minLength={2} maxLength={100} /></label>
            <label>Email<input name="email" type="email" required maxLength={150} /></label>
            <label>Temporary password<input name="password" type="password" required minLength={8} maxLength={128} /></label>
            <label>Role
              <select name="role" required defaultValue="officer">
                <option value="citizen">Citizen</option><option value="officer">Officer</option><option value="admin">Admin</option>
              </select>
            </label>
            <label>Department (required for officers)
              <select name="dept_id" defaultValue="">
                <option value="">None</option>
                {departments.map((department) => <option key={department.dept_id} value={department.dept_id}>{department.name}</option>)}
              </select>
            </label>
            <button type="submit">Create account</button>
          </form>
        </div>
      </section>

      <section className="page-grid" style={{ marginTop: 24 }}>
        <div className="panel">
          <h3>Department performance</h3>
          <div className="list">
            {performance.map((row) => (
              <article className="complaint-item" key={row.department}>
                <strong>{row.department}</strong>
                <div className="meta">Total: {row.total} · Within SLA: {row.within_sla} · Avg. resolution: {row.avg_resolution_hrs ?? '—'} hours</div>
              </article>
            ))}
            {performance.length === 0 && <p className="empty">No complaint performance data yet.</p>}
          </div>
        </div>
        <div className="panel">
          <h3>Overdue complaints</h3>
          <div className="list">
            {overdue.slice(0, 10).map((row) => (
              <article className="complaint-item" key={row.complaint_id}>
                <strong>#{row.complaint_id} — {row.title}</strong>
                <div className="meta">{row.department} · {row.status} · Level {row.escalation_level}</div>
              </article>
            ))}
            {overdue.length === 0 && <p className="empty">No overdue complaints.</p>}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <h3>Users</h3>
        <div className="list">
          {users.map((user) => (
            <article className="complaint-item" key={user.user_id}>
              <strong>{user.name}</strong>
              <div className="meta">{user.email} · {user.role}{user.department ? ` · ${user.department}` : ''}</div>
            </article>
          ))}
          {users.length === 0 && <p className="empty">No user records found.</p>}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <h3>Create SLA rule</h3>
        <form onSubmit={(event) => handleCreate(event, (form) => `/api/departments/categories/${form.get('category_id')}/sla`)}>
          <label>Category
            <select name="category_id" required defaultValue="">
              <option value="" disabled>Select category</option>
              {categories.map((category) => <option key={category.category_id} value={category.category_id}>{category.department} — {category.name}</option>)}
            </select>
          </label>
          <label>Priority
            <select name="priority" required defaultValue="medium">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </select>
          </label>
          <label>Resolve within (hours)<input name="resolve_hours" type="number" min={1} required /></label>
          <label>Escalate after (hours)<input name="escalate_after_hours" type="number" min={1} required /></label>
          <button type="submit">Add SLA rule</button>
        </form>
      </section>
    </main>
  );
}
