# PROJECT_CONTEXT — Read this first

## Project
**Civic Complaint & Incident Tracking System with SLA-Based Escalation**
PES University, DBMS Experiential Learning Level 3 (Section AIML 5H, instructor Pooja Shastry).
Team of 2: Rohan Agarwal, Rolla N Harsha Vardhan.

Citizens file complaints about civic issues (roads, water, garbage, etc.). Each complaint gets an SLA deadline based on category and priority. If it isn't resolved in time, it is automatically escalated level by level (max level 3). Officers handle complaints for their department; admins manage departments, SLA rules and see dashboards.

## Course requirements (must all be met)
- Not a plain CRUD app; must show real DB concepts connected to a working web app.
- SQL (PostgreSQL) + NoSQL (MongoDB) — Option 1. Justify the split in the docs.
- ER diagram + relational schema; DDL (CREATE/ALTER/DROP), PK/FK, constraints, indexes, views.
- DML demo: INSERT/UPDATE/DELETE/SELECT, plus JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries.
- At least 4 advanced SQL features and 1 NoSQL feature (aggregation).
- Frontend: Next.js. Backend: Next.js Route Handlers.
- Credentials only via environment variables, never hard-coded.
- Authentication in the backend, at least 2 roles (we use citizen, officer, admin).
- Validation at the database level (CHECK, NOT NULL, FK, triggers).
- Both members contribute to DB and app; commits must show individual contributions.
- Documentation: objectives, functional requirements, ER diagram, relational schema, DB choice justification, data dictionary, implementation, important queries, architecture, screenshots, test results, conclusion.
- Git/GitHub with a README containing setup and run instructions.
- Optional: vector search (pgvector) — only if time remains.

## Stack
Next.js (App Router, TypeScript) · PostgreSQL · MongoDB · JWT auth (httpOnly cookie) · `pg` and `mongodb` drivers · Git + GitHub

## Database split (justification)
- **PostgreSQL** holds structured, relational, integrity-critical data: users, departments, categories, SLA rules, complaints, status history, escalations. Needs FKs, constraints, transactions, triggers, joins and aggregates.
- **MongoDB** holds flexible, text-heavy, variable-shape data: incident descriptions (with optional location, attachments metadata, tags) and comment threads. Stored in collections `incidents` and `comments`, linked to Postgres via `complaints.mongo_doc_id` (incident `_id`) and `complaint_id` in comment docs.

## SQL source of truth
`schema.sql` at the repository root is the current schema. Do not edit it casually. Schema changes must be agreed by both members and documented with the project. Never invent tables or columns that are not in the schema.

Schema summary: `departments`, `users` (role: citizen|officer|admin; officers must have dept_id), `categories` (belong to a department), `sla_rules` (category + priority -> resolve_hours, escalate_after_hours), `complaints` (status: open|assigned|in_progress|resolved|closed; priority: low|medium|high|critical; escalation_level 0–3; sla_deadline set by trigger), `complaint_history` (filled by trigger), `escalations`.
DB objects: triggers `trg_set_sla`, `trg_stamp_resolved`, `trg_log_status`; procedure `sp_assign_complaint(complaint_id, officer_id)`; function `fn_escalate_overdue()` (returns number escalated); views `v_overdue_complaints`, `v_dept_performance`; full-text index on `complaints.title_tsv`.

## Roles and access
- **citizen**: register/login, create complaints, view own complaints, comment on own complaints.
- **officer**: view and update complaints in own department, claim/assign, change status, comment.
- **admin**: everything, plus manage departments, categories, SLA rules, users; see dashboards and escalations.
Role checks must be enforced in the API (Route Handlers), not only hidden in the UI.

## Folder ownership
| Area | Rohan | Harsha |
|---|---|---|
| API routes | `app/api/complaints/*`, `app/api/escalations/*` | `app/api/auth/*`, `app/api/departments/*`, `app/api/comments/*` |
| Pages | `app/complaints/*`, `app/officer/*` | `app/login`, `app/register`, `app/admin/*` |
| SQL | complaints, history, escalations, SLA, triggers | users, departments, categories, views |
| Mongo | incident description docs | comment threads + aggregation |

Shared (write once, don't rewrite): `lib/db.ts` (Postgres pool), `lib/mongo.ts` (Mongo client), `lib/auth.ts` (`getSession(req)` returns `{ userId, role, deptId } | null`; `requireRole(req, roles)`), `.env.example`.

## Environment variables
`DATABASE_URL`, `MONGODB_URI`, `JWT_SECRET` — see `.env.example`. Never commit `.env`.

## Rules for any coding agent / LLM
1. Read `schema.sql` and `docs/api-contract.md` before writing code.
2. Use only the endpoints, tables and columns defined there. If something is missing, propose the change instead of silently inventing it.
3. Work on one route or page at a time, inside the owner's folders.
4. Use parameterized queries only (no string-built SQL).
5. Hash passwords (bcrypt); never log or return `password_hash`.
6. Validate input in the API, but rely on DB constraints as the final check.
7. Keep code simple and readable — both members must be able to explain it in the viva.
8. Do not touch the other member's folders without asking.

## Git workflow
`main` is protected. Branch per feature (`feat/complaints-api`, `feat/auth`), small commits under your own identity, open PRs and review each other's.

## Build phases
1. Schema (done) · 2. Seed data + Mongo layer · 3. API contract + `lib/` stubs · 4. Backend routes · 5. UI pages · 6. Docs (ER diagram, data dictionary, queries, test cases) + README · 7. Demo rehearsal
