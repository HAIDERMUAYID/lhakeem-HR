-- Create enum for leave balance strategy
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeaveBalanceStrategy') THEN
    CREATE TYPE "LeaveBalanceStrategy" AS ENUM ('CUMULATIVE_SHARED', 'FIXED_ANNUAL_RESET', 'NO_BALANCE');
  END IF;
END $$;

-- Add strategy and group columns to leave_types
ALTER TABLE "leave_types"
  ADD COLUMN IF NOT EXISTS "balance_strategy" "LeaveBalanceStrategy" NOT NULL DEFAULT 'CUMULATIVE_SHARED',
  ADD COLUMN IF NOT EXISTS "balance_group_id" TEXT;

