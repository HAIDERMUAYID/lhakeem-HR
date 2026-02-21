-- Drop unique constraint on employee_id
DROP INDEX IF EXISTS "work_schedules_employee_id_key";

-- Add year and month columns (nullable first)
ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "year" INTEGER;
ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "month" INTEGER;

-- Set year/month for existing rows to current date
UPDATE "work_schedules" SET
  "year" = EXTRACT(YEAR FROM CURRENT_DATE)::integer,
  "month" = EXTRACT(MONTH FROM CURRENT_DATE)::integer
WHERE "year" IS NULL OR "month" IS NULL;

-- Make columns NOT NULL
ALTER TABLE "work_schedules" ALTER COLUMN "year" SET NOT NULL;
ALTER TABLE "work_schedules" ALTER COLUMN "month" SET NOT NULL;

-- Add unique constraint on (employee_id, year, month)
CREATE UNIQUE INDEX IF NOT EXISTS "work_schedules_employee_id_year_month_key"
ON "work_schedules"("employee_id", "year", "month");
