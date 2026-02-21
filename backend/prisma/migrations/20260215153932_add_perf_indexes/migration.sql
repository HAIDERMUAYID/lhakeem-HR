-- DropForeignKey
ALTER TABLE "work_schedules" DROP CONSTRAINT "work_schedules_employee_id_fkey";

-- AlterTable
ALTER TABLE "leave_requests" ALTER COLUMN "hours_count" SET DATA TYPE DECIMAL(65,30);

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- (RenameIndex skipped: indexes are created in a later migration 20260219000000)
