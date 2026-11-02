import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/api/auth/current-session';
import { db } from '@/lib/db';

type RouteContext = { params: { departmentId: string } };

function getDepartmentId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function validateParentDepartment(parentDeptId: number | null, departmentId: number) {
  if (parentDeptId === null) return;
  const cycleCheck = await db.query(
    `WITH RECURSIVE descendants AS (
       SELECT dept_id, parent_dept_id FROM departments WHERE dept_id = $1
       UNION ALL
       SELECT d.dept_id, d.parent_dept_id
       FROM departments d
       JOIN descendants s ON s.dept_id = d.parent_dept_id
     )
     SELECT 1 FROM descendants WHERE dept_id = $2 LIMIT 1;`,
    [parentDeptId, departmentId]
  );
  if ((cycleCheck.rowCount ?? 0) > 0) {
    throw new Error('Department hierarchy cannot create a cycle.');
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const departmentId = getDepartmentId(params.departmentId);
  if (!departmentId) return NextResponse.json({ error: 'Invalid department ID.' }, { status: 400 });

  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const parentDeptId = body?.parent_dept_id === undefined || body?.parent_dept_id === null || body?.parent_dept_id === ''
      ? null
      : Number(body.parent_dept_id);

    if (name && (name.length < 2 || name.length > 100)) {
      return NextResponse.json({ error: 'Department name must be between 2 and 100 characters.' }, { status: 400 });
    }
    if (parentDeptId !== null && (!Number.isInteger(parentDeptId) || parentDeptId < 1)) {
      return NextResponse.json({ error: 'Provide a valid parent department ID.' }, { status: 400 });
    }
    if (parentDeptId === departmentId) {
      return NextResponse.json({ error: 'A department cannot be its own parent.' }, { status: 409 });
    }
    if (parentDeptId !== null) {
      const parentCheck = await db.query('SELECT dept_id FROM departments WHERE dept_id = $1;', [parentDeptId]);
      if (parentCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Parent department not found.' }, { status: 404 });
      }
      await validateParentDepartment(parentDeptId, departmentId);
    }

    const result = await db.query(
      'UPDATE departments SET name = COALESCE($1, name), parent_dept_id = $2 WHERE dept_id = $3 RETURNING dept_id, name, parent_dept_id;',
      [name || null, parentDeptId, departmentId]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: 'Department not found.' }, { status: 404 });
    return NextResponse.json({ department: result.rows[0] });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'message' in error && error.message === 'Department hierarchy cannot create a cycle.') {
      return NextResponse.json({ error: 'Department hierarchy cannot create a cycle.' }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A department with this name already exists.' }, { status: 409 });
    }
    console.error('Unable to update department:', error);
    return NextResponse.json({ error: 'Unable to update department.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await getCurrentSession(request);
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
