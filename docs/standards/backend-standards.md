# Backend Rulebook — Axon Tickets

**Who reads this:** the `backend-reviewer` agent at the Backend build gate.
**Plain-English goal:** server code is tested, transactional where it must be, and follows the existing NestJS patterns.

---

## Hard rules (violating any = gate REJECT)

1. **No `$queryRaw` with template literals.** Parameterized queries only.
2. **`APP_ENV`, never `process.env.NODE_ENV`.**
3. **New services ship with unit tests.** The suite baseline is green (200+ tests); a PR may not lower coverage of changed files. Test files live next to the service (`*.spec.ts`, see `events.service.featured.spec.ts`).
4. **Multi-step writes are transactional.** If step 2 can fail after step 1 wrote, wrap in `prisma.$transaction`.
5. **Concurrent mutations of shared counters/limits use the advisory-lock pattern** (reference: referral redemption — lock per event+code before the max-usage check).
6. **No secrets in code or logs.** OTP codes never logged. Provider keys via env only.

## Design rules (findings to fix before approval)

7. **Module layout follows the house pattern:** `<feature>/<feature>.module.ts`, `.controller.ts`, `.service.ts`, `dto/`. Business logic in services, not controllers.
8. **Money math:** integer pesos everywhere (see db-standards). Watch division — `Math.round` at final display only.
9. **Emails via the existing `email` module** (Resend); uploads via the existing validation path (Cloudinary, type + size checks — JPG/PNG/WebP, no SVG).
10. **Audit trail:** state changes that admins perform (approve, reject, verify) write audit records — follow the existing `audit` module pattern.
11. **Time zones:** event times are Philippine-market; store UTC, convert at the edge.
12. **Errors:** throw Nest HTTP exceptions with safe messages; no `throw new Error` bubbling raw to clients.

## What the reviewer checks, in order

1. Raw SQL / injection risk?
2. `NODE_ENV` usage?
3. Tests exist for new/changed services and pass?
4. Transactions around multi-step writes?
5. Concurrency hazards on caps/limits/counters?
6. Peso math correct?
7. Follows module/service/DTO layout?
8. Audit records for admin state changes?
9. Secrets or sensitive values in logs?
