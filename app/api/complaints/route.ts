import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const result = await db.query(`
      SELECT c.complaint_id, c.title, c.status, c.priority, c.escalation_level,
             c.sla_deadline, c.created_at,
             u.name AS citizen_name,
             d.name AS department_name
      FROM complaints c
      JOIN users u ON u.user_id = c.citizen_id
      JOIN categories cat ON cat.category_id = c.category_id
      JOIN departments d ON d.dept_id = cat.dept_id
      ORDER BY c.created_at DESC
      LIMIT 50;
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to load complaints.', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { citizen_id, category_id, title, priority = 'medium', mongo_doc_id = null } = body ?? {};

    if (!citizen_id || !category_id || !title) {
      return NextResponse.json({ error: 'citizen_id, category_id, and title are required.' }, { status: 400 });
    }

    const result = await db.query(
      `INSERT INTO complaints (citizen_id, category_id, title, priority, mongo_doc_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING complaint_id, title, status, priority, escalation_level, created_at;`,
      [citizen_id, category_id, title, priority, mongo_doc_id]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to create complaint.', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
