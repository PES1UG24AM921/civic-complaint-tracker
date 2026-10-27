import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const result = await db.query(
      `SELECT user_id, name, email, password_hash, role, dept_id
       FROM users WHERE email = $1;`,
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not configured.');
      return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 500 });
    }
    const token = jwt.sign(
      { userId: user.user_id, role: user.role, deptId: user.dept_id },
      secret,
      { expiresIn: '7d' }
    );
    const { password_hash: _passwordHash, ...safeUser } = user;
    const response = NextResponse.json({ user: safeUser });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json({ error: 'Unable to log in.' }, { status: 500 });
  }
}
