# Manual Setup Guide: Phases 3-7

**Purpose:** Step-by-step instructions for every manual dashboard task required to complete Phases 3-7.
**Audience:** IanVince (you) — follow these exactly as written.
**Estimated time:** ~45 minutes for all manual steps.

**After you complete these, I will automate all code/config changes via commits.**

---

## PHASE 3: Supabase UAT Isolation

### Manual Task 3.1: Create UAT Supabase Project

**Why:** You need a separate Supabase project for UAT so test data never touches production.

**Steps:**

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **"New project"** button (top right)
3. Fill in the form:
   - **Organization:** Select your current org (Tixora)
   - **Project name:** `tixora-uat` (or `axon-tickets-uat`)
   - **Database password:** Generate a strong password, save it somewhere safe
   - **Region:** Same as production (ap-northeast-1 for Tokyo — check your production project settings if unsure)
   - **Pricing plan:** Select **"Pro Plan"** (same as production)
4. Click **"Create new project"** — this takes ~2 minutes
5. Wait for the project to finish initializing (you'll see a green checkmark)
6. **Save the project reference ID** — you'll find it here:
   - Settings (gear icon, bottom left) → General → Project Reference ID
   - Copy this ID (looks like: `xxxxxxxxxyyyyyyyyy`)
   - **Save it in a note** — you'll need it later

**Result:** You now have a separate UAT database. ✅

---

### Manual Task 3.2: Copy UAT Database Connection Strings

**Why:** The API needs to know how to connect to UAT database.

**Steps:**

1. In your new **UAT Supabase project**, go to **Settings → Database → Connection Pooling**
2. At the top, make sure **"Session"** is selected (not Transaction)
3. You'll see two connection strings:
   - **Pooler (Transactions)** — port 6543 (for runtime API traffic)
   - **Direct (Sessions)** — port 5432 (for migrations only)

   **Copy BOTH strings:**
   - Pooler URL: `postgresql://postgres...6543/postgres?pgbouncer=true&connection_limit=1`
   - Direct URL: `postgresql://postgres...5432/postgres`

4. Go to **[Vercel.com/dashboard](https://vercel.com/dashboard)**
5. Click your **API project** (`api`)
6. Go to **Settings → Environment Variables**
7. Create TWO new environment variables:
   - **Key:** `DATABASE_URL_UAT`  
     **Value:** (paste the Pooler URL from step 3)  
     **Environments:** Select only **"UAT"** (if available; if not, skip for now)
   - **Key:** `DIRECT_URL_UAT`  
     **Value:** (paste the Direct URL from step 3)  
     **Environments:** Select only **"UAT"** (if available; if not, skip for now)
8. Click **Save** on each

**Result:** Vercel API knows how to reach UAT database. ✅

---

### Manual Task 3.3: Test Connection

**Steps:**

1. Open terminal and run:
   ```bash
   cd apps/api
   DATABASE_URL="<paste-the-pooler-url-here>" npx prisma db push
   ```
   (Replace `<paste...>` with the actual Pooler URL)

2. If you see `✓ Schema pushed`, connection works. ✅
3. If you see an error like `ECONNREFUSED`, the URL is wrong — go back to step 3.2 and verify the URL.

**Result:** UAT database is ready and schema is synced. ✅

---

## PHASE 4: Vercel UAT Environment

### Manual Task 4.1: Create UAT Custom Environment in Vercel (Web Project)

**Why:** Vercel needs to know that `uat` branch deploys to a separate environment with its own domain.

**Steps:**

1. Go to [Vercel dashboard](https://vercel.com/dashboard)
2. Click your **web project** (`tixora-online-ticket-app`)
3. Go to **Settings → Deployments → Environments**
4. You should see **Production** and **Preview** already listed
5. Click **"Create environment"** button
6. Fill in:
   - **Name:** `UAT`
   - **Branches:** Type `uat` and press Enter (so deployments from the `uat` branch go here)
   - Leave other settings as default
7. Click **Create**

**Result:** Vercel web project now has a UAT environment. ✅

---

### Manual Task 4.2: Create UAT Custom Environment in Vercel (API Project)

**Repeat Task 4.1 but for the API project (`api` project):**

1. Go to [Vercel dashboard](https://vercel.com/dashboard)
2. Click your **API project** (`api`)
3. Go to **Settings → Deployments → Environments**
4. Click **"Create environment"**
5. Fill in:
   - **Name:** `UAT`
   - **Branches:** Type `uat` and press Enter
6. Click **Create**

**Result:** Vercel API project now has a UAT environment. ✅

---

### Manual Task 4.3: Attach Custom Domains to UAT Environments

**Steps (Web):**

1. In your Vercel **web project**, go to **Settings → Domains**
2. Click **"Add domain"**
3. Type: `uat.axontickets.online`
4. Select **"UAT"** from the environment dropdown
5. Click **Add**
6. Vercel will ask you to point DNS. If you use Namecheap/GoDaddy/whatever:
   - Go to your DNS provider
   - Create a CNAME record: `uat.axontickets.online` → `cname.vercel-dns.com`
   - Wait 5-10 minutes for DNS to propagate
   - Come back to Vercel and it should show ✓ Valid

**Steps (API):**

1. In your Vercel **API project**, go to **Settings → Domains**
2. Click **"Add domain"**
3. Type: `api-uat.axontickets.online`
4. Select **"UAT"** from the environment dropdown
5. Click **Add**
6. Repeat the DNS CNAME step (your DNS provider)

**Result:** You now have `uat.axontickets.online` and `api-uat.axontickets.online` domains. ✅

---

### Manual Task 4.4: Set UAT Environment Variables in Vercel

**This is important — UAT must NOT use production secrets.**

**Steps (Web Project):**

1. In Vercel **web project**, go to **Settings → Environment Variables**
2. For each variable below, create a NEW entry with the same key but **UAT-specific value**:

   | Key | Production Value | UAT Value | Environments |
   |---|---|---|---|
   | `NEXT_PUBLIC_APP_ENV` | `production` | `uat` | UAT only |
   | `NEXT_PUBLIC_API_URL` | `https://api.axontickets.online` | `https://api-uat.axontickets.online` | UAT only |
   | `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production` | `uat` | UAT only |

3. For any other secret variables (API keys, etc.), create UAT versions under "Environment Variables" → select **"UAT"** from dropdown
4. Click **Save** after each

**Steps (API Project):**

1. In Vercel **API project**, go to **Settings → Environment Variables**
2. Create these UAT-specific entries:

   | Key | Production Value | UAT Value | Environments |
   |---|---|---|---|
   | `APP_ENV` | `production` | `uat` | UAT only |
   | `WEB_URL` | `https://axontickets.online` | `https://uat.axontickets.online` | UAT only |
   | `API_URL` | `https://api.axontickets.online` | `https://api-uat.axontickets.online` | UAT only |
   | `ALLOWED_ORIGINS` | `https://axontickets.online,https://www.axontickets.online` | `https://uat.axontickets.online` | UAT only |
   | `DATABASE_URL` | (production pooler) | (UAT pooler — from Task 3.2) | UAT only |
   | `DIRECT_URL` | (production direct) | (UAT direct — from Task 3.2) | UAT only |

3. For **Redis, Cloudinary, PayMongo, SMTP, Sentry** — leave as production for now, we'll isolate them in Phase 5
4. Click **Save** after each

**Result:** UAT environments have isolated configuration. ✅

---

### Manual Task 4.5: Enable Deployment Protection for UAT

**Why:** Prevent unauthorized access to UAT during testing.

**Steps (Web):**

1. In Vercel **web project**, go to **Settings → Deployment Protection**
2. Toggle **"Deployment Protection"** to **ON**
3. Select **"Vercel Authentication"**
4. Toggle **"Preview deployments"** and **"Production deployments"** both ON
5. Click **Save**

**Steps (API):**

Repeat the same steps in the **API project**.

**Result:** UAT deployments are protected by Vercel login. ✅

---

### Manual Task 4.6: Create Deployment Protection Bypass Secret for Tests

**Why:** Playwright E2E tests need to access UAT without login.

**Steps:**

1. In Vercel **web project**, go to **Settings → Deployment Protection**
2. Scroll down to **"Bypass for specific deployments"**
3. Click **"Create bypass"**
4. Name it: `playwright-test-bypass`
5. Click **Create**
6. **Copy the bypass token** — you'll need this for GitHub Actions

Repeat for the **API project**.

**Save these tokens** — you'll use them in Phase 6 (CI/CD setup).

**Result:** CI/CD can access UAT without login. ✅

---

## PHASE 5: External Service Isolation

### Manual Task 5.1: Create UAT Upstash Redis Instance

**Why:** OTPs, rate limits, reservations must not share keys between production and UAT.

**Steps:**

1. Go to [console.upstash.com](https://console.upstash.com)
2. Click **"Create database"**
3. Fill in:
   - **Database name:** `tixora-uat` or `axon-uat`
   - **Region:** Same as production (check your current database → Database → Region)
   - **Type:** Keep as **"Redis"**
   - **Eviction:** Keep as **"Noeviction"** (same as production)
4. Click **"Create"**
5. Once created, go to **Details** tab
6. Copy the **REST URL** (looks like: `https://xxxx.upstash.io`)
7. Copy the **Redis URL** (looks like: `rediss://default:PASSWORD@xxxx.upstash.io:6379`)

**Save both URLs.**

**Steps to add to Vercel (API project only):**

1. Go to Vercel **API project** → **Settings → Environment Variables**
2. Create:
   - **Key:** `REDIS_URL_UAT`
   - **Value:** (paste the Redis URL from step 7)
   - **Environments:** Select only **"UAT"**
3. Click **Save**

**Result:** UAT has its own Redis instance. ✅

---

### Manual Task 5.2: Set Up Email Sandboxing (Brevo)

**Why:** UAT emails must not go to real attendees.

**Steps:**

1. Go to [brevo.com dashboard](https://app.brevo.com)
2. In your Brevo account settings, find **"API & Apps" → "API Keys"** or look for sandbox/test mode
3. **Option A: Use Brevo Test Mode**
   - Look for an "Inbox" or "Test Mode" setting
   - Enable test inbox — this sends all emails to a test inbox only
   
   **Option B: Create an Email Allowlist**
   - In your API config code (which I'll write), restrict UAT email sending to only: `ivvuriarte@gmail.com`
   - Any email to other addresses will be blocked at the API layer

4. I recommend **Option B** (allowlist in code) because it's explicit and safe.

**I'll implement the allowlist in Phase 6 code.**

**Result:** Email is sandboxed in UAT. ✅

---

### Manual Task 5.3: Create PayMongo Test Account (if you don't have one)

**Why:** UAT must use test keys, never live payment processing keys.

**Steps:**

1. Go to [PayMongo.com](https://paymongo.com)
2. Log in to your merchant account
3. In your dashboard, look for **"Test Mode"** or **"API Keys"** section
4. You should see:
   - **Test Secret Key** (starts with `sk_test_`)
   - **Test Public Key** (starts with `pk_test_`)
5. Copy both keys

**Steps to add to Vercel (API project):**

1. Go to Vercel **API project** → **Settings → Environment Variables**
2. Create:
   - **Key:** `PAYMONGO_SECRET_KEY_UAT`
   - **Value:** (paste the test secret key)
   - **Environments:** Select only **"UAT"**
3. Create:
   - **Key:** `PAYMONGO_PUBLIC_KEY_UAT`
   - **Value:** (paste the test public key)
   - **Environments:** Select only **"UAT"**
4. Click **Save** after each

**Result:** UAT has test PayMongo keys. ✅

---

### Manual Task 5.4: Create Separate PayMongo Webhook Secret for UAT

**Why:** Production and UAT webhooks must use different secrets.

**Steps:**

1. In PayMongo dashboard, go to **API Keys & Webhooks** → **Webhooks**
2. Create a new webhook endpoint:
   - **URL:** `https://api-uat.axontickets.online/api/v1/webhooks/paymongo`
   - **Events:** Select `payment.paid`, `payment.failed`
3. Copy the **Webhook Secret** that PayMongo generates

**Steps to add to Vercel (API project):**

1. Go to Vercel **API project** → **Settings → Environment Variables**
2. Create:
   - **Key:** `PAYMONGO_WEBHOOK_SECRET_UAT`
   - **Value:** (paste the webhook secret)
   - **Environments:** Select only **"UAT"**
3. Click **Save**

**Result:** UAT has its own PayMongo webhook secret. ✅

---

### Manual Task 5.5: Configure Cloudinary Folder Structure

**Why:** Production and UAT uploads must go to separate folders.

**Steps:**

1. Go to [Cloudinary dashboard](https://cloudinary.com/console)
2. You don't need to create anything new here — Cloudinary uses folder paths in the URL
3. The code I'll write will use:
   - **Production uploads:** `axon-tickets/prod/...`
   - **UAT uploads:** `axon-tickets/uat/...`

**No manual steps needed here — I'll configure it in code.** ✅

---

### Manual Task 5.6: Configure Sentry for UAT

**Why:** UAT errors should be tagged separately so they don't pollute production triage.

**Steps:**

1. Go to [sentry.io dashboard](https://sentry.io)
2. Click your **Tixora project**
3. Go to **Settings → Environments**
4. You should see **"production"** listed
5. Click **"Create environment"** (if needed) and add **"uat"**
6. The code I'll write will automatically tag UAT errors with `environment: uat` and the git commit SHA

**No additional manual setup needed** — Sentry automatically recognizes new environment tags.

**Result:** Sentry will show UAT and production errors in separate tabs. ✅

---

### Manual Task 5.7: Generate QR HMAC Secret for UAT

**Why:** UAT QR tokens must not be accepted by production.

**Steps:**

1. Open terminal and run:
   ```bash
   openssl rand -hex 32
   ```
2. Copy the output (a 64-character hex string)

**Steps to add to Vercel (API project):**

1. Go to Vercel **API project** → **Settings → Environment Variables**
2. Create:
   - **Key:** `QR_HMAC_SECRET_UAT`
   - **Value:** (paste the hex string from step 2)
   - **Environments:** Select only **"UAT"**
3. Click **Save**

**Result:** UAT has its own QR signing secret. ✅

---

### Manual Task 5.8: Disable Meta Pixel in UAT

**Why:** Test user activity should not pollute your production analytics.

**No manual setup needed** — I'll add a code check that disables Meta Pixel when `APP_ENV=uat`.

**Result:** UAT activity won't appear in your analytics. ✅

---

## PHASE 6: CI/CD and Release Gates

**No manual steps** — I'll create all GitHub Actions workflows and configuration files.

---

## PHASE 7: UAT Acceptance Scenarios

**No manual steps** — I'll document all 10 test scenarios.

---

## SUMMARY: What You Need to Do

**Total manual tasks: 12**

1. ✅ Create UAT Supabase project
2. ✅ Copy UAT database connection strings to Vercel
3. ✅ Test connection
4. ✅ Create UAT environment in Vercel (Web)
5. ✅ Create UAT environment in Vercel (API)
6. ✅ Attach custom domains
7. ✅ Set UAT environment variables
8. ✅ Enable Deployment Protection
9. ✅ Create bypass secrets for tests
10. ✅ Create UAT Upstash Redis instance
11. ✅ Set up email sandboxing
12. ✅ Create/configure PayMongo test keys and webhook

**All other tasks (code, CI/CD, acceptance docs) I'll automate.**

---

## Next Steps

**Once you've completed all 12 manual tasks:**

1. Reply with: **"Manual tasks complete"**
2. I'll then:
   - Commit all code changes (migrations, environment checks, CI/CD workflows)
   - Create all documentation
   - Verify everything works end-to-end

**Estimated time to complete manual tasks: 45 minutes**

Start with Task 1 (Supabase UAT project creation) and work through in order. Let me know if you get stuck on any step.
