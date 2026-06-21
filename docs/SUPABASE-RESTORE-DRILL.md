# Supabase Restore Drill — Phase 3

**Purpose:** Document and practice database restoration procedure before relying on backups.

**Frequency:** Before each major event. Estimated duration: 15 minutes.

**Note:** This creates a temporary project. Delete it immediately after the drill to avoid ongoing costs.

---

## Pre-Drill Checklist

- [ ] You have Supabase Admin access
- [ ] You have Pro plan (required for PITR/restoration)
- [ ] No active users in UAT (drill creates temporary backup)
- [ ] ~10 minutes available for drill

---

## Step 1: Create a Restore Target Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **"New project"**
3. Fill in:
   - **Name:** `tixora-restore-drill-[DATE]`
   - **Database password:** Generate and save temporarily
   - **Region:** Same as production (ap-northeast-1)
   - **Plan:** Pro (required for restoration)
4. Click **"Create new project"**
5. Wait for initialization (~2 minutes)
6. **Copy the new project reference ID** (you'll need it in step 4)

---

## Step 2: Navigate to Backups

1. In your **Production** Supabase project (nwzfiftzubjppoitmzjs)
2. Go to **Settings → Database → Backups**
3. You should see daily physical backups (Supabase Pro keeps 7 days)
4. Look for the most recent backup (usually "24 hours ago")
5. **Note the backup timestamp**

---

## Step 3: Initiate Restore

1. Click the backup you want to restore
2. Click **"Restore"** button
3. A dialog appears asking: **"Restore to a new project?"**
4. Select **"Yes, restore to a new project"**
5. Paste the **target project reference ID** from Step 1
6. Confirm: **"Yes, restore to [project-name]"**
7. Status: `Restoring...` (takes 2–5 minutes depending on database size)

---

## Step 4: Verify Restore Integrity

Once the restore completes:

1. Go to the **new restored project** dashboard
2. Go to **SQL Editor**
3. Run this query to verify data:
   ```sql
   SELECT 
     (SELECT COUNT(*) FROM users) as user_count,
     (SELECT COUNT(*) FROM events) as event_count,
     (SELECT COUNT(*) FROM registrations) as registration_count,
     (SELECT COUNT(*) FROM "Attendee") as attendee_count;
   ```
4. Compare counts with **original database** (check production project)
   - Expected: Exact match for schema + most data
   - Note: Does NOT include Cloudinary images (stored separately)

5. Verify indexes exist:
   ```sql
   SELECT indexname FROM pg_indexes WHERE schemaname = 'public' LIMIT 20;
   ```
   - Should see custom indexes from migrations (registrations_tier_id_status, etc.)

**Expected outcome:** Data matches, indexes present, schema intact.

---

## Step 5: Test Connection & Migrations

1. Get the restored project's connection strings:
   - Settings → Database → Connection Pooling
   - Copy Pooler URL (port 6543) and Direct URL (port 5432)

2. In local terminal:
   ```bash
   export DIRECT_URL="[paste direct URL from restored project]"
   export DATABASE_URL="[paste pooler URL from restored project]"
   
   cd apps/api
   npx prisma db push --skip-generate
   ```
   - Expected: `Your database is now in sync with your schema.` (no changes needed)

3. Verify Prisma can connect:
   ```bash
   npx prisma studio
   ```
   - Expected: Opens Studio dashboard, shows tables + data

---

## Step 6: Document & Clean Up

1. **Record the drill:**
   - Date: [Today]
   - Backup timestamp: [When was the backup taken?]
   - Restore time: [How long did it take?]
   - Data integrity: ✓ PASS / ✗ FAIL
   - Issues: [Any problems? Note them]

2. **Delete the restore target project** to avoid ongoing costs:
   - Go to restored project → Settings → Danger Zone
   - Click **"Delete project"**
   - Confirm deletion

3. **Append to this document:**
   ```markdown
   ### Drill on [DATE]
   - Backup: [timestamp]
   - Duration: [X minutes]
   - Status: PASS ✓
   - Issues: [None / list any]
   ```

---

## Troubleshooting

### "Restore failed" error
- Check that the target project exists and is empty
- Verify target project region matches source
- Check Supabase status page for ongoing incidents

### Data count mismatch
- Restore may have excluded some tables (check Supabase logs)
- This is OK for a drill — important tables (users, registrations) should match
- If critical tables missing: escalate to Supabase support

### Connection refused after restore
- Wait 1–2 minutes (database may still be initializing)
- Verify connection strings are correct (copy again from restored project)
- Check network access (firewall / VPN)

---

## Sign-Off

This drill should be completed **before every major event**.

**Drill conducted:**
- [ ] Date: [DATE]
- [ ] Conducted by: [NAME]
- [ ] Data verified: ✓
- [ ] Issues: None / [list]
- [ ] Approved for production reliance: Yes / No

If "No," investigate issues before relying on backups for production.

---

## One-Liners for Cron/Automation

If you want to automate restore drills via GitHub Actions:

```bash
# List available backups
curl -s "https://api.supabase.com/v1/projects/[PROJECT_ID]/backups" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq '.backups'

# Trigger restore (requires Supabase API setup)
# See: https://supabase.com/docs/guides/platform/backups#restore-via-api
```

---

## Additional Resources

- [Supabase Backups Guide](https://supabase.com/docs/guides/platform/backups)
- [Physical Backups vs PITR](https://supabase.com/docs/guides/platform/backups#physical-backups)
- [Restore via API](https://supabase.com/docs/guides/platform/backups#restore-via-api)
