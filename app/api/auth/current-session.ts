import type { NextRequest } from 'next/server';
import { getSession, type SessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

const roles: SessionUser['role'][] = ['citizen', 'officer', 'admin'];

export async function getCurrentSession(request: NextRequest): Promise<SessionUser | null> {
  const tokenSession = getSession(request);
  if (!tokenSession) return null;

  const result = await db.query(
    'SELECT role, dept_id FROM users WHERE user_id = $1;',
    [tokenSession.userId]
  );
  const user = result.rows[0];
  if (!user || !roles.includes(user.role)) return null;

  return {
    userId: tokenSession.userId,
    role: user.role,
    deptId: user.dept_id,
  };
}
