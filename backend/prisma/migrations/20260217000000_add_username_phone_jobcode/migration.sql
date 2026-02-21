-- Add username, phone, job_code to users; make email optional (login by username or email)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "job_code" TEXT;

-- Backfill username from email for existing users (use email to guarantee uniqueness)
UPDATE "users" SET "username" = "email" WHERE "username" IS NULL AND "email" IS NOT NULL;

-- Make email nullable
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- Unique constraint on username (PostgreSQL allows multiple NULLs)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_username_key" UNIQUE ("username");
  END IF;
END $$;
