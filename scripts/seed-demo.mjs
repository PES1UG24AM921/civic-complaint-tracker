import { MongoClient } from 'mongodb';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const mongoUri = process.env.MONGODB_URI;

if (!databaseUrl || !mongoUri) {
  throw new Error('Set DATABASE_URL and MONGODB_URI before running the demo seed script.');
}

async function main() {
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();

  try {
    const departmentResult = await pg.query(
      "INSERT INTO departments (name) VALUES ('Municipal Services'), ('Roads and Transport') ON CONFLICT (name) DO NOTHING RETURNING dept_id, name;"
    );
    const departments = departmentResult.rows;
    const municipal = departments.find((row) => row.name === 'Municipal Services') ?? (await pg.query("SELECT dept_id, name FROM departments WHERE name = 'Municipal Services';")).rows[0];
    const roads = departments.find((row) => row.name === 'Roads and Transport') ?? (await pg.query("SELECT dept_id, name FROM departments WHERE name = 'Roads and Transport';")).rows[0];

    const categoryNames = [
      ['Garbage Collection', municipal.dept_id],
      ['Water Supply', municipal.dept_id],
      ['Potholes', roads.dept_id],
    ];

    for (const [name, deptId] of categoryNames) {
      await pg.query(
        'INSERT INTO categories (name, dept_id) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING;',
        [name, deptId]
      );
    }

    const citizenEmail = 'citizen.demo@example.test';
    const officerEmail = 'officer.demo@example.test';
    const adminEmail = 'admin.demo@example.test';

    await pg.query(
      `INSERT INTO users (name, email, password_hash, role, dept_id)
       VALUES
         ('Demo Citizen', $1, '$2a$12$7hVTbQn2X1iC8u6uMn5JcO0vA0vYbn8mYI0mYQ3Oa5Ww68n9PvI0W', 'citizen', NULL),
         ('Demo Officer', $2, '$2a$12$7hVTbQn2X1iC8u6uMn5JcO0vA0vYbn8mYI0mYQ3Oa5Ww68n9PvI0W', 'officer', $3),
         ('Demo Admin', $4, '$2a$12$7hVTbQn2X1iC8u6uMn5JcO0vA0vYbn8mYI0mYQ3Oa5Ww68n9PvI0W', 'admin', NULL)
       ON CONFLICT (email) DO NOTHING;`,
      [citizenEmail, officerEmail, municipal.dept_id, adminEmail]
    );

    const categoryRows = await pg.query('SELECT category_id, name FROM categories ORDER BY name;');
    const complaintTitle = 'Demo water supply issue';
    const complaintCategory = categoryRows.rows.find((row) => row.name === 'Water Supply');
    if (complaintCategory) {
      const mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
      await mongo.connect();
      const incident = await mongo.db('civic_db').collection('incidents').insertOne({
        description: 'A demo water supply complaint for local testing.',
        location: 'Demo Ward 12',
        created_at: new Date(),
      });
      await pg.query(
        'INSERT INTO complaints (citizen_id, category_id, title, mongo_doc_id, priority, status) VALUES ((SELECT user_id FROM users WHERE email = $1), $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING;',
        [citizenEmail, complaintCategory.category_id, complaintTitle, incident.insertedId.toHexString(), 'medium', 'open']
      );
      await mongo.close();
    }
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error('Demo seed failed:', error);
  process.exitCode = 1;
});
