-- Fix: add password_hash to users when DB was created by another project (e.g. hospital)
-- Safe to run: adds column only if missing; existing rows get a placeholder hash (cannot login until seed or reset).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;

-- Set placeholder for any NULLs (e.g. column just added); then enforce NOT NULL
UPDATE "users" SET "password_hash" = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
WHERE "password_hash" IS NULL;

ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;
