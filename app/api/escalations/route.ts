import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const result = await db.query(`
      SELECT e.escalation_id, e.complaint_id, e.from_level, e.to_level, e.escalated_at,
             c.title, d.name AS department_name
      FROM escalations e
      JOIN complaints c ON c.complaint_id = e.complaint_id
      JOIN categories cat ON cat.category_id = c.category_id
      JOIN departments d ON d.dept_id = cat.dept_id
      ORDER BY e.escalated_at DESC
      LIMIT 50;
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to load escalations.', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
