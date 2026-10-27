import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

type RouteContext = { params: { departmentId: string } };

function getDepartmentId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const departmentId = getDepartmentId(params.departmentId);
  if (!departmentId) return NextResponse.json({ error: 'Invalid department ID.' }, { status: 400 });

  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: 'Department name must be between 2 and 100 characters.' }, { status: 400 });
    }
    const result = await db.query(
      'UPDATE departments SET name = $1 WHERE dept_id = $2 RETURNING dept_id, name;',
      [name, departmentId]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: 'Department not found.' }, { status: 404 });
    return NextResponse.json({ department: result.rows[0] });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A department with this name already exists.' }, { status: 409 });
    }
    console.error('Unable to update department:', error);
    return NextResponse.json({ error: 'Unable to update department.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const departmentId = getDepartmentId(params.departmentId);
  if (!departmentId) return NextResponse.json({ error: 'Invalid department ID.' }, { status: 400 });

  try {
    const result = await db.query('DELETE FROM departments WHERE dept_id = $1 RETURNING dept_id;', [departmentId]);
    if (result.rowCount === 0) return NextResponse.json({ error: 'Department not found.' }, { status: 404 });
    return NextResponse.json({ message: 'Department deleted.' });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'Department is in use and cannot be deleted.' }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23514') {
      return NextResponse.json({ error: 'Department is assigned to officers and cannot be deleted.' }, { status: 409 });
    }
    console.error('Unable to delete department:', error);
    return NextResponse.json({ error: 'Unable to delete department.' }, { status: 500 });
  }
}
