CREATE SCHEMA IF NOT EXISTS payroll;

CREATE TABLE IF NOT EXISTS billing.journal_lines (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  source_id uuid NOT NULL,
  account text NOT NULL,
  debit numeric(12,2) NOT NULL DEFAULT 0,
  credit numeric(12,2) NOT NULL DEFAULT 0,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll.runs (
  id uuid PRIMARY KEY,
  period text NOT NULL,
  status text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll.lines (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES payroll.runs(id),
  user_id uuid NOT NULL,
  gross numeric(12,2) NOT NULL,
  deduction numeric(12,2) NOT NULL,
  net numeric(12,2) NOT NULL
);

ALTER TABLE coordination.transfers ADD COLUMN IF NOT EXISTS handover jsonb;

CREATE TABLE IF NOT EXISTS identity.acceptance_runs (
  id uuid PRIMARY KEY,
  created_by uuid,
  passed integer NOT NULL,
  failed integer NOT NULL,
  results jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
