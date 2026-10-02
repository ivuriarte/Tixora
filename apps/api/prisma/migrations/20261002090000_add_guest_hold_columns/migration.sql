-- Guest checkout hold deadline and unverified "pay later" contact.
-- ADDITIVE ONLY: two nullable columns (no default, no table rewrite) and one index.
-- No backfill: NULL hold_expires_at keeps the legacy 24-hour cleanup rule.
-- Rollback = revert the application code and leave these columns in place.
-- (The manual emergency removal script lives in the PR description, never here.)

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "guest_resume_email" TEXT,
ADD COLUMN     "hold_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "registrations_status_hold_expires_at_idx" ON "registrations"("status", "hold_expires_at");
