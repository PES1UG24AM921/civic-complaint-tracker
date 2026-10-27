import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { mongoDb } from '@/lib/mongo';

type RouteContext = { params: { complaintId: string } };
const statuses = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];

function parseComplaintId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function findAccessibleComplaint(complaintId: number, userId: number, role: string, deptId: number | null) {
  const result = await db.query(
    `SELECT c.complaint_id, c.citizen_id, c.category_id, c.title, c.mongo_doc_id,
            c.priority, c.status, c.assigned_officer_id, c.escalation_level,
            c.created_at, c.sla_deadline, c.resolved_at,
            cat.name AS category_name, cat.dept_id,
            d.name AS department_name,
            citizen.name AS citizen_name,
            officer.name AS officer_name
     FROM complaints c
     JOIN categories cat ON cat.category_id = c.category_id
     JOIN departments d ON d.dept_id = cat.dept_id
     JOIN users citizen ON citizen.user_id = c.citizen_id
     LEFT JOIN users officer ON officer.user_id = c.assigned_officer_id
     WHERE c.complaint_id = $1;`,
    [complaintId]
  );
  const complaint = result.rows[0];
  if (!complaint) return { complaint: null, allowed: false };

  const allowed = role === 'admin' ||
    (role === 'citizen' && complaint.citizen_id === userId) ||
    (role === 'officer' && deptId !== null && complaint.dept_id === deptId);
  return { complaint, allowed };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const complaintId = parseComplaintId(params.complaintId);
  if (!complaintId) return NextResponse.json({ error: 'Invalid complaint ID.' }, { status: 400 });

  try {
    const { complaint, allowed } = await findAccessibleComplaint(
      complaintId,
      session.userId,
      session.role,
      session.deptId
    );
    if (!complaint) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    if (!allowed) return NextResponse.json({ error: 'You cannot view this complaint.' }, { status: 403 });

    let incident = null;
    if (complaint.mongo_doc_id) {
      if (!ObjectId.isValid(complaint.mongo_doc_id)) {
        console.error(`Complaint ${complaintId} has an invalid MongoDB incident ID.`);
        return NextResponse.json({ error: 'Complaint details could not be loaded.' }, { status: 500 });
      }
      incident = await mongoDb.collection('incidents').findOne(
        { _id: new ObjectId(complaint.mongo_doc_id) },
        { projection: { description: 1, location: 1, tags: 1, attachments: 1 } }
      );
    }

    return NextResponse.json({ ...complaint, incident });
  } catch (error) {
    console.error('Unable to load complaint details:', error);
    return NextResponse.json({ error: 'Unable to load complaint details.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (session.role !== 'officer' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Only officers and administrators can update complaints.' }, { status: 403 });
  }
  if (session.role === 'officer' && session.deptId === null) {
    return NextResponse.json({ error: 'Your officer account is not assigned to a department.' }, { status: 403 });
  }

  const complaintId = parseComplaintId(params.complaintId);
  if (!complaintId) return NextResponse.json({ error: 'Invalid complaint ID.' }, { status: 400 });

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
    const keys = Object.keys(body ?? {});
    if (keys.length !== 1 || !['status', 'assigned_officer_id'].includes(keys[0])) {
      return NextResponse.json({ error: 'Update either status or assigned_officer_id.' }, { status: 400 });
    }

    const { complaint, allowed } = await findAccessibleComplaint(
      complaintId,
      session.userId,
      session.role,
      session.deptId
    );
    if (!complaint) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    if (!allowed) return NextResponse.json({ error: 'You cannot update this complaint.' }, { status: 403 });

    if (keys[0] === 'status') {
      if (typeof body.status !== 'string' || !statuses.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid complaint status.' }, { status: 400 });
      }
      const result = await db.query(
        `UPDATE complaints
         SET status = $1
         WHERE complaint_id = $2
         RETURNING complaint_id, title, status, priority, escalation_level, sla_deadline, resolved_at;`,
        [body.status, complaintId]
      );
      return NextResponse.json(result.rows[0]);
    }

    const officerId = Number(body.assigned_officer_id);
    if (!Number.isInteger(officerId) || officerId < 1) {
      return NextResponse.json({ error: 'Provide a valid officer ID.' }, { status: 400 });
    }
    if (session.role === 'officer' && officerId !== session.userId) {
      return NextResponse.json({ error: 'Officers can only claim complaints for themselves.' }, { status: 403 });
    }
    await db.query('CALL sp_assign_complaint($1, $2);', [complaintId, officerId]);
    const updated = await db.query(
      `SELECT c.complaint_id, c.title, c.status, c.priority, c.escalation_level,
              c.assigned_officer_id, c.sla_deadline, c.resolved_at
       FROM complaints c WHERE c.complaint_id = $1;`,
      [complaintId]
    );
    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0001') {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Complaint update is not allowed.' }, { status: 409 });
    }
    console.error('Unable to update complaint:', error);
    return NextResponse.json({ error: 'Unable to update complaint.' }, { status: 500 });
  }
}
