import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/api/auth/current-session';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { departmentId: string } }
) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const departmentId = Number(params.departmentId);
  if (!Number.isInteger(departmentId) || departmentId < 1) {
    return NextResponse.json({ error: 'Invalid department ID.' }, { status: 400 });
  }
  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: 'Category name must be between 2 and 100 characters.' }, { status: 400 });
    }
    const result = await db.query(
      `INSERT INTO categories (name, dept_id) VALUES ($1, $2)
       RETURNING category_id, name, dept_id;`,
      [name, departmentId]
    );
    return NextResponse.json({ category: result.rows[0] }, { status: 201 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'Department not found.' }, { status: 404 });
    }
    console.error('Unable to create category:', error);
    return NextResponse.json({ error: 'Unable to create category.' }, { status: 500 });
  }
}
