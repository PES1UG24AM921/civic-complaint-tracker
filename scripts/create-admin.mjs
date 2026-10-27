import bcrypt from 'bcryptjs';
import pg from 'pg';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
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
if (ADMIN_PASSWORD.length < 8 || Buffer.byteLength(ADMIN_PASSWORD, 'utf8') > 72) {
  throw new Error('ADMIN_PASSWORD must be at least 8 characters and no more than 72 UTF-8 bytes.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const client = await pool.connect();
let transactionStarted = false;
try {
  await client.query('BEGIN;');
  transactionStarted = true;
  await client.query("SELECT pg_advisory_xact_lock(hashtext('civic-complaint-tracker:initial-admin'));");

  const admins = await client.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1;");
  if (admins.rowCount > 0) {
    throw new Error('An administrator already exists; this bootstrap script only creates the first admin.');
  }
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const result = await client.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     RETURNING user_id, name, email, role;`,
    [ADMIN_NAME.trim(), ADMIN_EMAIL.trim().toLowerCase(), passwordHash]
  );
  await client.query('COMMIT;');
  transactionStarted = false;
  console.log(`Created initial administrator account ${result.rows[0].email} (user ${result.rows[0].user_id}).`);
} catch (error) {
  if (transactionStarted) {
    try {
      await client.query('ROLLBACK;');
    } catch (rollbackError) {
      console.error('Unable to roll back administrator setup:', rollbackError);
    }
  }
  throw error;
} finally {
  client.release();
  await pool.end();
}
