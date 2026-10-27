import bcrypt from 'bcryptjs';
import pg from 'pg';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());
const { Pool } = pg;
const { DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!DATABASE_URL || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('Set DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD before running this script.');
}
if (ADMIN_NAME.trim().length < 2 || ADMIN_NAME.trim().length > 100) {
  throw new Error('ADMIN_NAME must be between 2 and 100 characters.');
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ADMIN_EMAIL) || ADMIN_EMAIL.length > 150) {
  throw new Error('ADMIN_EMAIL must be a valid email address.');
}
if (ADMIN_PASSWORD.length < 8 || ADMIN_PASSWORD.length > 128) {
  throw new Error('ADMIN_PASSWORD must be between 8 and 128 characters.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

try {
  const admins = await pool.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1;");
  if (admins.rowCount > 0) {
    throw new Error('An administrator already exists; this bootstrap script only creates the first admin.');
  }
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     RETURNING user_id, name, email, role;`,
    [ADMIN_NAME.trim(), ADMIN_EMAIL.trim().toLowerCase(), passwordHash]
  );
  console.log(`Created initial administrator account ${result.rows[0].email} (user ${result.rows[0].user_id}).`);
} finally {
  await pool.end();
}
