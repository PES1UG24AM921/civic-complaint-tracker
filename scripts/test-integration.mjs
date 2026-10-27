import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
import { MongoClient, ObjectId } from 'mongodb';

const root = process.cwd();
const adminDatabaseUrl = process.env.TEST_DATABASE_URL;
const mongoUri = process.env.MONGODB_URI;

if (!adminDatabaseUrl || !mongoUri) {
  throw new Error('Set TEST_DATABASE_URL to a PostgreSQL connection that can create/drop databases and set MONGODB_URI before running integration tests.');
}

const testDatabase = `civic_test_${process.pid}_${Date.now().toString(36)}`;
const testComplaintIdStart = 1_000_000_000 + process.pid * 10;
const testDatabaseUrl = new URL(adminDatabaseUrl);
testDatabaseUrl.pathname = `/${testDatabase}`;
const adminClient = new Client({ connectionString: adminDatabaseUrl });
const mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
const testSecret = `integration-${randomUUID()}`;
const adminEmail = `admin-${process.pid}@example.test`;
const adminPassword = 'Integration-Admin-123';
const trackedComplaintIds = new Set();
let app;
let databaseCreated = false;
let mongoConnected = false;

function assertStatus(result, status, message) {
  assert.equal(result.response.status, status, `${message}: ${result.response.status} ${JSON.stringify(result.data)}`);
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function runNodeScript(scriptPath, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${scriptPath} exited with code ${code}`)));
  });
}

async function stopApp() {
  if (!app || app.exitCode !== null) return;
  app.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => app.once('close', resolve)),
    delay(5000).then(() => {
      if (app.exitCode === null) app.kill('SIGKILL');
    }),
  ]);
}

async function requestJson(baseUrl, path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const setCookie = response.headers.get('set-cookie');
  return {
    response,
    data,
    cookie: setCookie?.split(';', 1)[0],
  };
}

async function waitForApp(baseUrl) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error(`Next.js exited early (${app.exitCode}).`);
    try {
      const response = await fetch(new URL('/api/departments/categories', baseUrl));
      if (response.status === 200) return;
    } catch {
    }
    await delay(500);
  }
  throw new Error('Next.js did not become ready within 60 seconds.');
}

try {
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE "${testDatabase}";`);
  databaseCreated = true;
  const schema = await readFile(`${root}/schema.sql`, 'utf8');
  const schemaClient = new Client({ connectionString: testDatabaseUrl.toString() });
  await schemaClient.connect();
  await schemaClient.query(schema);
  await schemaClient.end();

  await mongo.connect();
  mongoConnected = true;
  await mongo.db('civic_db').command({ ping: 1 });
  const existingTestComment = await mongo.db('civic_db').collection('comments').findOne({
    complaint_id: { $gte: testComplaintIdStart, $lt: testComplaintIdStart + 10 },
  });
  assert.equal(existingTestComment, null, 'Reserved MongoDB complaint ID range must be unused');
  const sequenceClient = new Client({ connectionString: testDatabaseUrl.toString() });
  await sequenceClient.connect();
  await sequenceClient.query(
    "SELECT setval(pg_get_serial_sequence('complaints', 'complaint_id'), $1, true);",
    [testComplaintIdStart - 1]
  );
  await sequenceClient.end();

  const testEnv = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl.toString(),
    MONGODB_URI: mongoUri,
    JWT_SECRET: testSecret,
    ADMIN_NAME: 'Integration Admin',
    ADMIN_EMAIL: adminEmail,
    ADMIN_PASSWORD: adminPassword,
  };
  await runNodeScript('scripts/create-admin.mjs', testEnv);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: testEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', (chunk) => process.stdout.write(chunk));
  app.stderr.on('data', (chunk) => process.stderr.write(chunk));
  await waitForApp(baseUrl);

  const noSession = await requestJson(baseUrl, '/api/auth/users');
  assertStatus(noSession, 401, 'Unauthenticated admin API request is rejected');

  const adminLogin = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password: adminPassword },
  });
  assertStatus(adminLogin, 200, 'Initial admin can log in');
  const adminCookie = adminLogin.cookie;
  assert.ok(adminCookie, 'Login sets the session cookie');

  const longPassword = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Long Password', email: 'long-password@example.test', password: 'é'.repeat(37) },
  });
  assertStatus(longPassword, 400, 'Registration rejects bcrypt passwords over 72 UTF-8 bytes');

  const citizen = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Integration Citizen', email: `citizen-${process.pid}@example.test`, password: 'Citizen-Integration-123' },
  });
  assertStatus(citizen, 201, 'Citizen can self-register');
  const citizenCookie = citizen.cookie;
  const citizenId = citizen.data.user.user_id;
  assert.ok(citizenCookie);
  assertStatus(await requestJson(baseUrl, '/api/departments', {
    method: 'POST', body: { name: 'Denied department' }, cookie: citizenCookie,
  }), 403, 'Citizen cannot create a department');

  const department = await requestJson(baseUrl, '/api/departments', {
    method: 'POST', body: { name: 'Integration department' }, cookie: adminCookie,
  });
  assertStatus(department, 201, 'Admin can create a department');
  const departmentId = department.data.department.dept_id;
  assertStatus(await requestJson(baseUrl, `/api/departments/${departmentId}`, {
    method: 'PATCH', body: { name: 'Updated integration department' }, cookie: adminCookie,
  }), 200, 'Admin can rename a department');

  const category = await requestJson(baseUrl, `/api/departments/${departmentId}/categories`, {
    method: 'POST', body: { name: 'Integration category' }, cookie: adminCookie,
  });
  assertStatus(category, 201, 'Admin can create a category');
  const categoryId = category.data.category.category_id;
  assertStatus(await requestJson(baseUrl, `/api/departments/categories/${categoryId}`, {
    method: 'PATCH', body: { name: 'Updated integration category' }, cookie: adminCookie,
  }), 200, 'Admin can rename a category');

  const sla = await requestJson(baseUrl, `/api/departments/categories/${categoryId}/sla`, {
    method: 'POST',
    body: { priority: 'medium', resolve_hours: 24, escalate_after_hours: 12 },
    cookie: adminCookie,
  });
  assertStatus(sla, 201, 'Admin can create an SLA rule');
  assert.equal(sla.data.rule.resolve_hours, 24);
  assertStatus(await requestJson(baseUrl, `/api/departments/categories/${categoryId}/sla`, {
    method: 'POST',
    body: { priority: 'medium', resolve_hours: 24, escalate_after_hours: 12 },
    cookie: adminCookie,
  }), 409, 'Duplicate SLA priority is rejected');
  assertStatus(await requestJson(baseUrl, `/api/departments/categories/${categoryId}/sla?priority=medium`, {
    method: 'PATCH',
    body: { priority: 'high', resolve_hours: 36, escalate_after_hours: 18 },
    cookie: adminCookie,
  }), 200, 'Admin can update an SLA rule');
  assertStatus(await requestJson(baseUrl, `/api/departments/categories/${categoryId}/sla?priority=high`, {
    method: 'PATCH',
    body: { priority: 'medium', resolve_hours: 24, escalate_after_hours: 12 },
    cookie: adminCookie,
  }), 200, 'Admin can restore an SLA priority');
  const removableSla = await requestJson(baseUrl, `/api/departments/categories/${categoryId}/sla`, {
    method: 'POST',
    body: { priority: 'low', resolve_hours: 48, escalate_after_hours: 24 },
    cookie: adminCookie,
  });
  assertStatus(removableSla, 201, 'Admin can create an additional SLA rule');
  assertStatus(await requestJson(baseUrl, `/api/departments/categories/${categoryId}/sla?priority=low`, {
    method: 'DELETE', cookie: adminCookie,
  }), 200, 'Admin can delete an SLA rule');
  const removableCategory = await requestJson(baseUrl, `/api/departments/${departmentId}/categories`, {
    method: 'POST', body: { name: 'Removable integration category' }, cookie: adminCookie,
  });
  assertStatus(removableCategory, 201, 'Admin can create an additional category');
  assertStatus(await requestJson(baseUrl, `/api/departments/categories/${removableCategory.data.category.category_id}`, {
    method: 'DELETE', cookie: adminCookie,
  }), 200, 'Admin can delete an unused category');
  const removableDepartment = await requestJson(baseUrl, '/api/departments', {
    method: 'POST', body: { name: 'Removable integration department' }, cookie: adminCookie,
  });
  assertStatus(removableDepartment, 201, 'Admin can create an additional department');
  assertStatus(await requestJson(baseUrl, `/api/departments/${removableDepartment.data.department.dept_id}`, {
    method: 'DELETE', cookie: adminCookie,
  }), 200, 'Admin can delete an unused department');

  const officer = await requestJson(baseUrl, '/api/auth/users', {
    method: 'POST',
    body: { name: 'Integration Officer', email: `officer-${process.pid}@example.test`, password: 'Officer-Integration-123', role: 'officer', dept_id: departmentId },
    cookie: adminCookie,
  });
  assertStatus(officer, 201, 'Admin can create a department officer');
  const officerId = officer.data.user.user_id;
  assertStatus(await requestJson(baseUrl, `/api/auth/users/${officerId}`, {
    method: 'PATCH', body: { name: 'Updated Integration Officer' }, cookie: adminCookie,
  }), 200, 'Admin can update an account');
  const officerLogin = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: officer.data.user.email, password: 'Officer-Integration-123' },
  });
  assertStatus(officerLogin, 200, 'Officer can log in');
  const officerCookie = officerLogin.cookie;

  const complaint = await requestJson(baseUrl, '/api/complaints', {
    method: 'POST',
    body: {
      title: 'Integration streetlight outage',
      category_id: categoryId,
      priority: 'medium',
      description: 'The streetlight has been out for several nights.',
      location: 'Integration test block',
    },
    cookie: citizenCookie,
  });
  assertStatus(complaint, 201, 'Citizen can create a complaint');
  const complaintId = complaint.data.complaint_id;
  trackedComplaintIds.add(complaintId);
  assert.ok(complaint.data.sla_deadline, 'The schema trigger sets the SLA deadline');

  const citizenList = await requestJson(baseUrl, '/api/complaints', { cookie: citizenCookie });
  assertStatus(citizenList, 200, 'Citizen can list complaints');
  assert.ok(citizenList.data.some((row) => row.complaint_id === complaintId));
  assertStatus(await requestJson(baseUrl, `/api/complaints/${complaintId}`, { cookie: officerCookie }), 200, 'Department officer can view the complaint');
  assertStatus(await requestJson(baseUrl, `/api/complaints/${complaintId}`, { cookie: adminCookie }), 200, 'Admin can view the complaint');

  assertStatus(await requestJson(baseUrl, `/api/complaints/${complaintId}`, {
    method: 'PATCH', body: { assigned_officer_id: officerId }, cookie: citizenCookie,
  }), 403, 'Citizen cannot assign a complaint');
  const claim = await requestJson(baseUrl, `/api/complaints/${complaintId}`, {
    method: 'PATCH', body: { assigned_officer_id: officerId }, cookie: officerCookie,
  });
  assertStatus(claim, 200, 'Officer can claim a department complaint');
  assert.equal(claim.data.status, 'assigned');

  const citizenComment = await requestJson(baseUrl, `/api/comments/${complaintId}`, {
    method: 'POST', body: { body: 'Citizen comment for integration test.' }, cookie: citizenCookie,
  });
  assertStatus(citizenComment, 201, 'Citizen can comment on their own complaint');
  const officerComment = await requestJson(baseUrl, `/api/comments/${complaintId}`, {
    method: 'POST', body: { body: 'Officer comment for integration test.' }, cookie: officerCookie,
  });
  assertStatus(officerComment, 201, 'Department officer can comment on the complaint');
  const thread = await requestJson(baseUrl, `/api/comments/${complaintId}`, { cookie: citizenCookie });
  assertStatus(thread, 200, 'Complaint owner can read the comment thread');
  assert.equal(thread.data.length, 2);

  const outsider = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Other Citizen', email: `other-${process.pid}@example.test`, password: 'Other-Integration-123' },
  });
  assertStatus(outsider, 201, 'Second citizen can register');
  assertStatus(await requestJson(baseUrl, `/api/comments/${complaintId}`, { cookie: outsider.cookie }), 403, 'Other citizen cannot read complaint comments');

  const summary = await requestJson(baseUrl, `/api/comments/${complaintId}?summary=true`, { cookie: adminCookie });
  assertStatus(summary, 200, 'Admin can read MongoDB comment aggregation');
  assert.equal(summary.data.summary.reduce((sum, item) => sum + item.comment_count, 0), 2);

  const report = await requestJson(baseUrl, '/api/departments?report=performance', { cookie: adminCookie });
  assertStatus(report, 200, 'Admin performance report reads the schema view');
  assert.equal(Number(report.data.find((item) => item.department === 'Updated integration department').total), 1);
  assertStatus(await requestJson(baseUrl, '/api/departments?report=overdue', { cookie: adminCookie }), 200, 'Admin overdue report reads the schema view');

  const resolution = await requestJson(baseUrl, `/api/complaints/${complaintId}`, {
    method: 'PATCH', body: { status: 'resolved' }, cookie: officerCookie,
  });
  assertStatus(resolution, 200, 'Officer can resolve a complaint');
  assert.ok(resolution.data.resolved_at, 'Schema trigger stamps the resolution time');
  const history = new Client({ connectionString: testDatabaseUrl.toString() });
  await history.connect();
  const historyRows = await history.query('SELECT old_status, new_status FROM complaint_history WHERE complaint_id = $1;', [complaintId]);
  assert.ok(historyRows.rows.some((row) => row.new_status === 'resolved'), 'Schema trigger records status history');
  await history.end();

  const escalationComplaint = await requestJson(baseUrl, '/api/complaints', {
    method: 'POST',
    body: {
      title: 'Integration overdue streetlight',
      category_id: categoryId,
      priority: 'medium',
      description: 'This complaint is aged to exercise the escalation function.',
    },
    cookie: citizenCookie,
  });
  assertStatus(escalationComplaint, 201, 'Citizen can create an escalation test complaint');
  const escalationId = escalationComplaint.data.complaint_id;
  trackedComplaintIds.add(escalationId);
  const ageClient = new Client({ connectionString: testDatabaseUrl.toString() });
  await ageClient.connect();
  await ageClient.query(
    "UPDATE complaints SET created_at = now() - interval '13 hours' WHERE complaint_id = $1;",
    [escalationId]
  );
  await ageClient.end();

  assertStatus(await requestJson(baseUrl, '/api/escalations', { method: 'POST', cookie: citizenCookie }), 403, 'Citizen cannot trigger escalations');
  const escalation = await requestJson(baseUrl, '/api/escalations', { method: 'POST', cookie: adminCookie });
  assertStatus(escalation, 200, 'Admin can run overdue escalation');
  assert.ok(Number(escalation.data.escalated_count) >= 1);
  const escalationList = await requestJson(baseUrl, '/api/escalations', { cookie: officerCookie });
  assertStatus(escalationList, 200, 'Officer can view department escalations');
  assert.ok(escalationList.data.some((item) => item.complaint_id === escalationId));

  const revokedAdmin = await requestJson(baseUrl, '/api/auth/users', {
    method: 'POST',
    body: { name: 'Revoked Admin', email: `revoked-${process.pid}@example.test`, password: 'Revoked-Integration-123', role: 'admin' },
    cookie: adminCookie,
  });
  assertStatus(revokedAdmin, 201, 'Admin can create a second administrator');
  const revokedAdminLogin = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { email: revokedAdmin.data.user.email, password: 'Revoked-Integration-123' },
  });
  assertStatus(revokedAdminLogin, 200, 'Second admin can log in');
  const demotion = await requestJson(baseUrl, `/api/auth/users/${revokedAdmin.data.user.user_id}`, {
    method: 'PATCH', body: { role: 'citizen' }, cookie: adminCookie,
  });
  assertStatus(demotion, 200, 'Admin can demote another administrator when one remains');
  assertStatus(await requestJson(baseUrl, '/api/auth/users', { cookie: revokedAdminLogin.cookie }), 403, 'Demoted admin token no longer authorizes admin APIs');
  const removableUser = await requestJson(baseUrl, '/api/auth/users', {
    method: 'POST',
    body: { name: 'Removable user', email: `removable-${process.pid}@example.test`, password: 'Removable-Integration-123', role: 'citizen' },
    cookie: adminCookie,
  });
  assertStatus(removableUser, 201, 'Admin can create a removable user');
  assertStatus(await requestJson(baseUrl, `/api/auth/users/${removableUser.data.user.user_id}`, {
    method: 'DELETE', cookie: adminCookie,
  }), 200, 'Admin can delete an unreferenced user');

  const deleteDepartment = await requestJson(baseUrl, `/api/departments/${departmentId}`, {
    method: 'DELETE', cookie: adminCookie,
  });
  assertStatus(deleteDepartment, 409, 'Department deletion preserves the schema officer-department constraint');
  const deleteCategory = await requestJson(baseUrl, `/api/departments/categories/${categoryId}`, {
    method: 'DELETE', cookie: adminCookie,
  });
  assertStatus(deleteCategory, 409, 'Category deletion preserves complaint foreign keys');

  const logout = await requestJson(baseUrl, '/api/auth/logout', { method: 'POST', cookie: adminCookie });
  assertStatus(logout, 200, 'Logout clears the session');
  assertStatus(await requestJson(baseUrl, '/api/auth/users', { cookie: logout.cookie }), 401, 'Logged-out cookie is rejected');

  console.log('Integration suite passed: auth and revocation, role-protected admin CRUD, category/SLA, complaint submission and assignment, schema triggers and reports, comment access, Mongo aggregation, and escalation workflows.');
} finally {
  await stopApp();
  if (mongoConnected) {
    const comments = mongo.db('civic_db').collection('comments');
    if (trackedComplaintIds.size > 0) {
      const complaintIds = [...trackedComplaintIds];
      await comments.deleteMany({ complaint_id: { $in: complaintIds } });
      if (databaseCreated) {
        const cleanupClient = new Client({ connectionString: testDatabaseUrl.toString() });
        await cleanupClient.connect();
        const result = await cleanupClient.query(
          'SELECT mongo_doc_id FROM complaints WHERE complaint_id = ANY($1::int[]) AND mongo_doc_id IS NOT NULL;',
          [complaintIds]
        );
        await cleanupClient.end();
        const incidentIds = result.rows.map((row) => row.mongo_doc_id).filter(ObjectId.isValid).map((id) => new ObjectId(id));
        if (incidentIds.length > 0) {
          await mongo.db('civic_db').collection('incidents').deleteMany({ _id: { $in: incidentIds } });
        }
      }
    }
    await mongo.close();
  }
  if (databaseCreated) {
    await adminClient.query(`DROP DATABASE "${testDatabase}" WITH (FORCE);`);
  }
  await adminClient.end().catch(() => {});
}
