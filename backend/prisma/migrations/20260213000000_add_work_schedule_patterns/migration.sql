-- AlterTable
ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "shift_pattern" TEXT;
ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "cycle_start_date" TIMESTAMP(3);
ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "effective_from" TIMESTAMP(3);
