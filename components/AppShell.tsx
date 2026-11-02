'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type SessionUser = { role: 'citizen' | 'officer' | 'admin'; user_id?: number };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setSession(data.user ?? data);
        } else {
          setSession(null);
        }
      } catch {
        setSession(null);
      } finally {
        setLoading(false);
      }
    }

    void loadSession();
  }, []);

  useEffect(() => {
    if (loading) return;
    const publicPaths = ['/login', '/register', '/'];
    if (!session && !publicPaths.includes(pathname)) {
      router.push('/login');
    }
  }, [loading, pathname, router, session]);

  async function handleLogOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setSession(null);
      router.push('/login');
    } catch {
      router.push('/login');
    }
  }

  const shouldHideNav = pathname === '/login' || pathname === '/register';

  return (
    <>
      {!shouldHideNav && (
        <nav className="top-nav" aria-label="Main navigation">
          <div className="top-nav-inner shell">
            <div className="nav-brand">
              <Link href={session ? (session.role === 'admin' ? '/admin' : session.role === 'officer' ? '/officer' : '/complaints') : '/'}>Civic Tracker</Link>
            </div>
            <div className="nav-links">
              {session ? (
                <>
                  <Link href={session.role === 'admin' ? '/admin' : session.role === 'officer' ? '/officer' : '/complaints'}>Dashboard</Link>
                  <Link href="/complaints">Complaints</Link>
                  {session.role === 'admin' && <Link href="/admin">Admin</Link>}
                  {session.role === 'officer' && <Link href="/officer">Officer</Link>}
                  <button type="button" className="button secondary nav-button" onClick={() => { void handleLogOut(); }}>Sign out</button>
                </>
              ) : (
                <>
                  <Link href="/login">Login</Link>
                  <Link href="/register">Register</Link>
                </>
              )}
            </div>
          </div>
        </nav>
      )}
      {children}
    </>
  );
}
