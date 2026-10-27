# API contract

All endpoints are Next.js App Router Route Handlers. JSON request bodies use `Content-Type: application/json`; error responses have an `error` field. Authentication is a signed JWT in the `httpOnly`, `sameSite=lax` `token` cookie. Auth/account, department, and comment handlers resolve the current role and department from PostgreSQL, so a deleted or demoted user's cookie does not retain access to those APIs. Complaint and escalation handlers use the signed role claims in the cookie.

## Roles

| Role | Scope |
|---|---|
| Citizen | Register, submit complaints, see and comment on their own complaints |
| Officer | See complaints and escalations in their department, claim/update those complaints, and comment |
| Admin | Manage accounts, departments, categories, and SLA rules; view reports and trigger escalations |

## Authentication and accounts

| Method and path | Access | Behavior |
|---|---|---|
| `POST /api/auth/register` | Public | Create a citizen account and issue a session cookie |
| `POST /api/auth/login` | Public | Verify email/password and issue a session cookie |
| `POST /api/auth/logout` | Public | Expire the session cookie |
| `GET /api/auth/me` | Signed-in user | Return the current account and department |
| `GET /api/auth/users` | Admin | List accounts without password hashes |
| `POST /api/auth/users` | Admin | Create citizen/officer/admin account; officers require `dept_id` |
| `PATCH /api/auth/users/{userId}` | Admin | Update account fields; password is re-hashed |
| `DELETE /api/auth/users/{userId}` | Admin | Delete another account unless referenced or it is the last administrator |

Passwords must contain at least 8 characters and at most 72 UTF-8 bytes (the bcrypt input limit).

## Departments, categories, and SLAs

| Method and path | Access | Behavior |
|---|---|---|
| `GET /api/departments` | Public department list | List departments; `?report=performance` and `?report=overdue` require admin |
| `POST /api/departments` | Admin | Create a department |
| `PATCH /api/departments/{departmentId}` | Admin | Rename a department |
| `DELETE /api/departments/{departmentId}` | Admin | Delete an unused department; in-use/assigned departments return conflict |
| `GET /api/departments/categories` | Public | List categories with their department |
| `POST /api/departments/{departmentId}/categories` | Admin | Create a category |
| `PATCH /api/departments/categories/{categoryId}` | Admin | Rename a category |
| `DELETE /api/departments/categories/{categoryId}` | Admin | Delete an unreferenced category |
| `GET /api/departments/categories/{categoryId}/sla` | Public | List category SLA rules |
| `POST /api/departments/categories/{categoryId}/sla` | Admin | Create a rule with priority, resolution hours, and escalation hours |
| `PATCH /api/departments/categories/{categoryId}/sla?priority={current}` | Admin | Update the selected rule |
| `DELETE /api/departments/categories/{categoryId}/sla?priority={current}` | Admin | Delete the selected rule |

The database enforces unique department/category names, unique category-priority SLA rules, positive hour values, and `escalate_after_hours <= resolve_hours`.

## Comments

| Method and path | Access | Behavior |
|---|---|---|
| `GET /api/comments/{complaintId}` | Complaint owner, same-department officer, or admin | Return the comment thread |
| `GET /api/comments/{complaintId}?summary=true` | Same as above | MongoDB aggregation groups comments by user, counts them, and reports the latest comment time |
| `POST /api/comments/{complaintId}` | Same as above | Add a trimmed comment (`body`, 1-2000 characters) using the authenticated user's ID and current display name |

Complaint ownership, department, and comment author identity are resolved from PostgreSQL/session data, not caller-supplied values.

## Complaint and escalation workflows

| Method and path | Access | Behavior |
|---|---|---|
| `GET /api/complaints/categories` | Signed-in user | List categories for complaint submission |
| `GET /api/complaints` | Citizen / officer / admin | List own complaints / department complaints / all complaints |
| `POST /api/complaints` | Citizen | Store incident description in MongoDB and complaint/SLA data in PostgreSQL |
| `GET /api/complaints/me` | Signed-in user | Return the current account |
| `GET /api/complaints/{complaintId}` | Owner, same-department officer, or admin | Read complaint and linked incident |
| `PATCH /api/complaints/{complaintId}` | Same-department officer or admin | Set status or assign/claim through `sp_assign_complaint` |
| `GET /api/escalations` | Officer / admin | List department escalations / all escalations |
| `POST /api/escalations` | Admin | Run `fn_escalate_overdue()` |

## Storage shapes

PostgreSQL complaint rows link to MongoDB incident documents with `mongo_doc_id` (a Mongo `ObjectId` string). Incident documents currently contain `description`, optional `location`, and `created_at`. Comment documents contain `complaint_id`, `user_id`, `user_name`, `body`, and `created_at`. The MongoDB `comments` collection is created on first write.
