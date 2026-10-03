ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employee_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_employee_id_key" ON "users"("employee_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_employee_id_fkey'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
