import jwt from 'jsonwebtoken';
import type { NextRequest } from 'next/server';

export type SessionUser = {
  userId: number;
  role: 'citizen' | 'officer' | 'admin';
  deptId: number | null;
};

export function getSession(req: NextRequest): SessionUser | null {
  const token = req.cookies.get('token')?.value;
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const payload = jwt.verify(token, secret) as { userId: number; role: SessionUser['role']; deptId?: number | null };
    return {
      userId: payload.userId,
      role: payload.role,
      deptId: payload.deptId ?? null,
    };
  } catch {
    return null;
  }
}

export function requireRole(req: NextRequest, roles: Array<SessionUser['role']>) {
  const session = getSession(req);
  if (!session) return null;
  if (!roles.includes(session.role)) return null;
  return session;
}
