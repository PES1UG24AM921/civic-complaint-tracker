import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run the schema demo.');
}

const client = new Client({ connectionString });
const logLines = [];

try {
  await client.connect();
  const schemaSql = readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8');
  const migrationSql = readFileSync(path.join(process.cwd(), 'db', 'migrations', '002_department_hierarchy.sql'), 'utf8');

  logLines.push('--- schema.sql ---');
  await client.query(schemaSql);
  logLines.push('schema.sql applied successfully');

  logLines.push('--- migration 002_department_hierarchy.sql ---');
  await client.query(migrationSql);
  logLines.push('migration 002_department_hierarchy.sql applied successfully');

  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
  logLines.push(`tables now in schema: ${tables.rows.map((row) => row.table_name).join(', ')}`);

  const evidenceDir = path.join(process.cwd(), 'docs', 'evidence');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(path.join(evidenceDir, 'ddl-log.txt'), `${logLines.join('\n')}\n`, 'utf8');
  console.log(logLines.join('\n'));
} catch (error) {
  console.error('DDL demo failed:', error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
