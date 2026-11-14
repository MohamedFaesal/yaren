CREATE TABLE IF NOT EXISTS visit_number_years (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE patient_visits ADD COLUMN IF NOT EXISTS visit_number text;

WITH numbered AS (
  SELECT
    id,
    'YV-' || to_char(created_at AT TIME ZONE 'UTC', 'YYYY') || '-' ||
      lpad(
        row_number() OVER (
          PARTITION BY date_part('year', created_at AT TIME ZONE 'UTC')
          ORDER BY created_at, id
        )::text,
        6,
        '0'
      ) AS visit_number
  FROM patient_visits
  WHERE visit_number IS NULL
)
UPDATE patient_visits AS v
SET visit_number = numbered.visit_number
FROM numbered
WHERE v.id = numbered.id;

ALTER TABLE patient_visits ALTER COLUMN visit_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS patient_visits_visit_number_unique ON patient_visits (visit_number);

INSERT INTO visit_number_years (year, last_number)
SELECT
  substring(visit_number FROM 4 FOR 4)::integer,
  max(substring(visit_number FROM 9)::integer)
FROM patient_visits
GROUP BY 1
ON CONFLICT (year) DO UPDATE
SET last_number = GREATEST(visit_number_years.last_number, EXCLUDED.last_number);
