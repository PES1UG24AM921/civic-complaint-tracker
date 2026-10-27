import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { mongoDb } from '@/lib/mongo';

const statuses = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
const priorities = ['low', 'medium', 'high', 'critical'];

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!['citizen', 'officer', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Invalid account role.' }, { status: 403 });
  }
  if (session.role === 'officer' && session.deptId === null) {
    return NextResponse.json({ error: 'Your officer account is not assigned to a department.' }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get('status');
  const priority = request.nextUrl.searchParams.get('priority');
  if (status && status !== 'all' && !statuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status filter.' }, { status: 400 });
  }
  if (priority && priority !== 'all' && !priorities.includes(priority)) {
    return NextResponse.json({ error: 'Invalid priority filter.' }, { status: 400 });
  }

  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (session.role === 'citizen') {
      values.push(session.userId);
      conditions.push(`c.citizen_id = $${values.length}`);
    } else if (session.role === 'officer') {
      values.push(session.deptId);
      conditions.push(`cat.dept_id = $${values.length}`);
    }
    if (status && status !== 'all') {
      values.push(status);
      conditions.push(`c.status = $${values.length}`);
    }
    if (priority && priority !== 'all') {
      values.push(priority);
      conditions.push(`c.priority = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT c.complaint_id, c.title, c.status, c.priority, c.escalation_level,
              c.sla_deadline, c.created_at, c.citizen_id, c.assigned_officer_id,
              citizen.name AS citizen_name, officer.name AS officer_name,
              cat.name AS category_name, d.name AS department_name
       FROM complaints c
       JOIN users citizen ON citizen.user_id = c.citizen_id
       JOIN categories cat ON cat.category_id = c.category_id
       JOIN departments d ON d.dept_id = cat.dept_id
       LEFT JOIN users officer ON officer.user_id = c.assigned_officer_id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT 100;`,
      values
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Unable to load complaints:', error);
    return NextResponse.json({ error: 'Unable to load complaints.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'citizen') return NextResponse.json({ error: 'Only citizens can submit complaints.' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isJsonObject(parsed)) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  try {
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const categoryId = Number(body?.category_id);
    const priority = body.priority === undefined
      ? 'medium'
      : typeof body.priority === 'string'
        ? body.priority
        : '';
    const location = body.location === undefined
      ? null
      : typeof body.location === 'string'
        ? body.location.trim() || null
        : undefined;

    if (title.length < 5 || title.length > 200) {
      return NextResponse.json({ error: 'Title must be between 5 and 200 characters.' }, { status: 400 });
    }
    if (!Number.isInteger(categoryId) || categoryId < 1) {
      return NextResponse.json({ error: 'Select a valid complaint category.' }, { status: 400 });
    }
    if (!priorities.includes(priority)) {
      return NextResponse.json({ error: 'Select a valid priority.' }, { status: 400 });
    }
    if (description.length < 10 || description.length > 5000) {
      return NextResponse.json({ error: 'Description must be between 10 and 5000 characters.' }, { status: 400 });
    }
    if (location === undefined || (location !== null && location.length > 300)) {
      return NextResponse.json({ error: 'Location must be 300 characters or fewer.' }, { status: 400 });
    }

    const category = await db.query(
      'SELECT category_id FROM categories WHERE category_id = $1;',
      [categoryId]
    );
    if (category.rowCount === 0) {
      return NextResponse.json({ error: 'Selected category does not exist.' }, { status: 400 });
    }

    const incident = await mongoDb.collection('incidents').insertOne({
      description,
      location,
      created_at: new Date(),
    });

    try {
      const result = await db.query(
        `INSERT INTO complaints (citizen_id, category_id, title, priority, mongo_doc_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING complaint_id, title, status, priority, escalation_level, sla_deadline, created_at;`,
        [session.userId, categoryId, title, priority, incident.insertedId.toHexString()]
      );
      return NextResponse.json({ ...result.rows[0], description, location }, { status: 201 });
    } catch (error) {
      try {
        await mongoDb.collection('incidents').deleteOne({ _id: incident.insertedId });
      } catch (cleanupError) {
        console.error('Unable to clean up incident document after complaint creation failed:', cleanupError);
      }
      throw error;
    }
  } catch (error) {
    console.error('Unable to create complaint:', error);
    return NextResponse.json({ error: 'Unable to create complaint.' }, { status: 500 });
  }
}
