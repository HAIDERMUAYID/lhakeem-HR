ALTER TABLE "devices" ADD COLUMN "department_id" TEXT;

ALTER TABLE "devices"
  ADD CONSTRAINT "devices_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "devices_department_id_idx" ON "devices"("department_id");
