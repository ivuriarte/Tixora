-- DataMigration: reclassify manual payment registrations after the enum value exists.
-- Kept separate from the enum migration because PostgreSQL requires a commit
-- before a newly added enum value can be used in DML.

UPDATE registrations SET status = 'pending_approval' WHERE status = 'proof_submitted';
