'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Unable to create account.');
        return;
      }
      router.push('/complaints');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="page-header"><h2>Create a citizen account</h2></header>
      <section className="panel" style={{ maxWidth: 520, margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          <label>Name<input name="name" autoComplete="name" required minLength={2} maxLength={100} /></label>
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={150} /></label>
          <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></label>
          {error && <p role="alert" className="tag danger">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Register'}</button>
        </form>
        <p>Already registered? <Link href="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
