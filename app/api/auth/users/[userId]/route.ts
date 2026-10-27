import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getCurrentSession } from '@/app/api/auth/current-session';
import { db } from '@/lib/db';

type RouteContext = { params: { userId: string } };

function getUserId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const userId = getUserId(params.userId);
  if (!userId) return NextResponse.json({ error: 'Invalid user ID.' }, { status: 400 });
  try {
    const body = await request.json();
    const existing = await db.query(
      'SELECT role, dept_id FROM users WHERE user_id = $1;',
      [userId]
    );
    if (existing.rowCount === 0) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const nextRole = body.role === undefined ? existing.rows[0].role : body.role;
    const nextDeptId = body.dept_id === undefined
      ? existing.rows[0].dept_id
      : body.dept_id === null || body.dept_id === '' ? null : Number(body.dept_id);
    if (nextRole === 'officer' && nextDeptId === null) {
      return NextResponse.json({ error: 'Officers must belong to a department.' }, { status: 400 });
    }
    if (nextDeptId !== null && (!Number.isInteger(nextDeptId) || nextDeptId < 1)) {
      return NextResponse.json({ error: 'Invalid department ID.' }, { status: 400 });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    const addField = (column: string, value: unknown) => {
      fields.push(`${column} = $${index}`);
      values.push(value);
      index += 1;
    };

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length < 2 || name.length > 100) return NextResponse.json({ error: 'Name must be between 2 and 100 characters.' }, { status: 400 });
      addField('name', name);
    }
    if (body.email !== undefined) {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 150) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
      addField('email', email);
    }
    if (body.role !== undefined) {
      if (!['citizen', 'officer', 'admin'].includes(body.role)) return NextResponse.json({ error: 'Invalid account role.' }, { status: 400 });
      if (userId === session.userId && body.role !== session.role) return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 });
      if (existing.rows[0].role === 'admin' && body.role !== 'admin') {
        const adminCount = await db.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin';");
        if (adminCount.rows[0].count <= 1) {
          return NextResponse.json({ error: 'Cannot demote the last administrator.' }, { status: 409 });
        }
      }
      addField('role', body.role);
    }
    if (body.dept_id !== undefined) {
      addField('dept_id', nextDeptId);
    }
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < 8 || Buffer.byteLength(body.password, 'utf8') > 72) {
        return NextResponse.json({ error: 'Password must be at least 8 characters and no more than 72 UTF-8 bytes.' }, { status: 400 });
      }
      addField('password_hash', await bcrypt.hash(body.password, 12));
    }
    if (fields.length === 0) return NextResponse.json({ error: 'No valid user fields were provided.' }, { status: 400 });

    values.push(userId);
    const result = await db.query(
      `UPDATE users SET ${fields.join(', ')}
       WHERE user_id = $${index}
       RETURNING user_id, name, email, role, dept_id;`,
      values
    );
    return NextResponse.json({ user: result.rows[0] });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'The selected department does not exist.' }, { status: 400 });
    }
    console.error('Unable to update user:', error);
    return NextResponse.json({ error: 'Unable to update user.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const userId = getUserId(params.userId);
  if (!userId) return NextResponse.json({ error: 'Invalid user ID.' }, { status: 400 });
  if (userId === session.userId) return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });

  try {
    const adminCount = await db.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin';");
    const target = await db.query('SELECT role FROM users WHERE user_id = $1;', [userId]);
    if (target.rowCount === 0) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    if (target.rows[0].role === 'admin' && adminCount.rows[0].count <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last administrator.' }, { status: 409 });
    }
    await db.query('DELETE FROM users WHERE user_id = $1;', [userId]);
    return NextResponse.json({ message: 'User deleted.' });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'User is referenced by complaint records and cannot be deleted.' }, { status: 409 });
    }
    console.error('Unable to delete user:', error);
    return NextResponse.json({ error: 'Unable to delete user.' }, { status: 500 });
  }
}
