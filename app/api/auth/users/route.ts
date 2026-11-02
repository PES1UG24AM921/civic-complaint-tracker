import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getCurrentSession } from '@/app/api/auth/current-session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  try {
    const result = await db.query(
      `SELECT u.user_id, u.name, u.email, u.role, u.dept_id, d.name AS department
       FROM users u LEFT JOIN departments d ON d.dept_id = u.dept_id
       ORDER BY u.name;`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Unable to load users:', error);
    return NextResponse.json({ error: 'Unable to load users.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const role = body?.role;
    const deptId = body?.dept_id === '' || body?.dept_id === undefined ? null : Number(body.dept_id);

    if (name.length < 2 || name.length > 100 ||
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 150 ||
        password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 ||
        !['citizen', 'officer', 'admin'].includes(role) ||
        (role === 'officer' && (!Number.isInteger(deptId) || Number(deptId) < 1)) ||
        (deptId !== null && (!Number.isInteger(deptId) || deptId < 1))) {
      return NextResponse.json({ error: 'Provide valid account details and an officer department when applicable.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role, dept_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, name, email, role, dept_id;`,
      [name, email, passwordHash, role, deptId]
    );
    return NextResponse.json({ user: result.rows[0] }, { status: 201 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'The selected department does not exist.' }, { status: 400 });
    }
    console.error('Unable to create user:', error);
    return NextResponse.json({ error: 'Unable to create user.' }, { status: 500 });
  }
}
