# Fix OTP Email Delivery — Production Email Setup

## Problem
OTP emails not reaching users because the app uses Resend's sandbox domain (`onboarding@resend.dev`), which can only send to verified addresses.

## Solution: Configure Custom Domain in Resend

### Step 1: Add Domain in Resend Dashboard

1. Go to https://resend.com/domains
2. Click **Add Domain**
3. Enter your domain (e.g., `tixora.com`, `axon-tickets.com`, or your actual domain)
4. Resend will provide DNS records to add

### Step 2: Add DNS Records

Add these records to your domain registrar (e.g., Namecheap, GoDaddy, Cloudflare):

**Required DNS Records (from Resend):**
- **SPF Record** (TXT): Verifies your domain can send emails
- **DKIM Record** (TXT): Signs emails to prevent spoofing  
- **DMARC Record** (TXT): Sets policy for failed authentication

**Example (your actual values will differ):**
```
Type: TXT
Name: @
Value: v=spf1 include:amazonses.com ~all

Type: TXT  
Name: resend._domainkey
Value: k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA...

Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@resend.com
```

### Step 3: Verify Domain

1. After adding DNS records, click **Verify** in Resend dashboard
2. DNS propagation takes 5-60 minutes
3. Status will change to ✅ **Verified**

### Step 4: Update Environment Variables

**Local (.env):**
```env
RESEND_FROM_EMAIL=noreply@yourdomain.com
RESEND_FROM_NAME=Axon Tickets
```

**Production (Vercel):**
1. Go to https://vercel.com/ivuriarte/api-tau-six-59/settings/environment-variables
2. Edit `RESEND_FROM_EMAIL`
3. Set to: `noreply@yourdomain.com` (replace with your actual domain)
4. Save and redeploy

### Step 5: Test

```bash
# API endpoint to test
curl -X POST https://api-tau-six-59.vercel.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User",
    "captchaToken": "10000000-aaaa-bbbb-cccc-000000000001"
  }'
```

Check inbox (and spam folder) for OTP email.

---

## Alternative: Use Resend's Test Email Feature

**Quick test without domain setup (development only):**

1. Go to Resend dashboard → **Emails**
2. Add test recipient emails under **Testing**
3. These verified emails can receive sandbox emails

**⚠️ Not a production solution** — only for testing.

---

## Recommended Email Address

Choose a professional sender:
- ✅ `noreply@yourdomain.com`
- ✅ `tickets@yourdomain.com`
- ✅ `hello@yourdomain.com`
- ❌ `admin@tixora.test` (invalid TLD)
- ❌ `onboarding@resend.dev` (sandbox)

---

## Expected Outcome

After completing these steps:
- ✅ OTP emails sent to **any valid email address**
- ✅ Better deliverability (inbox, not spam)
- ✅ Professional sender identity
- ✅ Full production email capability

---

## Monitoring Email Delivery

After deployment, monitor in Resend dashboard:
- Go to https://resend.com/emails
- Check delivery status (✅ Delivered, ⚠️ Bounced, 🚫 Complained)
- Review bounce reasons if any emails fail

---

## Additional Improvements (Optional)

### 1. Add Retry Logic for Failed Sends

Currently, the email service logs failures but doesn't retry. For critical OTPs, consider:

```typescript
// In email.service.ts - add retry with exponential backoff
async sendWithRetry(to: string, subject: string, html: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await this.resend.emails.send({
      from: `${this.fromName} <${this.fromEmail}>`,
      to,
      subject,
      html,
    });
    
    if (!error) return;
    
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // exponential backoff
    } else {
      this.logger.error({ msg: 'Failed to send email after retries', to, subject, error: error.message });
    }
  }
}
```

### 2. Email Queue with Bull/BullMQ

For high-volume production:
- Queue OTP emails instead of sending synchronously
- Retry failed sends automatically
- Monitor queue health

### 3. Multiple Email Providers

Fallback strategy:
- Primary: Resend
- Fallback: SendGrid or Amazon SES
- Switch automatically if primary fails

---

## Timeline

- **DNS propagation**: 5-60 minutes
- **Domain verification**: Instant after DNS propagates
- **Deployment**: ~3 minutes (Vercel auto-deploy)
- **Total**: ~30-90 minutes for full setup
