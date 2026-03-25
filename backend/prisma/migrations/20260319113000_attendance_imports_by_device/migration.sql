-- Attendance import batches per fingerprint device
CREATE TABLE "attendance_import_batches" (
  "id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "uploaded_by_id" TEXT,
  "file_name" TEXT NOT NULL,
  "rows_total" INTEGER NOT NULL DEFAULT 0,
  "rows_parsed" INTEGER NOT NULL DEFAULT 0,
  "rows_accepted" INTEGER NOT NULL DEFAULT 0,
  "rows_rejected" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_import_raw_logs" (
  "id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "device_employee_code" TEXT NOT NULL,
  "scanned_at" TIMESTAMP(3) NOT NULL,
  "row_number" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_import_raw_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_daily_records" (
  "id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "work_date" TIMESTAMP(3) NOT NULL,
  "check_in_at" TIMESTAMP(3) NOT NULL,
  "check_out_at" TIMESTAMP(3) NOT NULL,
  "worked_minutes" INTEGER NOT NULL,
  "is_valid" BOOLEAN NOT NULL DEFAULT true,
  "validation_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_daily_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_import_batches_device_id_created_at_idx" ON "attendance_import_batches"("device_id", "created_at");
CREATE INDEX "attendance_import_raw_logs_batch_id_idx" ON "attendance_import_raw_logs"("batch_id");
CREATE INDEX "attendance_import_raw_logs_device_id_device_employee_code_scanned_at_idx" ON "attendance_import_raw_logs"("device_id", "device_employee_code", "scanned_at");
CREATE INDEX "attendance_daily_records_batch_id_idx" ON "attendance_daily_records"("batch_id");
CREATE INDEX "attendance_daily_records_device_id_work_date_employee_id_idx" ON "attendance_daily_records"("device_id", "work_date", "employee_id");

ALTER TABLE "attendance_import_batches"
  ADD CONSTRAINT "attendance_import_batches_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_import_batches"
  ADD CONSTRAINT "attendance_import_batches_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_import_raw_logs"
  ADD CONSTRAINT "attendance_import_raw_logs_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "attendance_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_import_raw_logs"
  ADD CONSTRAINT "attendance_import_raw_logs_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_daily_records"
  ADD CONSTRAINT "attendance_daily_records_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "attendance_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_daily_records"
  ADD CONSTRAINT "attendance_daily_records_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_daily_records"
  ADD CONSTRAINT "attendance_daily_records_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
