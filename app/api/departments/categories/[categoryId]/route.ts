import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/api/auth/current-session';
import { db } from '@/lib/db';

type RouteContext = { params: { categoryId: string } };

function getCategoryId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const categoryId = getCategoryId(params.categoryId);
  if (!categoryId) return NextResponse.json({ error: 'Invalid category ID.' }, { status: 400 });
  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: 'Category name must be between 2 and 100 characters.' }, { status: 400 });
    }
    const result = await db.query(
      'UPDATE categories SET name = $1 WHERE category_id = $2 RETURNING category_id, name, dept_id;',
      [name, categoryId]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    return NextResponse.json({ category: result.rows[0] });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 });
    }
    console.error('Unable to update category:', error);
    return NextResponse.json({ error: 'Unable to update category.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const categoryId = getCategoryId(params.categoryId);
  if (!categoryId) return NextResponse.json({ error: 'Invalid category ID.' }, { status: 400 });
  try {
    const result = await db.query('DELETE FROM categories WHERE category_id = $1 RETURNING category_id;', [categoryId]);
    if (result.rowCount === 0) return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    return NextResponse.json({ message: 'Category deleted.' });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'Category is referenced by complaints and cannot be deleted.' }, { status: 409 });
    }
    console.error('Unable to delete category:', error);
    return NextResponse.json({ error: 'Unable to delete category.' }, { status: 500 });
  }
}
