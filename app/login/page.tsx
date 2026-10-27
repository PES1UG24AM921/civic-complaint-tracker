'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Unable to log in.');
        return;
      }
      router.push(result.user.role === 'admin' ? '/admin' : result.user.role === 'officer' ? '/officer' : '/complaints');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="page-header"><h2>Sign in</h2></header>
      <section className="panel" style={{ maxWidth: 520, margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={150} /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <p role="alert" className="tag danger">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p>New citizen? <Link href="/register">Create an account</Link></p>
      </section>
    </main>
  );
}
