import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await db.query(
      `SELECT c.category_id, c.name, c.dept_id, d.name AS department
       FROM categories c JOIN departments d ON d.dept_id = c.dept_id
       ORDER BY d.name, c.name;`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Unable to load categories:', error);
    return NextResponse.json({ error: 'Unable to load categories.' }, { status: 500 });
  }
}
