# UAT Acceptance Scenarios — Phase 7

**Purpose:** 10 manual test scenarios covering every critical user journey and system behavior.

**Run these in order.** Each scenario is self-contained but builds on previous setup.

**Environment:** `https://uat.axontickets.online` | API: `https://api-uat.axontickets.online`

---

## UAT-01: Solo Attendee End-to-End Registration

**Objective:** Complete registration → proof upload → admin approval → QR email → check-in.

**Steps:**

1. Open `uat.axontickets.online` → Find a single-ticket tier event
2. Click **"Register"** → Select quantity 1
3. Enter attendee details (name, email, phone)
4. Complete OTP verification (check UAT email inbox)
5. Upload payment proof (screenshot of bank transfer / GCash)
6. Submit → Should see "Proof submitted" confirmation
7. Go to `/admin` → Log in (use seeded admin from .env)
8. Find the registration → Click **"Verify"** → Upload proof in VerificationDrawer
9. Click **"Approve"** → Should see "Approved" status + green checkmark
10. Check email for QR ticket (should arrive in allowlisted email)
11. Copy QR code → Go to `/admin/checkin`
12. Scan QR → Should show attendee name + "Checked in successfully"

**Expected Outcome:** ✅ Attendee journey complete, audit trail recorded, zero errors.

**Verify:**
- [ ] Registration created with correct tier + status
- [ ] Proof uploaded to Cloudinary (`axon-tickets/uat/...` folder)
- [ ] Approval audit log shows admin name + timestamp
- [ ] QR token is valid (non-production boundary)
- [ ] Check-in response shows correct attendee name

---

## UAT-02: Group Registration (Bundle) with Caps & Non-Transferable Tickets

**Objective:** Verify bundle caps, per-attendee non-transferable tickets, and group receipt policy.

**Steps:**

1. Open event with group/bundle tier (qty ≥ 5)
2. Click **"Register"** → Select quantity **8**
3. Before proceeding, verify amber **"Group Receipt Policy"** banner appears
   - Should list: Single receipt, all names visible, non-transferable
4. Enter buyer details + 8 attendee names/emails
5. Complete checkout
6. In admin, verify:
   - 8 `Attendee` records created, all with `transferable = false`
   - Single `Registration` with qty = 8
   - User's total attendees for this event = 8 (enforced cap)
7. Try registering again as same user for same tier → Should hit cap error (409)
8. Create new attendee user → Verify they can register (cap is per-user, not per-order)

**Expected Outcome:** ✅ Bundle caps work, non-transferable tickets created, policy notice shown.

**Verify:**
- [ ] 8 attendees created with `transferable=false`
- [ ] Cap check returns 409 on second registration
- [ ] Group receipt policy banner appears on checkout pages
- [ ] Audit log shows all 8 attendees

---

## UAT-03: Proof Rejection & Re-Upload

**Objective:** Verify admin can reject proofs, user receives email, and re-upload works.

**Steps:**

1. Create a registration (from UAT-01 or earlier)
2. Upload initial proof → Admin sees it in dashboard
3. Admin clicks **"Reject"** → Adds reason in drawer
4. Attendee receives **rejection email** (check allowlist inbox)
5. Attendee clicks link → Re-uploads new proof
6. Admin approves → Approval email sent, registration marked approved

**Expected Outcome:** ✅ Rejection email sent, re-upload works, audit shows both attempts.

**Verify:**
- [ ] Rejection email received with reason
- [ ] Re-upload form accessible and working
- [ ] Audit log shows: rejected → re-uploaded → approved
- [ ] Proof versions tracked correctly

---

## UAT-04: Three Simultaneous Admin Reviewers

**Objective:** Verify concurrent admin approvals don't conflict and audit attribution works.

**Setup:** Create 2 additional admin accounts first
- Go to `/admin/users` → Find 2 test users → Click "Make Admin" on each
- They must log out/in to get admin JWT claim refresh (⚠️ 15-min window)

**Steps:**

1. Create 3 separate registrations with proofs ready
2. Have Admin-A, Admin-B, Admin-C simultaneously:
   - Admin-A approves registration #1
   - Admin-B approves registration #2
   - Admin-C rejects registration #3
3. Check audit logs:
   - Each approval shows correct admin name
   - No conflicts, all rows updated correctly
   - Timestamps reflect concurrent execution

**Expected Outcome:** ✅ Concurrent approvals work without data corruption, audit trails match.

**Verify:**
- [ ] All 3 operations completed successfully
- [ ] Audit log shows 3 different admin emails
- [ ] No "locked row" or race condition errors
- [ ] Final status is correct for each registration

---

## UAT-05: Three-Device Event-Day Check-In Simulation

**Objective:** Simulate event-day with 3 concurrent check-in devices, test duplicate scan handling.

**Setup:**
- Create 10+ registrations with approved QRs
- Open `/admin/checkin` in 3 separate browsers

**Steps:**

1. **Device 1:** Scan QR for Attendee A → "Checked in successfully"
2. **Device 2 (concurrent):** Scan QR for Attendee B → "Checked in successfully"
3. **Device 1:** Scan Attendee A's QR again (duplicate) → Should show:
   - ❌ "Already checked in" or "Invalid" (not accepted twice)
4. **Device 3:** Use **Search tab** (not QR) → Look up "Attendee A" by name
   - Should show as "Checked In" with timestamp
5. Verify `/api/v1/admin/events/{eventId}/checkins` shows:
   - Attendee A: 1 check-in (not 2, even though scanned twice)
   - Attendee B: 1 check-in

**Expected Outcome:** ✅ Atomicity enforced, no duplicate successful scans, search works.

**Verify:**
- [ ] Duplicate scan rejected (HTTP 409 or "Already checked in")
- [ ] Audit log shows 1 check-in per attendee
- [ ] Search returns checked-in attendees
- [ ] No data corruption under concurrent load

---

## UAT-06: Sold-Out / Race Test — Concurrent Registration

**Objective:** Verify inventory cannot be oversold even with concurrent registrations.

**Setup:**
- Create event with tier that has capacity = 5
- Have 5 attendees ready to register simultaneously

**Steps:**

1. Open registration page in 5 separate browser tabs
2. Each user selects quantity 1 and proceeds to checkout
3. User 1: Submits → Success, tier now shows 4 remaining
4. Users 2–5: All submit within ~500ms of each other
   - Expected: Users 2–5 register successfully (4 spots left for 4 users)
   - Tier now shows 0 remaining
5. User 6 (new browser): Tries to register 1 → Gets **409 Conflict** (sold out)
   - Error message: "This tier is sold out"

**Expected Outcome:** ✅ No oversells, inventory accurate under concurrent load.

**Verify:**
- [ ] 5 registrations succeed, tier shows 0 remaining
- [ ] User 6 gets 409, not accepted
- [ ] Audit shows 5 successful, 1 rejected
- [ ] Redis inventory counter matches DB

---

## UAT-07: Failure Rehearsal — Graceful Degradation

**Objective:** Verify system degrades gracefully when external services fail.

**Test Scenarios:**

### A. Redis Unavailable
1. Temporarily disable Redis connection in API (or restart Redis)
2. Try registering → Should still work (DB is source of truth)
3. Check-in lookup → May be slower (no cache), but still works
4. Expected: No registration loss, just degraded performance

### B. Email Unavailable
1. Temporarily disable SMTP (change credentials to invalid)
2. Register attendee → Registration succeeds, but email queued/failed
3. Admin approves → Should not block (email is async)
4. Expected: Registration complete, email delivery error logged (not blocking)

### C. Cloudinary Unavailable
1. Temporarily disable Cloudinary (change API key to invalid)
2. Try uploading proof → Should get clear error: "Upload failed"
3. Attendee can retry
4. Expected: Error message is user-friendly, registration can continue

### D. Database Slow Response
1. In Supabase, set statement timeout to 500ms
2. Try loading admin → Pages might timeout/error
3. Expected: Timeout error, not hung request

**Expected Outcome:** ✅ Graceful degradation, no cascade failures, errors logged to Sentry.

**Verify:**
- [ ] Redis failure: registrations still work
- [ ] Email failure: email logs show error but don't block
- [ ] Cloudinary failure: user sees clear error message
- [ ] DB timeout: proper error response (not 504 hanging)

---

## UAT-08: Data Isolation — No UAT Data in Production

**Objective:** Verify complete isolation, zero data leakage between UAT and Production.

**Steps:**

1. **Create test data in UAT:**
   - Register user: `test-uat-user@example.com`
   - Create registration + proof + approval
   - Check in some attendees

2. **Check UAT database:**
   ```bash
   # Connect to UAT Supabase directly
   psql 'postgresql://postgres:[PASSWORD]@eiansrxggrvwzikpqhmt.pooler.supabase.com:6543/postgres'
   SELECT COUNT(*) FROM users WHERE email LIKE '%test-uat%';
   # Expected: 1 row
   ```

3. **Check Production database:**
   ```bash
   # Connect to Production Supabase
   psql 'postgresql://postgres:[PASSWORD]@nwzfiftzubjppoitmzjs.pooler.supabase.com:6543/postgres'
   SELECT COUNT(*) FROM users WHERE email LIKE '%test-uat%';
   # Expected: 0 rows
   ```

4. **Check Redis:**
   - UAT Redis keys: Should have `axon:uat:*` prefixes
   - Production Redis keys: Should NOT have test data

5. **Check Cloudinary:**
   - UAT uploads: In `axon-tickets/uat/` folder
   - Production uploads: In `axon-tickets/prod/` folder
   - Expected: Separate folders, zero cross-pollution

6. **Check email logs:**
   - UAT emails: Sent to `SMTP_ALLOWLIST` (ivvuriarte@gmail.com)
   - Production emails: Sent to real attendee addresses

7. **Check Sentry:**
   - UAT errors tagged with `environment=uat`
   - Production errors tagged with `environment=production`
   - Expected: Separate feeds, no mixing

**Expected Outcome:** ✅ Complete data isolation, zero leakage, separate credentials throughout.

**Verify:**
- [ ] UAT users not in production DB
- [ ] UAT emails only to allowlist
- [ ] UAT uploads in uat/ folder
- [ ] UAT errors in separate Sentry environment

---

## UAT-09: UAT Reset & Reseed Test

**Objective:** Verify UAT can be fully reset without manual intervention.

**Steps:**

1. Run reset command:
   ```bash
   cd apps/api
   npm run db:reset:uat
   ```
   - Should truncate all tables
   - Should re-run migrations
   - Should reseed deterministic test data

2. Verify fresh data:
   - Admin account (from SEED_ADMIN_EMAIL) exists with temp password
   - 2 events seeded
   - 6 registrations in various statuses
   - 2 payment proofs
   - QR codes generated

3. Run smoke tests:
   ```bash
   cd apps/web
   npm run test -- --project=chromium --grep @smoke
   ```

**Expected Outcome:** ✅ UAT resets cleanly, smoke tests pass, no manual DB repair needed.

**Verify:**
- [ ] `db:reset:uat` completes without errors
- [ ] Fresh admin account created
- [ ] 2 events seeded
- [ ] All smoke tests pass

---

## UAT-10: Stakeholder Review (Mobile & Desktop)

**Objective:** Formal UAT approval by non-technical stakeholder.

**Scenario:**

1. **Desktop Review:**
   - QA tester opens `uat.axontickets.online` on laptop (Chrome)
   - Reviews: Registration, checkout, payment proof upload, admin dashboard
   - Checks: UI is clear, forms are responsive, no obvious errors
   - **Sign-off:** Product Owner / Event Organizer approves on desktop

2. **Mobile Review:**
   - Same QA tester opens `uat.axontickets.online` on iPhone/Android
   - Goes through registration flow on mobile
   - Verifies: Mobile QR scanner works, forms are mobile-friendly
   - **Sign-off:** Product Owner approves on mobile

3. **Fill UAT Sign-Off Record:**
   - Document: Date, tester name, build SHA
   - Mark all scenarios (UAT-01 through UAT-09) as PASS/FAIL
   - List any blockers or issues
   - Stakeholder approves and signs off

**Expected Outcome:** ✅ Stakeholder approves UAT, documented sign-off filed.

**Verify:**
- [ ] Desktop testing complete, approved
- [ ] Mobile testing complete, approved
- [ ] Sign-off record filled and signed
- [ ] Ready for production promotion

---

## Quick Test Checklist

Copy and paste for your testing session:

```
UAT Testing Session: [DATE]
Tester: [NAME]

- [ ] UAT-01: Solo end-to-end (register → proof → approval → QR → check-in)
- [ ] UAT-02: Group bundle (caps, non-transferable, policy notice)
- [ ] UAT-03: Proof rejection + re-upload
- [ ] UAT-04: 3 concurrent admins approving
- [ ] UAT-05: 3-device check-in + duplicate handling
- [ ] UAT-06: Sold-out race test (no oversells)
- [ ] UAT-07: Failure rehearsal (Redis, email, Cloudinary, DB)
- [ ] UAT-08: Data isolation (no UAT data in prod)
- [ ] UAT-09: Reset + reseed test
- [ ] UAT-10: Stakeholder review + sign-off

All PASS: [ ] Ready for production
Issues: [List any]
Sign-off by: [Name/Date]
```

---

## Notes

- **Always test in order.** Earlier scenarios set up data for later ones.
- **Screenshots:** Capture errors or unusual behavior — add to sign-off record.
- **Timing:** Allow ~2 hours for full UAT cycle (1.5 if experienced).
- **Questions:** Check `/docs/uat-sign-off-template.md` for sign-off process.
