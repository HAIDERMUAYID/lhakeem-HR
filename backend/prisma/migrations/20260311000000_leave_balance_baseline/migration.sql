CREATE TABLE IF NOT EXISTS "leave_balance_baselines" (
  "id" TEXT PRIMARY KEY,
  "employee_id" TEXT NOT NULL,
  "leave_type_id" TEXT NOT NULL,
  "baseline_date" TIMESTAMP NOT NULL,
  "baseline_balance" DECIMAL(10, 2) NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "leave_balance_baselines_employee_id_leave_type_id_key"
  ON "leave_balance_baselines"("employee_id", "leave_type_id");

ALTER TABLE "leave_balance_baselines"
  ADD CONSTRAINT "leave_balance_baselines_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leave_balance_baselines"
  ADD CONSTRAINT "leave_balance_baselines_leave_type_id_fkey"
  FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

