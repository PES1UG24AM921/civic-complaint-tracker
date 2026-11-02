import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/api/auth/current-session';
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

function parseCommentId(value: unknown) {
  if (typeof value !== 'string' || !ObjectId.isValid(value)) return null;
  return new ObjectId(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { complaintId: string } }
) {
  const session = await getCurrentSession(request);
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

    const result = await comments.find({ complaint_id: complaintId }).sort({ created_at: 1 }).toArray();
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
  const session = await getCurrentSession(request);
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { complaintId: string } }
) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const complaintId = Number(params.complaintId);
  if (!Number.isInteger(complaintId) || complaintId < 1) {
    return NextResponse.json({ error: 'Invalid complaint ID.' }, { status: 400 });
  }

  try {
    const access = await getAccessibleComplaint(complaintId, session.userId, session.role, session.deptId);
    if (!access.exists) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    if (!access.allowed) return NextResponse.json({ error: 'You cannot edit comments for this complaint.' }, { status: 403 });

    const body = await request.json();
    const commentId = parseCommentId(body?.comment_id ?? body?.commentId);
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!commentId || !text || text.length > 2000) {
      return NextResponse.json({ error: 'Provide a valid comment ID and body between 1 and 2000 characters.' }, { status: 400 });
    }

    const comments = mongoDb.collection<CommentDocument>('comments');
    const existingComment = await comments.findOne({ _id: commentId, complaint_id: complaintId });
    if (!existingComment) return NextResponse.json({ error: 'Comment not found.' }, { status: 404 });
    if (existingComment.user_id !== session.userId && session.role !== 'admin') {
      return NextResponse.json({ error: 'You can only edit your own comment.' }, { status: 403 });
    }

    const result = await comments.findOneAndUpdate(
      { _id: commentId, complaint_id: complaintId },
      { $set: { body: text } },
      { returnDocument: 'after' }
    );
    return NextResponse.json({ comment: result ?? null });
  } catch (error) {
    console.error('Unable to update complaint comment:', error);
    return NextResponse.json({ error: 'Unable to update comment.' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { complaintId: string } }
) {
  const session = await getCurrentSession(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const complaintId = Number(params.complaintId);
  if (!Number.isInteger(complaintId) || complaintId < 1) {
    return NextResponse.json({ error: 'Invalid complaint ID.' }, { status: 400 });
  }

  try {
    const access = await getAccessibleComplaint(complaintId, session.userId, session.role, session.deptId);
    if (!access.exists) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    if (!access.allowed) return NextResponse.json({ error: 'You cannot delete comments for this complaint.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const commentId = parseCommentId(body?.comment_id ?? body?.commentId ?? request.nextUrl.searchParams.get('comment_id'));
    if (!commentId) {
      return NextResponse.json({ error: 'Provide a valid comment ID.' }, { status: 400 });
    }

    const comments = mongoDb.collection<CommentDocument>('comments');
    const existingComment = await comments.findOne({ _id: commentId, complaint_id: complaintId });
    if (!existingComment) return NextResponse.json({ error: 'Comment not found.' }, { status: 404 });
    if (existingComment.user_id !== session.userId && session.role !== 'admin') {
      return NextResponse.json({ error: 'You can only delete your own comment.' }, { status: 403 });
    }

    const result = await comments.deleteOne({ _id: commentId, complaint_id: complaintId });
    if (result.deletedCount === 0) return NextResponse.json({ error: 'Comment not found.' }, { status: 404 });
    return NextResponse.json({ message: 'Comment deleted.' });
  } catch (error) {
    console.error('Unable to delete complaint comment:', error);
    return NextResponse.json({ error: 'Unable to delete comment.' }, { status: 500 });
  }
}
