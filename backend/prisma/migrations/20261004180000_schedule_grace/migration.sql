ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "arrival_grace_minutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "departure_grace_minutes" INTEGER NOT NULL DEFAULT 30;
