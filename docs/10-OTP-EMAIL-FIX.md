# OTP Email Delivery Fix — Summary

## Issue
Users reported not receiving OTP verification emails during registration.

## Root Cause
Using Resend sandbox domain `onboarding@resend.dev`, which can only send to pre-verified email addresses.

## Changes Made

### 1. Documentation
**File:** `docs/09-EMAIL-SETUP.md`
- Complete guide to set up custom domain in Resend
- DNS configuration steps (SPF, DKIM, DMARC)
- Environment variable updates for production
- Monitoring and troubleshooting guide

### 2. Email Service Improvements
**File:** `apps/api/src/email/email.service.ts`

**Added retry logic:**
- New `sendWithRetry()` method with exponential backoff
- Retries up to 3 times (1s, 2s, 4s delays)
- Returns boolean success/failure status

**Enhanced logging:**
- Logs email ID on success
- Logs attempt number, delay, and error details
- Includes `from` address in error logs for debugging
- Structured logs with all relevant context

**Updated `sendOtpEmail()`:**
- Now uses retry logic for critical OTP emails
- Returns `boolean` instead of `void`
- More reliable delivery for registration flow

### 3. Auth Service Error Handling
**File:** `apps/api/src/auth/auth.service.ts`

**Updated `sendOtp()` method:**
- Checks email send result
- Logs failures with user context
- Still saves OTP in database (user can resend)
- Doesn't throw on email failure (graceful degradation)

## Next Steps for Production

### Required (Immediate)
1. **Set up custom domain in Resend** (follow `docs/09-EMAIL-SETUP.md`)
2. **Update environment variables:**
   ```env
   RESEND_FROM_EMAIL=noreply@yourdomain.com
   RESEND_FROM_NAME=Axon Tickets
   ```
3. **Deploy to Vercel** (update env vars in dashboard)

### Recommended (Short-term)
1. **Monitor email delivery** in Resend dashboard
2. **Check logs** for any retry failures
3. **Test with real user emails** (not just your own)

### Optional (Long-term)
1. **Email queue** with Bull/BullMQ for high volume
2. **Multiple providers** (fallback to SendGrid/SES)
3. **Email templates** system for easier maintenance
4. **Rate limiting** per email address to prevent abuse

## Testing

### Local Testing
```bash
# Start API
cd apps/api
npm run start:dev

# Register new user
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User",
    "captchaToken": "10000000-aaaa-bbbb-cccc-000000000001"
  }'
```

Check logs for:
- ✅ `Email sent successfully` (with emailId)
- ⚠️ `Email send failed, retrying` (if temporary failure)
- 🚫 `Failed to send email after all retries` (requires investigation)

### Production Testing
After deploying with custom domain:
1. Register with a **real email** (not yours)
2. Check inbox (and spam folder)
3. Verify OTP arrives within 1 minute
4. Check Resend dashboard → Emails → delivery status

## Expected Outcomes

### Before Fix
- ❌ Only verified emails receive OTP
- ❌ No retry on temporary failures
- ❌ Silent failures in production
- ❌ Poor debugging visibility

### After Fix
- ✅ All valid emails receive OTP (with custom domain)
- ✅ Automatic retry on temporary failures
- ✅ Detailed logging for debugging
- ✅ Graceful degradation (user can resend)

## Rollback Plan

If issues occur:
1. Revert `RESEND_FROM_EMAIL` to sandbox: `onboarding@resend.dev`
2. Verify your own email in Resend dashboard for testing
3. Manually verify users via database update (temporary):
   ```sql
   UPDATE "User" SET "isVerified" = true WHERE email = 'user@example.com';
   ```

## Monitoring

Watch these logs in production:
- `Failed to send email after all retries` → indicates email service issue
- `OTP email failed to send after retries` → indicates persistent problem
- High retry rates → may indicate transient API issues

Check Resend dashboard daily:
- Bounce rate (should be < 5%)
- Complaint rate (should be < 0.1%)
- Delivery rate (should be > 95%)

## Related Files
- `apps/api/src/email/email.service.ts` — Email service with retry logic
- `apps/api/src/auth/auth.service.ts` — OTP generation and sending
- `apps/api/.env` — Environment configuration (local)
- `docs/09-EMAIL-SETUP.md` — Complete setup guide
