-- Add the new roles without replacing the existing enum. The legacy `admin`
-- value remains readable so the migration is backwards-compatible with the
-- currently deployed API; application responses normalize it to `manager`.
ALTER TYPE "OrgMemberRole" ADD VALUE IF NOT EXISTS 'co_owner';
ALTER TYPE "OrgMemberRole" ADD VALUE IF NOT EXISTS 'manager';

CREATE TYPE "OrgInvitationStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE "organization_invitations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "OrgMemberRole" NOT NULL,
  "status" "OrgInvitationStatus" NOT NULL DEFAULT 'pending',
  "invited_by_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_invitations_organization_id_email_key"
  ON "organization_invitations"("organization_id", "email");
CREATE INDEX "organization_invitations_email_status_idx"
  ON "organization_invitations"("email", "status");
CREATE INDEX "organization_invitations_organization_id_status_idx"
  ON "organization_invitations"("organization_id", "status");

ALTER TABLE "organization_invitations"
  ADD CONSTRAINT "organization_invitations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_invitations"
  ADD CONSTRAINT "organization_invitations_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_invitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organization_invitations_service_role_all"
  ON "organization_invitations"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE "workspace_items" ADD COLUMN "description" TEXT;

CREATE TABLE "workspace_task_updates" (
  "id" TEXT NOT NULL,
  "workspace_item_id" TEXT NOT NULL,
  "author_user_id" TEXT NOT NULL,
  "message" TEXT,
  "previous_status" "ChecklistStatus",
  "next_status" "ChecklistStatus",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_task_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_task_updates_workspace_item_id_created_at_idx"
  ON "workspace_task_updates"("workspace_item_id", "created_at");
CREATE INDEX "workspace_task_updates_author_user_id_created_at_idx"
  ON "workspace_task_updates"("author_user_id", "created_at");

ALTER TABLE "workspace_task_updates"
  ADD CONSTRAINT "workspace_task_updates_workspace_item_id_fkey"
  FOREIGN KEY ("workspace_item_id") REFERENCES "workspace_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_task_updates"
  ADD CONSTRAINT "workspace_task_updates_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_task_updates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_task_updates_service_role_all"
  ON "workspace_task_updates"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
