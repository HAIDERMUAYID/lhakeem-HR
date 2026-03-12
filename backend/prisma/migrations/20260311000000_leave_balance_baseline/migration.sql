-- CreateTable: idempotent (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS "leave_balance_baselines" (
  "id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "leave_type_id" TEXT NOT NULL,
  "baseline_date" TIMESTAMP(3) NOT NULL,
  "baseline_balance" DECIMAL(10, 2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "leave_balance_baselines_pkey" PRIMARY KEY ("id")
);

-- Unique index: idempotent
CREATE UNIQUE INDEX IF NOT EXISTS "leave_balance_baselines_employee_id_leave_type_id_key"
  ON "leave_balance_baselines"("employee_id", "leave_type_id");

-- Add foreign keys only if they do not exist (avoids 42710 on re-run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_balance_baselines_employee_id_fkey') THEN
    ALTER TABLE "leave_balance_baselines"
      ADD CONSTRAINT "leave_balance_baselines_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_balance_baselines_leave_type_id_fkey') THEN
    ALTER TABLE "leave_balance_baselines"
      ADD CONSTRAINT "leave_balance_baselines_leave_type_id_fkey"
      FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
