-- Migration: reconcile schema drift + make name fields optional
-- Reconciles the `transferable` column that was added directly to DB (drift),
-- and makes first_name / last_name nullable to support OTP stub-user creation.

-- 1. Attendees — add transferable column (idempotent; column may already exist)
ALTER TABLE "attendees" ADD COLUMN IF NOT EXISTS "transferable" BOOLEAN NOT NULL DEFAULT false;

-- 2. Users — make first_name and last_name nullable (stub users created via OTP flow have no name yet)
ALTER TABLE "users" ALTER COLUMN "first_name" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "last_name" DROP NOT NULL;
