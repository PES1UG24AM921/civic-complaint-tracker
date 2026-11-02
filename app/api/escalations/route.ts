import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin' && session.role !== 'officer') {
    return NextResponse.json({ error: 'Officer or administrator access required.' }, { status: 403 });
  }
  if (session.role === 'officer' && session.deptId === null) {
    return NextResponse.json({ error: 'Your officer account is not assigned to a department.' }, { status: 403 });
  }

  try {
    const values: unknown[] = [];
    let departmentFilter = '';
    if (session.role === 'officer') {
      values.push(session.deptId);
      departmentFilter = `WHERE cat.dept_id = $${values.length}`;
    }
    const result = await db.query(`
      SELECT e.escalation_id, e.complaint_id, e.from_level, e.to_level, e.escalated_at,
             c.title, d.name AS department_name
      FROM escalations e
      JOIN complaints c ON c.complaint_id = e.complaint_id
      JOIN categories cat ON cat.category_id = c.category_id
      JOIN departments d ON d.dept_id = cat.dept_id
      ${departmentFilter}
      ORDER BY e.escalated_at DESC
      LIMIT 50;
    `, values);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Unable to load escalations:', error);
    return NextResponse.json({ error: 'Unable to load escalations.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  try {
    const result = await db.query('SELECT fn_escalate_overdue() AS escalated_count;');
    return NextResponse.json({ escalated_count: result.rows[0].escalated_count });
  } catch (error) {
    console.error('Unable to escalate overdue complaints:', error);
    return NextResponse.json({ error: 'Unable to escalate overdue complaints.' }, { status: 500 });
  }
}
