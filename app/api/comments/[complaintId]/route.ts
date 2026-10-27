import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { mongoDb } from '@/lib/mongo';

type CommentDocument = {
  complaint_id: number;
  user_id: number;
  user_name: string;
  body: string;
  created_at: Date;
};

async function getAccessibleComplaint(
  complaintId: number,
  userId: number,
  role: string,
  deptId: number | null
) {
  const result = await db.query(
    `SELECT c.citizen_id, cat.dept_id
     FROM complaints c
     JOIN categories cat ON cat.category_id = c.category_id
     WHERE c.complaint_id = $1;`,
    [complaintId]
  );
  const complaint = result.rows[0];
  if (!complaint) return { exists: false, allowed: false };
  const allowed = role === 'admin' ||
    (role === 'citizen' && complaint.citizen_id === userId) ||
    (role === 'officer' && deptId !== null && complaint.dept_id === deptId);
  return { exists: true, allowed };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { complaintId: string } }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const complaintId = Number(params.complaintId);
  if (!Number.isInteger(complaintId) || complaintId < 1) {
    return NextResponse.json({ error: 'Invalid complaint ID.' }, { status: 400 });
  }

  try {
    const access = await getAccessibleComplaint(complaintId, session.userId, session.role, session.deptId);
    if (!access.exists) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    if (!access.allowed) return NextResponse.json({ error: 'You cannot view comments for this complaint.' }, { status: 403 });

    const comments = mongoDb.collection<CommentDocument>('comments');
    if (request.nextUrl.searchParams.get('summary') === 'true') {
      const summary = await comments.aggregate([
        { $match: { complaint_id: complaintId } },
        {
          $group: {
            _id: '$user_id',
            user_name: { $first: '$user_name' },
            comment_count: { $sum: 1 },
            latest_comment_at: { $max: '$created_at' },
          },
        },
        { $sort: { latest_comment_at: -1 } },
        {
          $project: {
            _id: 0,
            user_id: '$_id',
            user_name: 1,
            comment_count: 1,
            latest_comment_at: 1,
          },
        },
      ]).toArray();
      return NextResponse.json({ summary });
    }

    const result = await comments.find(
      { complaint_id: complaintId },
      { projection: { _id: 0, complaint_id: 0 } }
    ).sort({ created_at: 1 }).toArray();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Unable to load complaint comments:', error);
    return NextResponse.json({ error: 'Unable to load comments.' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { complaintId: string } }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const complaintId = Number(params.complaintId);
  if (!Number.isInteger(complaintId) || complaintId < 1) {
    return NextResponse.json({ error: 'Invalid complaint ID.' }, { status: 400 });
  }

  try {
    const access = await getAccessibleComplaint(complaintId, session.userId, session.role, session.deptId);
    if (!access.exists) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    if (!access.allowed) return NextResponse.json({ error: 'You cannot comment on this complaint.' }, { status: 403 });

    const body = await request.json();
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!text || text.length > 2000) {
      return NextResponse.json({ error: 'Comment must be between 1 and 2000 characters.' }, { status: 400 });
    }

    const userResult = await db.query(
      'SELECT name FROM users WHERE user_id = $1;',
      [session.userId]
    );
    if (userResult.rowCount === 0) {
      return NextResponse.json({ error: 'Account no longer exists.' }, { status: 401 });
    }
    const comment: CommentDocument = {
      complaint_id: complaintId,
      user_id: session.userId,
      user_name: userResult.rows[0].name,
      body: text,
      created_at: new Date(),
    };
    const result = await mongoDb.collection<CommentDocument>('comments').insertOne(comment);
    return NextResponse.json(
      { comment: { ...comment, _id: result.insertedId } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unable to create complaint comment:', error);
    return NextResponse.json({ error: 'Unable to add comment.' }, { status: 500 });
  }
}
