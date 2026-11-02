-- PostgreSQL role-based access control demo
CREATE ROLE IF NOT EXISTS civic_app_read;
CREATE ROLE IF NOT EXISTS civic_app_write;

GRANT USAGE ON SCHEMA public TO civic_app_read, civic_app_write;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO civic_app_read;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO civic_app_write;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO civic_app_read, civic_app_write;

-- read-only role
CREATE ROLE IF NOT EXISTS civic_reporting;
GRANT USAGE ON SCHEMA public TO civic_reporting;
GRANT SELECT ON TABLE departments, categories, sla_rules, complaints, complaint_history, escalations, v_overdue_complaints, v_dept_performance TO civic_reporting;

-- example of revoking write access from a read-only account
REVOKE INSERT, UPDATE, DELETE ON TABLE complaints FROM civic_reporting;
