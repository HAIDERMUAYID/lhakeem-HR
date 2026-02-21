-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "hours_count" DECIMAL(10,2);
