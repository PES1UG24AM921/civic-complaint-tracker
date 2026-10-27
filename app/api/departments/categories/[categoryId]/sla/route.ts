import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/api/auth/current-session';
import { db } from '@/lib/db';

type RouteContext = { params: { categoryId: string } };

function validId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const categoryId = validId(params.categoryId);
  if (!categoryId) return NextResponse.json({ error: 'Invalid category ID.' }, { status: 400 });
  try {
    const result = await db.query(
      `SELECT rule_id, category_id, priority, resolve_hours, escalate_after_hours
       FROM sla_rules WHERE category_id = $1 ORDER BY priority;`,
      [categoryId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Unable to load SLA rules:', error);
    return NextResponse.json({ error: 'Unable to load SLA rules.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const categoryId = validId(params.categoryId);
  const oldPriority = request.nextUrl.searchParams.get('priority');
  if (!categoryId || !oldPriority || !['low', 'medium', 'high', 'critical'].includes(oldPriority)) {
    return NextResponse.json({ error: 'Provide a valid category ID and current priority.' }, { status: 400 });
  }
  try {
    const body = await request.json();
    const priority = body?.priority;
    const resolveHours = Number(body?.resolve_hours);
    const escalateAfterHours = Number(body?.escalate_after_hours);
    if (!['low', 'medium', 'high', 'critical'].includes(priority) ||
        !Number.isInteger(resolveHours) || resolveHours < 1 ||
        !Number.isInteger(escalateAfterHours) || escalateAfterHours < 1 ||
        escalateAfterHours > resolveHours) {
      return NextResponse.json({ error: 'Provide a valid priority and positive hours; escalation must not exceed resolution.' }, { status: 400 });
    }
    const result = await db.query(
      `UPDATE sla_rules
       SET priority = $1, resolve_hours = $2, escalate_after_hours = $3
       WHERE category_id = $4 AND priority = $5
       RETURNING rule_id, category_id, priority, resolve_hours, escalate_after_hours;`,
      [priority, resolveHours, escalateAfterHours, categoryId, oldPriority]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: 'SLA rule not found.' }, { status: 404 });
    return NextResponse.json({ rule: result.rows[0] });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'An SLA rule already exists for this category and priority.' }, { status: 409 });
    }
    console.error('Unable to update SLA rule:', error);
    return NextResponse.json({ error: 'Unable to update SLA rule.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const categoryId = validId(params.categoryId);
  const priority = request.nextUrl.searchParams.get('priority');
  if (!categoryId || !priority || !['low', 'medium', 'high', 'critical'].includes(priority)) {
    return NextResponse.json({ error: 'Provide a valid category ID and priority.' }, { status: 400 });
  }
  try {
    const result = await db.query(
      'DELETE FROM sla_rules WHERE category_id = $1 AND priority = $2 RETURNING rule_id;',
      [categoryId, priority]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: 'SLA rule not found.' }, { status: 404 });
    return NextResponse.json({ message: 'SLA rule deleted.' });
  } catch (error) {
    console.error('Unable to delete SLA rule:', error);
    return NextResponse.json({ error: 'Unable to delete SLA rule.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const categoryId = validId(params.categoryId);
  if (!categoryId) return NextResponse.json({ error: 'Invalid category ID.' }, { status: 400 });
  try {
    const body = await request.json();
    const priority = body?.priority;
    const resolveHours = Number(body?.resolve_hours);
    const escalateAfterHours = Number(body?.escalate_after_hours);
    if (!['low', 'medium', 'high', 'critical'].includes(priority) ||
        !Number.isInteger(resolveHours) || resolveHours < 1 ||
        !Number.isInteger(escalateAfterHours) || escalateAfterHours < 1 ||
        escalateAfterHours > resolveHours) {
      return NextResponse.json({ error: 'Provide a valid priority and positive hours; escalation must not exceed resolution.' }, { status: 400 });
    }
    const result = await db.query(
      `INSERT INTO sla_rules (category_id, priority, resolve_hours, escalate_after_hours)
       VALUES ($1, $2, $3, $4)
       RETURNING rule_id, category_id, priority, resolve_hours, escalate_after_hours;`,
      [categoryId, priority, resolveHours, escalateAfterHours]
    );
    return NextResponse.json({ rule: result.rows[0] }, { status: 201 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'An SLA rule already exists for this category and priority.' }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    }
    console.error('Unable to create SLA rule:', error);
    return NextResponse.json({ error: 'Unable to create SLA rule.' }, { status: 500 });
  }
}
