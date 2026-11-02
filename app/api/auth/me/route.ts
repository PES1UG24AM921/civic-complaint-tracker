import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/api/auth/current-session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const result = await db.query(
      `SELECT u.user_id, u.name, u.email, u.role, u.dept_id, d.name AS department
       FROM users u LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.user_id = $1;`,
      [session.userId]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Account no longer exists.' }, { status: 401 });
    }
    return NextResponse.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Unable to load current account:', error);
    return NextResponse.json({ error: 'Unable to load account.' }, { status: 500 });
  }
}
