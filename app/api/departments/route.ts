import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/api/auth/current-session';
import { db } from '@/lib/db';

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
    const result = await db.query(
      `SELECT d.dept_id, d.name,
              COALESCE(json_agg(
                json_build_object('category_id', c.category_id, 'name', c.name)
                ORDER BY c.name
              ) FILTER (WHERE c.category_id IS NOT NULL), '[]'::json) AS categories
       FROM departments d
       LEFT JOIN categories c ON c.dept_id = d.dept_id
       GROUP BY d.dept_id, d.name
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
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: 'Department name must be between 2 and 100 characters.' }, { status: 400 });
    }
    const result = await db.query(
      'INSERT INTO departments (name) VALUES ($1) RETURNING dept_id, name;',
      [name]
    );
    return NextResponse.json({ department: result.rows[0] }, { status: 201 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A department with this name already exists.' }, { status: 409 });
    }
    console.error('Unable to create department:', error);
    return NextResponse.json({ error: 'Unable to create department.' }, { status: 500 });
  }
}
