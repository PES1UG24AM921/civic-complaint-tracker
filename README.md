# Civic Complaint & Incident Tracking System

This project is a Next.js application for civic complaint tracking with SLA-based escalation. It uses PostgreSQL for relational data and MongoDB for variable-shape incident metadata.

## Features
- Citizen complaint submission and tracking
- Officer department dashboard and assignment flow
- SLA-driven escalation logic for overdue complaints
- PostgreSQL schema with constraints, views, triggers, and stored procedures
- MongoDB-backed incident and comment documents

## Tech stack
- Next.js 14 (App Router)
- PostgreSQL
- MongoDB
- JWT authentication

## Setup (macOS, Linux, or Windows)
Requirements: Node.js 20 or later, PostgreSQL, and MongoDB (local or hosted).

1. Clone the repository and install dependencies:
   ```sh
   git clone https://github.com/PES1UG24AM921/civic-complaint-tracker.git
   cd civic-complaint-tracker
   npm install
   ```
2. Create the PostgreSQL database, then apply the schema:
   ```sh
   createdb civic_db
   psql "postgresql://localhost:5432/civic_db" -f schema.sql
   ```
3. Copy `.env.example` to `.env.local` and set `DATABASE_URL`, `MONGODB_URI`, and a strong `JWT_SECRET`.
4. Create the initial admin account (only allowed when no admin exists). The script loads `DATABASE_URL` from `.env.local`; set the admin details temporarily in your terminal:
   ```sh
   export ADMIN_NAME="Project Admin"
   export ADMIN_EMAIL="admin@example.com"
   read -s "ADMIN_PASSWORD?Initial admin password: "; export ADMIN_PASSWORD
   npm run create-admin
   unset ADMIN_NAME ADMIN_EMAIL ADMIN_PASSWORD
   ```
   Do not commit credentials or put them in source files.
5. Start the development server and visit `http://localhost:3000`:
   ```sh
   npm run dev
   ```

MongoDB creates the `comments` collection and database on first comment write. Comment documents are associated with complaint IDs from PostgreSQL.

## Verification

Run the production build:

```sh
npm run build
```

The integration suite creates and drops a uniquely named PostgreSQL database using the connection in `TEST_DATABASE_URL`; it never targets the normal application PostgreSQL database. The suite also writes temporary incident and comment documents to the configured MongoDB `civic_db`, checks that its reserved complaint-ID range is unused, and removes only those test documents. Use a disposable local MongoDB instance.

```sh
TEST_DATABASE_URL=postgresql://localhost:5432/postgres \
MONGODB_URI=mongodb://localhost:27017/civic_db \
npm run test:integration
```

See [the project report](./docs/project-report.md) for the ER diagram, data dictionary, database design rationale, sample queries, test scope, and demo walkthrough. See [the API contract](./docs/api-contract.md) for endpoint methods and role requirements.

## Harsha's application areas
- `/login`, `/register`, and `/admin` pages
- `/api/auth/*`, `/api/departments/*`, and `/api/comments/[complaintId]` routes
- Admin-only database changes are role-checked in the Route Handlers
- Comment summary uses MongoDB aggregation to group comments by author

## Project ownership
- Rohan: complaints API, escalations API, complaints pages, officer dashboard
- Harsha: auth, departments, comments, admin, registration pages

## Database note
The SQL schema is maintained in `schema.sql` and follows the project brief for relational integrity and escalation rules. The MongoDB layer is for flexible complaint detail documents and comment threads.
