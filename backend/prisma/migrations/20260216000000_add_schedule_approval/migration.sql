-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('PENDING', 'APPROVED');

-- AlterTable
ALTER TABLE "work_schedules" ADD COLUMN "status" "ScheduleStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "approved_by_id" TEXT,
ADD COLUMN "approved_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
