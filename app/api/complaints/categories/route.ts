import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const result = await db.query(
      `SELECT c.category_id, c.name, d.name AS department_name
       FROM categories c
       JOIN departments d ON d.dept_id = c.dept_id
       ORDER BY d.name, c.name;`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Unable to load complaint categories:', error);
    return NextResponse.json({ error: 'Unable to load complaint categories.' }, { status: 500 });
  }
}
