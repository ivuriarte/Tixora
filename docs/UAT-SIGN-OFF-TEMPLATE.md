# UAT Sign-Off Record

**Purpose:** Record stakeholder approval of UAT testing before promoting to Production.

**Template:** Copy this section for each UAT testing cycle.

---

## UAT Testing Session — [DATE]

**Tester Name:** [Your name]  
**Tested By:** [Reviewer name if different]  
**Date:** [YYYY-MM-DD]  
**Build SHA:** [Commit hash, e.g., abc1234]  
**Deployment ID:** [Vercel deployment ID]  
**Testing Duration:** [Start time → End time]

### Environment Verified
- **UAT Web:** `https://uat.axontickets.online` ✓
- **UAT API:** `https://api-uat.axontickets.online/api/v1/health` ✓
- **Data Isolation:** No production data present ✓
- **Compute:** MICRO (Supabase) ✓

### Test Coverage

#### Phase 1: Registration & Checkout
- [ ] **UAT-01:** Solo registration → OTP → proof upload → approval → QR email → check-in
  - Status: PASS / FAIL / BLOCKED
  - Notes: [Any issues or observations]

- [ ] **UAT-02:** Group registration (5–10 attendees, 1 proof)
  - Verify: Caps enforced, non-transferable tickets, per-attendee QRs
  - Status: PASS / FAIL / BLOCKED
  - Notes: 

- [ ] **UAT-03:** Proof rejection → re-upload → notifications
  - Status: PASS / FAIL / BLOCKED
  - Notes: 

#### Phase 2: Admin & Concurrency
- [ ] **UAT-04:** 3 simultaneous admin reviewers approving/rejecting
  - Verify: Audit trail attribution
  - Status: PASS / FAIL / BLOCKED
  - Notes: 

- [ ] **UAT-05:** 3-device check-in simulation + duplicate scan handling
  - Status: PASS / FAIL / BLOCKED
  - Notes: 

- [ ] **UAT-06:** Concurrent registration race test (near sold-out tier)
  - Verify: No oversells, inventory correct
  - Status: PASS / FAIL / BLOCKED
  - Notes: 

#### Phase 3: Resilience
- [ ] **UAT-07:** Failure rehearsal
  - Redis unavailable: API degrades gracefully ✓ / ✗
  - Email unavailable: Registrations still process ✓ / ✗
  - Cloudinary failure: Proof upload fails gracefully ✓ / ✗
  - Slow DB response: Requests timeout properly ✓ / ✗
  - Status: PASS / FAIL / BLOCKED
  - Notes: 

#### Phase 4: Data & Operations
- [ ] **UAT-08:** Data isolation — no UAT data leaked to Production
  - Verified: User, registration, proof, Redis, email, analytics logs ✓
  - Status: PASS / FAIL / BLOCKED
  - Notes: 

- [ ] **UAT-09:** Reset test — UAT reset, migrations, reseed, smoke tests
  - Status: PASS / FAIL / BLOCKED
  - Notes: 

- [ ] **UAT-10:** Stakeholder review (mobile + desktop)
  - Reviewed by: [Name/Role]
  - Browsers tested: [e.g., Chrome, Safari, Firefox]
  - Mobile tested: [iOS / Android / both]
  - Status: APPROVED / REJECTED / NEEDS REVISION
  - Notes: 

#### Phase 5: Product Package Verification
- [ ] **UAT-11:** Referral pricing, event ownership, usage reporting, and concurrent redemption
  - Status: PASS / FAIL / BLOCKED
  - Notes:

- [ ] **UAT-12:** Required birthday, gender, and city validation plus privacy boundaries
  - Status: PASS / FAIL / BLOCKED
  - Notes:

- [ ] **UAT-13:** Sponsor tier, description, link, visibility, responsive rendering, and safe uploads
  - Status: PASS / FAIL / BLOCKED
  - Notes:

- [ ] **UAT-14:** Custom event sections, ordering, visibility, imagery, and accessibility text
  - Status: PASS / FAIL / BLOCKED
  - Notes:

### Database Migration Verification
- [ ] Migration `20260704180000_add_product_packages_mvp` applied successfully
- [ ] Existing users, events, registrations, and attendees remain readable
- [ ] Referral tables, indexes, and foreign keys are present
- [ ] API started only after migration completion

### Known Issues & Blockers

| Issue | Severity | Status | Action |
|---|---|---|---|
| [Issue 1] | [P0/P1/P2] | Open / Fixed / Deferred | [Resolution] |
| [Issue 2] | [P0/P1/P2] | Open / Fixed / Deferred | [Resolution] |

**P0 (Critical):** Must fix before production.  
**P1 (High):** Should fix before production.  
**P2 (Medium):** Can defer to post-launch.  

### Performance Observations

| Metric | Target | Observed | Status |
|---|---|---|---|
| Public event read (p95) | <500ms | [X]ms | ✓ / ✗ |
| Registration (p95) | <1s | [X]ms | ✓ / ✗ |
| Referral validation (p95) | <500ms | [X]ms | ✓ / ✗ |
| Referral dashboard (p95) | <1s | [X]ms | ✓ / ✗ |
| Check-in (p95) | <300ms | [X]ms | ✓ / ✗ |
| Error rate | <1% | [X]% | ✓ / ✗ |
| Database connections | <50 | [X] | ✓ / ✗ |

### Recommendation

- [ ] **APPROVED** — Ready for production promotion
- [ ] **APPROVED WITH CONDITIONS** — Ready, but monitor: [what to watch]
- [ ] **REJECTED** — Not ready. Blockers: [list]
- [ ] **DEFERRED** — Retest after fixes in issue list

### Sign-Off

**Approver Name:** [Full name]  
**Approver Role:** [e.g., QA Lead, Product Owner, Release Manager]  
**Approval Date:** [YYYY-MM-DD HH:MM UTC]  
**Signature/Confirmation:** [Confirm via reply-all email or comment below]

---

## Production Promotion

**Next Step (if APPROVED):**
1. Merge `uat` branch into `main`
2. Verify production CI/CD passes
3. Confirm production domain health
4. Monitor Sentry & logs for 1 hour post-deployment
5. Archive this sign-off record in `/docs/signoffs/`

**Rollback Plan:**
- Vercel: `vercel rollback` in production project
- Database: Restore latest backup (takes ~2 min)
- Alert: Notify team in Slack #incidents

---

**Archive Location:** `/docs/signoffs/uat-signoff-[DATE].md`
