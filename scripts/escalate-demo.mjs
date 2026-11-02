import { Client } from 'pg';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run the escalation demo.');
}

const client = new Client({ connectionString });
const logLines = ['Escalation demo started'];

try {
  await client.connect();
  const result = await client.query('SELECT fn_escalate_overdue() AS escalated_count;');
  logLines.push(`fn_escalate_overdue() -> ${result.rows[0].escalated_count}`);
  const history = await client.query('SELECT complaint_id, from_level, to_level, escalated_at FROM escalations ORDER BY escalated_at DESC LIMIT 10;');
  logLines.push(`recent escalations: ${JSON.stringify(history.rows)}`);

  const evidenceDir = path.join(process.cwd(), 'docs', 'evidence');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(path.join(evidenceDir, 'trigger-proc-log.txt'), `${logLines.join('\n')}\n`, 'utf8');
  console.log(logLines.join('\n'));
} catch (error) {
  console.error('Escalation demo failed:', error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
