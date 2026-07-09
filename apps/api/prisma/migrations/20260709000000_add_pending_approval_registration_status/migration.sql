-- Migration: add_pending_approval_registration_status
-- Adds the `pending_approval` value to the RegistrationStatus enum.
-- `proof_submitted` is retained (PostgreSQL cannot drop enum values).
-- After deployment, the data migration below reclassifies existing rows.
--
-- Rollback (DML only — the enum value is permanent):
--   UPDATE registrations SET status = 'proof_submitted' WHERE status = 'pending_approval';
--   Then revert application code.
--
-- Run during low-traffic window; the UPDATE acquires row-level locks.
-- Batch if registrations table is large (UPDATE ... WHERE status = 'proof_submitted' LIMIT 1000).

-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'pending_approval';

-- DataMigration: reclassify existing proof_submitted rows
UPDATE registrations SET status = 'pending_approval' WHERE status = 'proof_submitted';
