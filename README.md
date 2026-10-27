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

## Setup
1. Copy `.env.example` to `.env.local` and set your variables.
2. Install dependencies:
   npm install
3. Run the app:
   npm run dev
4. Visit `http://localhost:3000`

## Project ownership
- Rohan: complaints API, escalations API, complaints pages, officer dashboard
- Harsha: auth, departments, comments, admin, registration pages

## Database note
The SQL schema is maintained in `schema.sql` and follows the project brief for relational integrity and escalation rules. The MongoDB layer is for flexible complaint detail documents and comment threads.
