# Domain Setup Guide: axontickets.online

## Overview
This guide will help you configure the custom domain `axontickets.online` for your Tixora application on Vercel.

## Domain Structure
- **Main Website**: `axontickets.online` (Primary - naked domain)
- **WWW Redirect**: `www.axontickets.online` → redirects to `axontickets.online`
- **API Backend**: `api.axontickets.online`

---

## Part 1: Add Domains to Vercel Projects

### 1.1 Configure Web App Domain (tixora-online-ticket-app)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to **tixora-online-ticket-app** project
3. Click **Settings** → **Domains**
4. Add the following domains:
   - `axontickets.online` (Primary - naked domain)
   - `www.axontickets.online` (Redirect to naked domain)

**To add a domain:**
- Click "Add Domain"
- Enter `axontickets.online`
- Click "Add"
- Repeat for `www.axontickets.online`
- Configure `www.axontickets.online` to redirect to `axontickets.online`

### 1.2 Configure API Domain (api)

1. Navigate to **api** project in Vercel Dashboard
2. Click **Settings** → **Domains**
3. Add domain:
   - `api.axontickets.online`

---

## Part 2: Update DNS Records

After adding domains to Vercel, you'll see DNS instructions. Configure these records with your domain registrar:

### For axontickets.online (Primary - Naked Domain)
```
Type: A
Name: @
Value: 76.76.21.21
```

### For www.axontickets.online (Redirect to naked domain)
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com.
```

### For api.axontickets.online (API)
```
Type: CNAME
Name: api
Value: cname.vercel-dns.com.
```

**Note**: Vercel will show you the exact values after you add the domains. These may differ slightly.

---

## Part 3: Update Environment Variables

### 3.1 Update Web App Environment Variables

Go to **tixora-online-ticket-app** → **Settings** → **Environment Variables**

Update or add:
```bash
NEXT_PUBLIC_API_URL=https://api.axontickets.online/api/v1
```

### 3.2 Update API Environment Variables

Go to **api** → **Settings** → **Environment Variables**

Update:
```bash
ALLOWED_ORIGINS=https://axontickets.online,https://www.axontickets.online
```

**Important**: Include both the naked domain and www subdomain in ALLOWED_ORIGINS to handle requests from both (before www redirects).

---

## Part 4: Verify SSL Certificates

After DNS propagates (5-60 minutes), Vercel will automatically provision SSL certificates.

Check status in:
- Project → Settings → Domains → Each domain should show "✓ Valid Configuration"

---

## Part 5: Test the Setup

### 5.1 Test Web App
1. Visit `https://axontickets.online` (primary domain)
2. Visit `https://www.axontickets.online` (should redirect to naked domain)
3. Browse events and registration flow

### 5.2 Test API
```bash
curl https://api.axontickets.online/api/v1/health
```

Expected response:
```json
{"database":"ok","redis":"ok"}
```

### 5.3 Test CORS
Open browser console on `axontickets.online` and check Network tab for API calls - they should succeed without CORS errors.

---

## Part 6: Update Email Settings (Optional)

If you want to use email addresses with the new domain:

### Option A: Configure Email Forwarding
Set up email forwarding at your domain registrar:
- `support@axontickets.online` → forwards to your Gmail
- `noreply@axontickets.online` → forwards to your Gmail

### Option B: Update Brevo SMTP From Address
1. Go to [Brevo](https://app.brevo.com/)
2. Navigate to Settings → Sender & IP
3. Add and verify `noreply@axontickets.online`
4. Update Vercel env var `SMTP_FROM_EMAIL=noreply@axontickets.online`

---

## Rollback Plan

If you need to rollback to Vercel URLs:

1. Remove custom domains from Vercel projects
2. Revert environment variables:
   ```bash
   NEXT_PUBLIC_API_URL=https://api-tau-six-59.vercel.app/api/v1
   ALLOWED_ORIGINS=https://tixora-online-ticket-app.vercel.app
   ```
3. Redeploy both projects

---

## Code Changes Made

✅ **Updated QR Code Footer**
- File: `apps/api/src/qr/qr.service.ts`
- Value: `axontickets.online` (naked domain)

✅ **Updated Support Email**
- File: `apps/web/src/app/events/[slug]/register/payment/[registrationId]/page.tsx`
- Value: `support@axontickets.online`

✅ **Updated CSP Configuration**
- File: `apps/web/next.config.mjs`
- Added: `https://api.axontickets.online` to `connect-src`

**All code references use the naked domain (`axontickets.online`) as primary.**

---

## DNS Propagation Check

Use these tools to verify DNS propagation:
- https://dnschecker.org/
- https://www.whatsmydns.net/

Enter your domains and check if they resolve correctly worldwide.

---

## Troubleshooting

### Domain shows "Invalid Configuration"
- Wait 5-60 minutes for DNS propagation
- Verify DNS records match Vercel's instructions exactly
- Check for typos in CNAME/A record values

### SSL Certificate Not Provisioning
- Ensure DNS is fully propagated (use dnschecker.org)
- Remove and re-add the domain in Vercel
- Contact Vercel support if it persists after 24 hours

### CORS Errors After Domain Change
- Verify `ALLOWED_ORIGINS` env var includes the new domain
- Redeploy the API project after updating env vars
- Clear browser cache and test in incognito mode

### API Calls Failing
- Check `NEXT_PUBLIC_API_URL` is set correctly in web app
- Redeploy web app after updating env vars
- Test API directly: `curl https://api.axontickets.online/api/v1/health`

---

## Quick Reference: Vercel CLI Commands

```bash
# View current domains for web app
cd /path/to/project
VERCEL_ORG_ID=team_Ssx1r6jV33qJ7k364rgABx2m \
VERCEL_PROJECT_ID=prj_SnQtRsjfqlgLDrphgaWaQVQq2pGg \
vercel domains ls

# View current domains for API
VERCEL_ORG_ID=team_Ssx1r6jV33qJ7k364rgABx2m \
VERCEL_PROJECT_ID=prj_T3LUlKv54v5jED81cBMZjxPy4KZy \
vercel domains ls

# Add domain via CLI (if needed)
vercel domains add www.axontickets.online
```

---

## Next Steps After Domain is Live

1. ✅ Update Google Search Console with new domain (use naked domain `axontickets.online`)
2. ✅ Update any marketing materials with `https://axontickets.online`
3. ✅ Set up 301 redirects from any old URLs (if applicable)
4. ✅ Update social media links to `https://axontickets.online`
5. ✅ Configure email addresses (support@axontickets.online, noreply@axontickets.online)
6. ✅ Set up domain monitoring/uptime alerts
