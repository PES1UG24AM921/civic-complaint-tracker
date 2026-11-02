import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/api/auth/current-session';
import { db } from '@/lib/db';

async function validateParentDepartment(parentDeptId: number | null, deptId: number | null = null) {
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
    [parentDeptId, deptId ?? -1]
  );
  if ((cycleCheck.rowCount ?? 0) > 0) {
    throw new Error('Department hierarchy cannot create a cycle.');
  }
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession(request);
  const report = request.nextUrl.searchParams.get('report');

  if (report) {
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  try {
    if (report === 'performance') {
      const result = await db.query('SELECT * FROM v_dept_performance ORDER BY department;');
      return NextResponse.json(result.rows);
    }
    if (report === 'overdue') {
      const result = await db.query('SELECT * FROM v_overdue_complaints ORDER BY sla_deadline ASC;');
      return NextResponse.json(result.rows);
    }
    if (report === 'tree') {
      const result = await db.query('SELECT * FROM v_department_tree ORDER BY path;');
      return NextResponse.json(result.rows);
    }
    const result = await db.query(
      `SELECT d.dept_id, d.name, d.parent_dept_id,
              COALESCE(json_agg(
                json_build_object('category_id', c.category_id, 'name', c.name)
                ORDER BY c.name
              ) FILTER (WHERE c.category_id IS NOT NULL), '[]'::json) AS categories
       FROM departments d
       LEFT JOIN categories c ON c.dept_id = d.dept_id
       GROUP BY d.dept_id, d.name, d.parent_dept_id
       ORDER BY d.name;`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Unable to load department data:', error);
    return NextResponse.json({ error: 'Unable to load department data.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const parentDeptId = body?.parent_dept_id === undefined || body?.parent_dept_id === null || body?.parent_dept_id === ''
      ? null
      : Number(body.parent_dept_id);

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: 'Department name must be between 2 and 100 characters.' }, { status: 400 });
    }
    if (parentDeptId !== null && (!Number.isInteger(parentDeptId) || parentDeptId < 1)) {
      return NextResponse.json({ error: 'Provide a valid parent department ID.' }, { status: 400 });
    }
    if (parentDeptId !== null) {
      const parentCheck = await db.query('SELECT dept_id FROM departments WHERE dept_id = $1;', [parentDeptId]);
      if (parentCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Parent department not found.' }, { status: 404 });
      }
      await validateParentDepartment(parentDeptId, null);
    }

    const result = await db.query(
      'INSERT INTO departments (name, parent_dept_id) VALUES ($1, $2) RETURNING dept_id, name, parent_dept_id;',
      [name, parentDeptId]
    );
    return NextResponse.json({ department: result.rows[0] }, { status: 201 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'message' in error && error.message === 'Department hierarchy cannot create a cycle.') {
      return NextResponse.json({ error: 'Department hierarchy cannot create a cycle.' }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A department with this name already exists.' }, { status: 409 });
    }
    console.error('Unable to create department:', error);
    return NextResponse.json({ error: 'Unable to create department.' }, { status: 500 });
  }
}
