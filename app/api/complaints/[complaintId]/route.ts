import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(request: NextRequest, { params }: { params: { complaintId: string } }) {
  try {
    const complaintId = Number(params.complaintId);
    const body = await request.json();

    if (!complaintId || Number.isNaN(complaintId)) {
      return NextResponse.json({ error: 'Invalid complaintId.' }, { status: 400 });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (body.status) {
      fields.push(`status = $${index}`); values.push(body.status); index += 1;
    }
    if (body.assigned_officer_id !== undefined) {
      fields.push(`assigned_officer_id = $${index}`); values.push(body.assigned_officer_id); index += 1;
    }
    if (body.priority) {
      fields.push(`priority = $${index}`); values.push(body.priority); index += 1;
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No complaint fields were provided to update.' }, { status: 400 });
    }

    values.push(complaintId);
    const query = `UPDATE complaints SET ${fields.join(', ')} WHERE complaint_id = $${index} RETURNING *;`;
    const result = await db.query(query, values);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to update complaint.', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
