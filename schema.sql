-- Civic Complaint & Incident Tracking System with SLA-Based Escalation
-- PostgreSQL schema: DDL, constraints, indexes, triggers, functions, views

CREATE TABLE departments (
  dept_id   SERIAL PRIMARY KEY,
  name      VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE users (
  user_id       SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL CHECK (role IN ('citizen','officer','admin')),
  dept_id       INT REFERENCES departments(dept_id) ON DELETE SET NULL,
  CHECK (role <> 'officer' OR dept_id IS NOT NULL)
);

CREATE TABLE categories (
  category_id SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  dept_id     INT NOT NULL REFERENCES departments(dept_id)
);

CREATE TABLE sla_rules (
  rule_id              SERIAL PRIMARY KEY,
  category_id          INT NOT NULL REFERENCES categories(category_id) ON DELETE CASCADE,
  priority             VARCHAR(8) NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  resolve_hours        INT NOT NULL CHECK (resolve_hours > 0),
  escalate_after_hours INT NOT NULL CHECK (escalate_after_hours > 0),
  UNIQUE (category_id, priority),
  CHECK (escalate_after_hours <= resolve_hours)
);

CREATE TABLE complaints (
  complaint_id        SERIAL PRIMARY KEY,
  citizen_id          INT NOT NULL REFERENCES users(user_id),
  category_id         INT NOT NULL REFERENCES categories(category_id),
  title               VARCHAR(200) NOT NULL CHECK (length(trim(title)) >= 5),
  mongo_doc_id        VARCHAR(24),                 -- link to MongoDB incident document
  priority            VARCHAR(8) NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('low','medium','high','critical')),
  status              VARCHAR(12) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','assigned','in_progress','resolved','closed')),
  assigned_officer_id INT REFERENCES users(user_id),
  escalation_level    INT NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 3),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sla_deadline        TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  title_tsv           TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', title)) STORED,
  CHECK (status NOT IN ('resolved','closed') OR resolved_at IS NOT NULL)
);

CREATE TABLE complaint_history (
  history_id   SERIAL PRIMARY KEY,
  complaint_id INT NOT NULL REFERENCES complaints(complaint_id) ON DELETE CASCADE,
  old_status   VARCHAR(12),
  new_status   VARCHAR(12) NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE escalations (
  escalation_id SERIAL PRIMARY KEY,
  complaint_id  INT NOT NULL REFERENCES complaints(complaint_id) ON DELETE CASCADE,
  from_level    INT NOT NULL,
  to_level      INT NOT NULL,
  escalated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (to_level = from_level + 1)
);

-- Indexes
CREATE INDEX idx_complaints_status_deadline ON complaints (status, sla_deadline);
CREATE INDEX idx_complaints_officer ON complaints (assigned_officer_id);
CREATE INDEX idx_complaints_title_fts ON complaints USING GIN (title_tsv);

-- Trigger 1: compute SLA deadline on insert
CREATE FUNCTION fn_set_sla() RETURNS TRIGGER AS $$
DECLARE hrs INT;
BEGIN
  SELECT resolve_hours INTO hrs FROM sla_rules
   WHERE category_id = NEW.category_id AND priority = NEW.priority;
  IF hrs IS NULL THEN hrs := 72; END IF;   -- default SLA
  NEW.sla_deadline := NEW.created_at + make_interval(hours => hrs);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_sla BEFORE INSERT ON complaints
FOR EACH ROW EXECUTE FUNCTION fn_set_sla();

-- Trigger 2: stamp resolved_at, then log every status change
CREATE FUNCTION fn_stamp_resolved() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('resolved','closed') AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stamp_resolved BEFORE UPDATE OF status ON complaints
FOR EACH ROW EXECUTE FUNCTION fn_stamp_resolved();

CREATE FUNCTION fn_log_status() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO complaint_history (complaint_id, old_status, new_status)
    VALUES (NEW.complaint_id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_status AFTER UPDATE OF status ON complaints
FOR EACH ROW EXECUTE FUNCTION fn_log_status();

-- Procedure (transaction): assign a complaint to an officer of the right department
CREATE PROCEDURE sp_assign_complaint(p_complaint INT, p_officer INT)
LANGUAGE plpgsql AS $$
DECLARE c_dept INT; o_dept INT;
BEGIN
  SELECT cat.dept_id INTO c_dept FROM complaints c
    JOIN categories cat ON cat.category_id = c.category_id
   WHERE c.complaint_id = p_complaint FOR UPDATE OF c;
  SELECT dept_id INTO o_dept FROM users WHERE user_id = p_officer AND role = 'officer';
  IF c_dept IS NULL OR o_dept IS DISTINCT FROM c_dept THEN
    RAISE EXCEPTION 'Officer does not belong to the complaint''s department';
  END IF;
  UPDATE complaints SET assigned_officer_id = p_officer, status = 'assigned'
   WHERE complaint_id = p_complaint AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Complaint is not open'; END IF;
END $$;

-- Function: escalate every overdue, unresolved complaint by one level
-- (call from a scheduled job; runs atomically as one statement block)
CREATE FUNCTION fn_escalate_overdue() RETURNS INT AS $$
DECLARE n INT;
BEGIN
  WITH due AS (
    SELECT c.complaint_id, c.escalation_level AS lvl
      FROM complaints c
      JOIN sla_rules r ON r.category_id = c.category_id AND r.priority = c.priority
     WHERE c.status NOT IN ('resolved','closed')
       AND c.escalation_level < 3
       AND now() > c.created_at + make_interval(hours => r.escalate_after_hours * (c.escalation_level + 1))
     FOR UPDATE OF c
  ), upd AS (
    UPDATE complaints c SET escalation_level = d.lvl + 1
      FROM due d WHERE c.complaint_id = d.complaint_id
    RETURNING c.complaint_id, d.lvl
  )
  INSERT INTO escalations (complaint_id, from_level, to_level)
  SELECT complaint_id, lvl, lvl + 1 FROM upd;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$ LANGUAGE plpgsql;

-- Views
CREATE VIEW v_overdue_complaints AS
SELECT c.complaint_id, c.title, c.priority, c.status, c.escalation_level,
       c.sla_deadline, d.name AS department, u.name AS officer
  FROM complaints c
  JOIN categories cat ON cat.category_id = c.category_id
  JOIN departments d ON d.dept_id = cat.dept_id
  LEFT JOIN users u ON u.user_id = c.assigned_officer_id
 WHERE c.status NOT IN ('resolved','closed') AND c.sla_deadline < now();

CREATE VIEW v_dept_performance AS
SELECT d.name AS department,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE c.resolved_at IS NOT NULL AND c.resolved_at <= c.sla_deadline) AS within_sla,
       ROUND(AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 3600)::numeric, 1) AS avg_resolution_hrs
  FROM complaints c
  JOIN categories cat ON cat.category_id = c.category_id
  JOIN departments d ON d.dept_id = cat.dept_id
 GROUP BY d.name;
