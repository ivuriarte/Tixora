import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import { QrService } from '../qr/qr.service';

@Injectable()
export class EmailService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromName: string;
  private readonly fromEmail: string;
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly qrService: QrService,
  ) {
    this.fromName = config.get<string>('smtp.fromName') ?? 'Axon Tickets';
    this.fromEmail = config.get<string>('smtp.fromEmail') ?? '';
    const user = config.get<string>('smtp.user');
    const pass = config.get<string>('smtp.pass');

    this.enabled = Boolean(user && pass && this.fromEmail);

    if (!this.enabled) {
      this.transporter = null;
      this.logger.warn({
        msg: 'SMTP not configured — email sending disabled. Set SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL to enable.',
      });
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: config.get<string>('smtp.host'),
      port: config.get<number>('smtp.port') ?? 587,
      secure: false, // STARTTLS on port 587
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      auth: { user, pass },
    });
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  private redactRecipient(value: string): string {
    const [local = '', domain = ''] = value.split('@');
    if (!domain) return '[redacted]';
    return `${local.slice(0, 1)}***@${domain}`;
  }

  /**
   * Send a raw email with optional attachments.
   * Supports inline CID attachments (set cid to reference from HTML as cid:...).
   * Errors are logged and swallowed so callers never throw.
   */
  async send(
    to: string,
    subject: string,
    html: string,
    attachments?: { content: string | Buffer; filename: string; content_type: string; cid?: string }[],
  ): Promise<void> {
    const recipient = this.redactRecipient(to);
    if (!this.transporter) {
      this.logger.warn({ msg: 'Email skipped (SMTP disabled)', recipient, subject });
      return;
    }
    const mailOptions: Mail.Options = {
      from: `${this.fromName} <${this.fromEmail}>`,
      to,
      subject,
      html,
      attachments: attachments?.map((a) => ({
        content: a.content,
        filename: a.filename,
        contentType: a.content_type,
        ...(a.cid ? { cid: a.cid } : {}),
      })),
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({
        msg: 'Failed to send email',
        recipient,
        subject,
        from: this.fromEmail,
        errorMessage: message,
      });
    }
  }

  /**
   * Send email with retry logic for critical emails (OTP, tickets).
   * Retries up to maxRetries times with exponential backoff.
   */
  private async sendWithRetry(
    to: string,
    subject: string,
    html: string,
    maxRetries = 3,
  ): Promise<boolean> {
    const recipient = this.redactRecipient(to);
    if (!this.transporter) {
      this.logger.warn({ msg: 'OTP/critical email skipped (SMTP disabled)', recipient, subject });
      return false;
    }
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const info = await this.transporter.sendMail({
          from: `${this.fromName} <${this.fromEmail}>`,
          to,
          subject,
          html,
        });

        this.logger.log({
          msg: 'Email sent successfully',
          recipient,
          subject,
          messageId: info.messageId,
          attempt,
        });
        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const isLastAttempt = attempt === maxRetries;

        if (isLastAttempt) {
          this.logger.error({
            msg: 'Failed to send email after all retries',
            recipient,
            subject,
            from: this.fromEmail,
            attempts: maxRetries,
            errorMessage: message,
          });
          return false;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, attempt - 1);
        this.logger.warn({
          msg: 'Email send failed, retrying',
          recipient,
          subject,
          attempt,
          nextRetryIn: `${delay}ms`,
          errorMessage: message,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return false;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Auth emails ────────────────────────────────────────────────────────────

  /**
   * Send OTP email with retry logic (critical for user registration).
   * Uses maxRetries=2 so worst-case time stays within Vercel's 30 s function limit:
   *   attempt 1 (up to 20 s) → 1 s backoff → attempt 2 (up to 20 s) → done
   * Returns true if sent successfully, false otherwise.
   */
  async sendOtpEmail(to: string, code: string): Promise<boolean> {
    return this.sendWithRetry(
      to,
      `${code} is your Axon Tickets code`,
      `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="color:#1A3A5C;margin-bottom:4px">Your one-time code</h2>
        <p style="color:#374151;margin-top:0">Enter this code to continue. It only works once and expires in 5 minutes.</p>
        <div style="background:#f7f9fc;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
          <p style="font-size:42px;font-weight:bold;letter-spacing:10px;color:#7C3AED;margin:0">${code}</p>
        </div>
        <p style="color:#64748b;font-size:13px">Did not ask for this code? You can ignore this email. Someone may have typed your email by mistake.</p>
        <p style="color:#64748b;font-size:13px"><strong>Never share this code with anyone</strong>, including Axon Tickets staff.</p>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
      2,
    );
  }

  async sendRegistrationSubmittedEmail(
    to: string,
    attendeeName: string,
    eventTitle: string,
    referenceNumber: string,
    scenario: 'guest' | 'authenticated' | 'activated',
    registrationUrl?: string,
  ): Promise<void> {
    const safeName = this.escapeHtml(attendeeName || 'Registrant');
    const safeEvent = this.escapeHtml(eventTitle);
    const safeReference = this.escapeHtml(referenceNumber);
    const action = registrationUrl
      ? `<p style="margin:24px 0"><a href="${registrationUrl}" style="background:#7C3AED;color:#fff;padding:12px 22px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">View My Registration</a></p>`
      : '';
    const scenarioMessage = scenario === 'guest'
      ? 'You completed checkout as a guest. No customer profile was created, and your email is used only for this transaction and its event updates.'
      : scenario === 'activated'
        ? 'Your verified Axon account is now connected to this transaction, so you can monitor it from My Registrations.'
        : 'Because you submitted while signed in, you can monitor the review from My Registrations without another verification code.';
    await this.send(
      to,
      `We received your transaction — ${safeEvent}`,
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#1a0533;margin-bottom:8px">Your transaction was submitted</h1>
        <p style="color:#374151">Hi ${safeName}, we received your payment proof and attendee details for <strong>${safeEvent}</strong>.</p>
        <div style="background:#f5f3ff;border-left:4px solid #7C3AED;padding:16px;margin:20px 0;color:#4c1d95">
          <strong>Reference:</strong> ${safeReference}<br />
          <strong>Status:</strong> Under review<br />
          <strong>Review time:</strong> 1–2 business days
        </div>
        <p style="color:#374151">The organizer will verify the payment proof. We will email you again when it is approved or if changes are needed. Approved attendees will receive their ticket and QR details by email.</p>
        <p style="color:#374151">${scenarioMessage}</p>
        ${action}
        <p style="color:#64748b;font-size:13px">You do not need to submit another transaction while this one is under review.</p>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }

  // ── Organizer application emails ───────────────────────────────────────────

  async sendOrganizerApplicationReceived(
    to: string,
    firstName: string,
    organizationName: string,
  ): Promise<void> {
    const safeName = this.escapeHtml(firstName);
    const safeOrg = this.escapeHtml(organizationName);
    await this.send(
      to,
      `We received your organizer application — ${safeOrg}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#1A3A5C;margin-bottom:4px">Your application is under review</h1>
        <p style="color:#374151">Hi ${safeName}, thank you for applying to become an Axon Tickets organizer.</p>
        <p style="color:#374151">We received the application for <strong>${safeOrg}</strong>. Our team will review the details you submitted before organizer tools are enabled.</p>
        <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:14px 16px;margin:20px 0;border-radius:0 8px 8px 0;color:#92400e">
          <strong>What happens next:</strong> We check your organizer information, identity details, and contact information. You will receive another email when your application is approved or if we need updated details.
        </div>
        <p style="color:#374151">You do not need to submit again while the application is under review.</p>
        <p style="color:#64748b;font-size:13px">If you did not submit this application, please contact Axon Tickets support.</p>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }

  async sendOrganizerApprovedEmail(
    to: string,
    firstName: string,
    organizationName: string,
    homepageUrl: string,
  ): Promise<void> {
    const safeName = this.escapeHtml(firstName);
    const safeOrg = this.escapeHtml(organizationName);
    await this.send(
      to,
      `Your organizer application was approved — ${safeOrg}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#166534;margin-bottom:4px">You are approved as an organizer</h1>
        <p style="color:#374151">Hi ${safeName}, your application for <strong>${safeOrg}</strong> has been approved.</p>
        <p style="color:#374151">You can now sign in from Axon Tickets and use the organizer tools for your events, attendees, workspace, check-in, transactions, and reports.</p>
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:14px 16px;margin:20px 0;border-radius:0 8px 8px 0;color:#166534">
          Organizer access is limited to the events and data connected to your own organizer account.
        </div>
        <p style="margin:24px 0">
          <a href="${homepageUrl}" style="background:#1A3A5C;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">Go to Axon Tickets</a>
        </p>
        <p style="color:#64748b;font-size:13px">If you need help setting up your first event, reply to this email and our team can guide you.</p>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }

  async sendOrganizerRejectedEmail(
    to: string,
    firstName: string,
    organizationName: string,
    reason: string,
    reapplyUrl: string,
  ): Promise<void> {
    const safeName = this.escapeHtml(firstName);
    const safeOrg = this.escapeHtml(organizationName);
    const safeReason = this.escapeHtml(reason);
    await this.send(
      to,
      `Your organizer application needs attention — ${safeOrg}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#991b1b;margin-bottom:4px">Your application was not approved</h1>
        <p style="color:#374151">Hi ${safeName}, thank you for applying to become an organizer on Axon Tickets. We reviewed the details for <strong>${safeOrg}</strong>, but we are not able to approve it just yet.</p>
        <p style="color:#374151">Here is why:</p>
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 16px;margin:20px 0;border-radius:0 8px 8px 0;color:#991b1b">
          <strong>Reason:</strong> ${safeReason}
        </div>
        <p style="color:#374151">To move forward, you need to go through the registration process again with the correct information. The button below will take you back to the organizer application form, where your previous details are pre-filled so you only need to update what is missing or incorrect.</p>
        <p style="margin:24px 0">
          <a href="${reapplyUrl}" style="background:#1A3A5C;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">Start registration again</a>
        </p>
        <p style="color:#374151">Once you complete the form and verify your email, your updated application will go back to our team for review. You will hear from us within 1–2 business days.</p>
        <p style="color:#64748b;font-size:13px">If you have questions or need help, reply to this email and we will be glad to assist.</p>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }

  async sendOrganizerSuspendedEmail(
    to: string,
    firstName: string,
    organizationName: string,
    reason?: string,
  ): Promise<void> {
    const safeName = this.escapeHtml(firstName);
    const safeOrg = this.escapeHtml(organizationName);
    const reasonBlock = reason
      ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin:24px 0">
           <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.06em">Reason for suspension</p>
           <p style="margin:0;color:#78350f;font-size:15px;line-height:1.6">${this.escapeHtml(reason)}</p>
         </div>`
      : '';
    await this.send(
      to,
      `Important: Your organizer account has been temporarily suspended — ${safeOrg}`,
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">
        <!-- Header -->
        <div style="background:#1A3A5C;padding:28px 32px;border-radius:12px 12px 0 0">
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px">Axon Tickets</p>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">Online Ticketing Platform</p>
        </div>

        <!-- Body -->
        <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">

          <!-- Status banner -->
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:28px;display:flex;align-items:center;gap:10px">
            <span style="font-size:20px">⚠️</span>
            <span style="color:#92400e;font-weight:600;font-size:14px">Your organizer account is temporarily suspended</span>
          </div>

          <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700">Hi ${safeName},</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7">
            We are reaching out to let you know that your organizer account for
            <strong>${safeOrg}</strong> on Axon Tickets has been <strong>temporarily suspended</strong>
            by our team.
          </p>

          ${reasonBlock}

          <!-- What this means -->
          <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:24px 0">
            <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">What this means for you</p>
            <table style="border-collapse:collapse;width:100%">
              <tr>
                <td style="padding:8px 0;vertical-align:top;width:24px;color:#ef4444;font-size:16px">✗</td>
                <td style="padding:8px 0 8px 8px;color:#374151;font-size:14px;line-height:1.6">You will not be able to sign in to your organizer dashboard right now.</td>
              </tr>
              <tr>
                <td style="padding:8px 0;vertical-align:top;color:#ef4444;font-size:16px">✗</td>
                <td style="padding:8px 0 8px 8px;color:#374151;font-size:14px;line-height:1.6">You cannot manage or create events while suspended.</td>
              </tr>
              <tr>
                <td style="padding:8px 0;vertical-align:top;color:#16a34a;font-size:16px">✓</td>
                <td style="padding:8px 0 8px 8px;color:#374151;font-size:14px;line-height:1.6">All your event data, attendee information, and records are <strong>safe and untouched</strong>. Nothing has been deleted.</td>
              </tr>
              <tr>
                <td style="padding:8px 0;vertical-align:top;color:#16a34a;font-size:16px">✓</td>
                <td style="padding:8px 0 8px 8px;color:#374151;font-size:14px;line-height:1.6">This suspension is <strong>temporary</strong>. Your account can be reinstated once the matter is resolved.</td>
              </tr>
            </table>
          </div>

          <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px">
            If you believe this is a mistake, or you have questions about why this happened,
            please get in touch with us. We will review the situation and get back to you as
            soon as possible.
          </p>

          <p style="margin:0 0 28px">
            <a href="mailto:support@axontickets.online"
               style="background:#1A3A5C;color:#ffffff;padding:13px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px">
              Contact our support team
            </a>
          </p>

          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0">
            You can also reply directly to this email and we will receive your message.
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0" />
          <p style="margin:0;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform · <a href="mailto:support@axontickets.online" style="color:#9ca3af">support@axontickets.online</a></p>
        </div>
      </div>`,
    );
  }

  async sendOrganizerReinstatedEmail(
    to: string,
    firstName: string,
    organizationName: string,
    homepageUrl: string,
  ): Promise<void> {
    const safeName = this.escapeHtml(firstName);
    const safeOrg = this.escapeHtml(organizationName);
    await this.send(
      to,
      `Great news — your organizer account has been reinstated — ${safeOrg}`,
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">
        <!-- Header -->
        <div style="background:#1A3A5C;padding:28px 32px;border-radius:12px 12px 0 0">
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px">Axon Tickets</p>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">Online Ticketing Platform</p>
        </div>

        <!-- Body -->
        <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">

          <!-- Status banner -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:28px">
            <span style="font-size:20px">✅</span>
            <span style="color:#166534;font-weight:600;font-size:14px;margin-left:8px">Your organizer account is active again</span>
          </div>

          <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700">Hi ${safeName},</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7">
            We are happy to let you know that your organizer account for
            <strong>${safeOrg}</strong> on Axon Tickets has been <strong>reinstated</strong>.
            You now have full access again.
          </p>

          <!-- What you can do -->
          <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:24px 0">
            <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">You can now</p>
            <table style="border-collapse:collapse;width:100%">
              <tr>
                <td style="padding:7px 0;vertical-align:top;width:24px;color:#16a34a;font-size:16px">✓</td>
                <td style="padding:7px 0 7px 8px;color:#374151;font-size:14px;line-height:1.6">Sign in to your organizer dashboard</td>
              </tr>
              <tr>
                <td style="padding:7px 0;vertical-align:top;color:#16a34a;font-size:16px">✓</td>
                <td style="padding:7px 0 7px 8px;color:#374151;font-size:14px;line-height:1.6">Create and manage your events</td>
              </tr>
              <tr>
                <td style="padding:7px 0;vertical-align:top;color:#16a34a;font-size:16px">✓</td>
                <td style="padding:7px 0 7px 8px;color:#374151;font-size:14px;line-height:1.6">View attendees, check-in, and track registrations</td>
              </tr>
              <tr>
                <td style="padding:7px 0;vertical-align:top;color:#16a34a;font-size:16px">✓</td>
                <td style="padding:7px 0 7px 8px;color:#374151;font-size:14px;line-height:1.6">Access your workspace, reports, and all your previous data</td>
              </tr>
            </table>
          </div>

          <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 28px">
            Everything is exactly as you left it. You can sign in now and pick up right where you stopped.
          </p>

          <p style="margin:0 0 28px">
            <a href="${homepageUrl}"
               style="background:#7C3AED;color:#ffffff;padding:13px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px">
              Sign in to your dashboard
            </a>
          </p>

          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0">
            If you need help or have any questions, reply to this email and our team will be glad to assist.
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0" />
          <p style="margin:0;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform · <a href="mailto:support@axontickets.online" style="color:#9ca3af">support@axontickets.online</a></p>
        </div>
      </div>`,
    );
  }

  async sendOrganizerDeletedEmail(
    to: string,
    firstName: string,
    organizationName: string,
  ): Promise<void> {
    const safeName = this.escapeHtml(firstName);
    const safeOrg = this.escapeHtml(organizationName);
    await this.send(
      to,
      `Your organizer account has been removed — ${safeOrg}`,
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">
        <!-- Header -->
        <div style="background:#1A3A5C;padding:28px 32px;border-radius:12px 12px 0 0">
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px">Axon Tickets</p>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">Online Ticketing Platform</p>
        </div>

        <!-- Body -->
        <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">

          <!-- Status banner -->
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin-bottom:28px">
            <span style="font-size:20px">🗑️</span>
            <span style="color:#991b1b;font-weight:600;font-size:14px;margin-left:8px">Your organizer account has been permanently removed</span>
          </div>

          <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700">Hi ${safeName},</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7">
            We are writing to let you know that the organizer account for
            <strong>${safeOrg}</strong> on Axon Tickets has been <strong>permanently removed</strong>
            by our team. This action has already taken effect.
          </p>

          <!-- What this means -->
          <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:24px 0">
            <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">What this means</p>
            <table style="border-collapse:collapse;width:100%">
              <tr>
                <td style="padding:8px 0;vertical-align:top;width:24px;color:#ef4444;font-size:16px">✗</td>
                <td style="padding:8px 0 8px 8px;color:#374151;font-size:14px;line-height:1.6">The organizer account and all its associated event data have been removed.</td>
              </tr>
              <tr>
                <td style="padding:8px 0;vertical-align:top;color:#ef4444;font-size:16px">✗</td>
                <td style="padding:8px 0 8px 8px;color:#374151;font-size:14px;line-height:1.6">You will no longer be able to log in as an organizer or access the organizer dashboard.</td>
              </tr>
              <tr>
                <td style="padding:8px 0;vertical-align:top;color:#16a34a;font-size:16px">✓</td>
                <td style="padding:8px 0 8px 8px;color:#374151;font-size:14px;line-height:1.6">Your <strong>personal Axon Tickets account</strong> (used to buy or attend events) has <strong>not been affected</strong>.</td>
              </tr>
            </table>
          </div>

          <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px">
            If you believe this was done in error, or if you have any questions about what
            happened, please do not hesitate to contact us. We will be happy to look into it
            for you and explain the next steps.
          </p>

          <p style="margin:0 0 28px">
            <a href="mailto:support@axontickets.online"
               style="background:#1A3A5C;color:#ffffff;padding:13px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;font-size:15px">
              Contact our support team
            </a>
          </p>

          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0">
            You can also reply directly to this email and we will receive your message.
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0" />
          <p style="margin:0;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform · <a href="mailto:support@axontickets.online" style="color:#9ca3af">support@axontickets.online</a></p>
        </div>
      </div>`,
    );
  }

  // ── Registration emails (Phase 2+) ─────────────────────────────────────────

  async sendRegistrationConfirmation(
    to: string,
    firstName: string,
    referenceNumber: string,
    eventTitle: string,
    bankName: string,
    bankAccountNumber: string,
    bankAccountName: string,
    registrationUrl?: string,
  ): Promise<void> {
    const viewLink = registrationUrl
      ? `<p style="margin-top:16px">
           <a href="${registrationUrl}" style="color:#EA6C00;text-decoration:none;font-weight:600">View your registration →</a>
         </p>`
      : '';
    await this.send(
      to,
      `Your spot is saved — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:4px">Your spot is saved!</h1>
        <h2 style="margin-top:0;color:#1A3A5C">${eventTitle}</h2>
        <p style="color:#374151">Hi ${firstName}, we got your registration. Here is what to do next.</p>

        <div style="background:#f7f9fc;border-radius:12px;padding:16px;margin:20px 0;border-left:4px solid #7C3AED">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Your Reference Number</p>
          <p style="font-size:24px;font-weight:bold;color:#7C3AED;margin:0;letter-spacing:2px">${referenceNumber}</p>
          <p style="margin:8px 0 0;color:#64748b;font-size:13px">
            Write this number in the transfer note or remarks when you pay.
          </p>
        </div>

        <h3 style="color:#1A3A5C">Step 1 — Send your payment</h3>
        <p style="color:#374151;font-size:14px">Transfer the exact amount to this bank account:</p>
        <table style="border-collapse:collapse;width:100%;background:#f9fafb;border-radius:8px">
          <tr><td style="padding:10px 12px;color:#64748b;font-size:14px;width:40%">Bank</td><td style="padding:10px 12px;font-weight:600;font-size:14px">${bankName}</td></tr>
          <tr style="border-top:1px solid #e5e7eb"><td style="padding:10px 12px;color:#64748b;font-size:14px">Account Number</td><td style="padding:10px 12px;font-weight:600;font-size:14px">${bankAccountNumber}</td></tr>
          <tr style="border-top:1px solid #e5e7eb"><td style="padding:10px 12px;color:#64748b;font-size:14px">Account Name</td><td style="padding:10px 12px;font-weight:600;font-size:14px">${bankAccountName}</td></tr>
        </table>

        <h3 style="color:#1A3A5C">Step 2 — Upload your payment screenshot</h3>
        <p style="color:#374151;font-size:14px">
          After sending the money, take a screenshot of your payment confirmation and upload it using the button below.
          Our team checks it within <strong>24 hours</strong>.
        </p>

        <h3 style="color:#1A3A5C">Step 3 — Get your QR ticket</h3>
        <p style="color:#374151;font-size:14px">
          Once we approve your payment, we will send your QR ticket to this email.
          Show the QR code at the entrance on the day of the event.
        </p>

        ${viewLink}
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }

  async sendFreeRegistrationConfirmation(
    to: string,
    firstName: string,
    referenceNumber: string,
    eventTitle: string,
    registrationUrl?: string,
  ): Promise<void> {
    const safeTitle = this.escapeHtml(eventTitle);
    const safeRef = this.escapeHtml(referenceNumber);
    const viewLink = registrationUrl
      ? `<p style="margin-top:16px"><a href="${registrationUrl}" style="color:#EA6C00;text-decoration:none;font-weight:600">View your registration →</a></p>`
      : '';
    await this.send(
      to,
      `You're registered — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:4px">You're registered!</h1>
        <h2 style="margin-top:0;color:#1A3A5C">${safeTitle}</h2>
        <p style="color:#374151">Hi ${this.escapeHtml(firstName)}, we received your registration for this event.</p>

        <div style="background:#f7f9fc;border-radius:12px;padding:16px;margin:20px 0;border-left:4px solid #7C3AED">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Your Reference Number</p>
          <p style="font-size:24px;font-weight:bold;color:#7C3AED;margin:0;letter-spacing:2px">${safeRef}</p>
        </div>

        <h3 style="color:#1A3A5C">What happens next?</h3>
        <ol style="color:#374151;font-size:14px;line-height:1.8">
          <li>The organizer will review your registration.</li>
          <li>We will send a confirmation to this email address.</li>
          <li>Your ticket will be in that email — show it at the entrance. No printing needed.</li>
        </ol>

        ${viewLink}
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }

  async sendPaymentReminderEmail(
    to: string,
    firstName: string,
    referenceNumber: string,
    eventTitle: string,
    registrationUrl: string,
  ): Promise<void> {
    const safeTitle = this.escapeHtml(eventTitle);
    const safeRef = this.escapeHtml(referenceNumber);
    await this.send(
      to,
      `Action needed — your spot for ${eventTitle} expires soon`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#EA6C00;margin-bottom:4px">Your spot expires soon</h1>
        <h2 style="margin-top:0;color:#1A3A5C">${safeTitle}</h2>
        <p style="color:#374151">Hi ${this.escapeHtml(firstName)}, your registration is reserved but we have not received your payment proof yet.</p>

        <div style="background:#fff7ed;border-radius:12px;padding:16px;margin:20px 0;border-left:4px solid #EA6C00">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Reference Number</p>
          <p style="font-size:24px;font-weight:bold;color:#EA6C00;margin:0;letter-spacing:2px">${safeRef}</p>
          <p style="margin:8px 0 0;color:#92400e;font-size:13px">Your spot will be released 24 hours after you registered if no proof is uploaded.</p>
        </div>

        <p style="color:#374151;font-size:14px">Upload your payment screenshot now to secure your place:</p>
        <p style="margin-top:16px">
          <a href="${registrationUrl}" style="background:#7C3AED;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;display:inline-block">Upload payment proof →</a>
        </p>

        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }

  async sendProofReceivedNotification(
    to: string,
    firstName: string,
    referenceNumber: string,
    eventTitle: string,
  ): Promise<void> {
    await this.send(
      to,
      `We got your payment screenshot — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1A3A5C">${eventTitle}</h2>
        <p style="color:#374151">Hi ${firstName}, we received your payment screenshot for reference <strong style="color:#7C3AED">${referenceNumber}</strong>.</p>
        <p style="color:#374151">Our team is checking it now. This usually takes up to <strong>24 hours</strong>.</p>
        <p style="color:#374151">Once approved, we will send your QR ticket to this email. You just need to show it at the door — no printing needed!</p>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }

  async sendQrCodeEmail(
    to: string,
    firstName: string,
    eventTitle: string,
    eventDate: string,
    eventVenue: string,
    attendees: { firstName: string; lastName: string; email: string; qrToken: string | null }[],
    receipt?: {
      isFree?: boolean;
      referenceNumber?: string;
      transactionDate?: string;
      paymentMethod?: string;
      tierName?: string;
      quantity?: number;
      unitPrice?: number;
      subtotal?: number;
      fees?: number;
      discount?: number;
      referralCode?: string;
      total?: number;
      organizerName?: string;
      eventCity?: string;
    },
  ): Promise<void> {
    // Build one PNG attachment per attendee.
    // Each QR is embedded inline (via CID) so it displays directly in the email body
    // on every device — Android, iPhone, desktop — without loading any external URL.
    // The same buffer is also attached as a .png file the user can download and open.
    const attachments: { content: Buffer; filename: string; content_type: string; cid?: string }[] = [];

    const rows = await Promise.all(
      attendees.map(async (a, index) => {
        if (!a.qrToken) {
          return `<tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:16px;vertical-align:top">
              <strong style="color:#1A3A5C">${a.firstName} ${a.lastName}</strong><br/>
              <span style="color:#64748b;font-size:13px">${a.email}</span>
            </td>
            <td style="padding:16px;text-align:center;color:#dc2626;font-size:13px">
              QR not generated yet
            </td>
          </tr>`;
        }

        const pngBuffer = await this.qrService.generateQrPng(a.qrToken);
        const safeName = `${a.firstName}-${a.lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, '_');
        const cid = `qr-${index}-${safeName}@axontickets`;

        // Mail clients (Gmail included) hide any part with a Content-ID from the
        // visible attachment list, regardless of Content-Disposition — so a single
        // cid-tagged part can only ever be "inline", never "downloadable" at the
        // same time. Send the PNG twice: once for inline embedding (cid set),
        // once more as a plain attachment (no cid) so it shows up as a real
        // downloadable file too.
        attachments.push({
          content: pngBuffer,
          filename: `ticket-qr-${safeName}.png`,
          content_type: 'image/png',
          cid,
        });
        attachments.push({
          content: pngBuffer,
          filename: `ticket-qr-${safeName}.png`,
          content_type: 'image/png',
        });

        return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:16px;vertical-align:middle">
            <strong style="color:#1A3A5C;font-size:16px">${a.firstName} ${a.lastName}</strong><br/>
            <span style="color:#64748b;font-size:13px">${a.email}</span>
          </td>
          <td style="padding:16px;text-align:center">
            <img src="cid:${cid}" alt="QR Code for ${a.firstName} ${a.lastName}"
                 width="200" height="200"
                 style="display:block;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px" />
            <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#1A3A5C;text-align:center">
              ${a.firstName} ${a.lastName}
            </p>
          </td>
        </tr>`;
      }),
    );

    // ── Receipt section ──────────────────────────────────────────────────────
    const fmt = (n: number) =>
      'PHP ' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const receiptRows: string[] = [];
    if (receipt?.organizerName)
      receiptRows.push(`<tr><td style="padding:7px 0;color:#6b7280;font-size:14px;width:50%">Organizer</td><td style="padding:7px 0;font-size:14px;font-weight:600;color:#111827;text-align:right">${this.escapeHtml(receipt.organizerName)}</td></tr>`);
    if (receipt?.tierName)
      receiptRows.push(`<tr><td style="padding:7px 0;color:#6b7280;font-size:14px">Ticket tier</td><td style="padding:7px 0;font-size:14px;font-weight:600;color:#111827;text-align:right">${this.escapeHtml(receipt.tierName)}</td></tr>`);
    if (receipt?.quantity)
      receiptRows.push(`<tr><td style="padding:7px 0;color:#6b7280;font-size:14px">Quantity</td><td style="padding:7px 0;font-size:14px;font-weight:600;color:#111827;text-align:right">${receipt.quantity}</td></tr>`);
    if (receipt?.unitPrice !== undefined)
      receiptRows.push(`<tr><td style="padding:7px 0;color:#6b7280;font-size:14px">Price per ticket</td><td style="padding:7px 0;font-size:14px;font-weight:600;color:#111827;text-align:right">${fmt(receipt.unitPrice)}</td></tr>`);
    if (receipt?.subtotal !== undefined)
      receiptRows.push(`<tr><td style="padding:7px 0;color:#6b7280;font-size:14px">Subtotal</td><td style="padding:7px 0;font-size:14px;color:#374151;text-align:right">${fmt(receipt.subtotal)}</td></tr>`);
    if (receipt?.fees !== undefined)
      receiptRows.push(`<tr><td style="padding:7px 0;color:#6b7280;font-size:14px">Service fee</td><td style="padding:7px 0;font-size:14px;color:#374151;text-align:right">${fmt(receipt.fees)}</td></tr>`);
    if (receipt?.discount && receipt.discount > 0)
      receiptRows.push(`<tr><td style="padding:7px 0;color:#047857;font-size:14px">Referral discount${receipt.referralCode ? ` (${this.escapeHtml(receipt.referralCode)})` : ''}</td><td style="padding:7px 0;font-size:14px;color:#047857;text-align:right">-${fmt(receipt.discount)}</td></tr>`);
    if (receipt?.total !== undefined)
      receiptRows.push(`<tr style="border-top:2px solid #e5e7eb"><td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#111827">Total paid</td><td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#111827;text-align:right">${fmt(receipt.total)}</td></tr>`);
    if (receipt?.paymentMethod)
      receiptRows.push(`<tr><td style="padding:4px 0 7px;color:#6b7280;font-size:14px">Payment method</td><td style="padding:4px 0 7px;font-size:14px;font-weight:600;color:#111827;text-align:right">${this.escapeHtml(receipt.paymentMethod)}</td></tr>`);
    if (receipt?.transactionDate)
      receiptRows.push(`<tr><td style="padding:7px 0;color:#6b7280;font-size:14px">Transaction date</td><td style="padding:7px 0;font-size:14px;font-weight:600;color:#111827;text-align:right">${receipt.transactionDate}</td></tr>`);
    if (receipt?.referenceNumber)
      receiptRows.push(`<tr><td style="padding:7px 0;color:#6b7280;font-size:14px">Reference #</td><td style="padding:7px 0;font-size:14px;font-weight:700;color:#7C3AED;text-align:right">${this.escapeHtml(receipt.referenceNumber)}</td></tr>`);

    const receiptSection = receiptRows.length > 0 ? `
      <!-- Receipt -->
      <div style="margin:28px 0">
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em">Purchase summary</p>
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:10px;padding:4px 16px;display:block">
          <tbody style="display:table;width:100%;padding:4px 16px">
            ${receiptRows.join('\n')}
          </tbody>
        </table>
      </div>` : '';

    await this.send(
      to,
      `Your ticket is ready — ${eventTitle}`,
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:0;background:#f8fafc">

        <!-- Header -->
        <div style="background:#1A3A5C;padding:28px 32px;text-align:center">
          <p style="margin:0;font-size:13px;color:#93c5fd;letter-spacing:1px;text-transform:uppercase">Axon Tickets</p>
          <p style="margin:10px 0 0;font-size:26px;font-weight:bold;color:#ffffff">Your ticket is ready!</p>
        </div>

        <!-- Body -->
        <div style="background:#ffffff;padding:28px 32px">

          <p style="font-size:16px;color:#111827;margin-top:0">
            Hi <strong>${this.escapeHtml(firstName)}</strong>, great news — ${receipt?.isFree ? 'your registration has been approved' : 'your payment has been confirmed'} and your ticket is all set. Everything you need to get in is right here in this email.
          </p>

          <!-- Event summary -->
          <table style="width:100%;border-collapse:collapse;background:#f0f4ff;border-radius:10px;padding:0;margin-bottom:24px">
            <tr>
              <td style="padding:16px 20px">
                <p style="margin:0;font-size:18px;font-weight:bold;color:#1A3A5C">${this.escapeHtml(eventTitle)}</p>
                <p style="margin:6px 0 0;font-size:14px;color:#374151">
                  Date: <strong>${this.escapeHtml(eventDate)}</strong>
                </p>
                <p style="margin:4px 0 0;font-size:14px;color:#374151">
                  Venue: <strong>${this.escapeHtml(eventVenue)}${receipt?.eventCity ? ', ' + this.escapeHtml(receipt.eventCity) : ''}</strong>
                </p>
              </td>
            </tr>
          </table>

          <!-- QR ticket(s) -->
          <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1A3A5C">Your Entry Pass${rows.length > 1 ? 'es' : ''}</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
            <thead>
              <tr style="background:#f7f9fc">
                <th style="padding:12px 16px;text-align:left;color:#1A3A5C;font-size:13px;font-weight:600">Attendee</th>
                <th style="padding:12px 16px;text-align:center;color:#1A3A5C;font-size:13px;font-weight:600">QR Code — show this at the entrance</th>
              </tr>
            </thead>
            <tbody>${rows.join('')}</tbody>
          </table>

          <!-- Tip box -->
          <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:14px 16px;margin-top:16px;border-radius:0 8px 8px 0">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6">
              <strong>Can't see the QR code above?</strong> No worries. The QR code is also attached to this email as an image file (look for a <strong>.png</strong> attachment). Open it, save it to your phone's photo gallery, or print it. If you cannot find this email, please check your <strong>Spam</strong> or <strong>Promotions</strong> folder.
            </p>
          </div>

          ${receiptSection}

          <!-- How to use your ticket -->
          <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:18px 20px;margin-top:24px">
            <p style="margin:0 0 12px;font-size:16px;font-weight:bold;color:#166534">
              How to use your ticket
            </p>
            <table style="border-collapse:collapse;width:100%">
              <tr>
                <td style="padding:5px 0;vertical-align:top;width:28px;color:#15803d;font-size:15px;font-weight:bold">1.</td>
                <td style="padding:5px 0;color:#15803d;font-size:14px;line-height:1.7">
                  <strong>Find your QR code</strong> — scroll up to find it above the purchase summary. Each attendee has their own unique code.
                </td>
              </tr>
              <tr>
                <td style="padding:5px 0;vertical-align:top;color:#15803d;font-size:15px;font-weight:bold">2.</td>
                <td style="padding:5px 0;color:#15803d;font-size:14px;line-height:1.7">
                  <strong>Save it to your phone</strong> — press and hold the QR code image, then tap <em>Save to Photos</em> (iPhone) or <em>Download image</em> (Android). Or simply take a screenshot.
                </td>
              </tr>
              <tr>
                <td style="padding:5px 0;vertical-align:top;color:#15803d;font-size:15px;font-weight:bold">3.</td>
                <td style="padding:5px 0;color:#15803d;font-size:14px;line-height:1.7">
                  <strong>Show it at the entrance</strong> — on the day of the event, open your saved photo and show it to the staff. Your phone screen is enough; no printing required.
                </td>
              </tr>
              <tr>
                <td style="padding:5px 0;vertical-align:top;color:#15803d;font-size:15px;font-weight:bold">4.</td>
                <td style="padding:5px 0;color:#15803d;font-size:14px;line-height:1.7">
                  <strong>Prefer paper?</strong> — you can print this email or open the attached image file and print that instead. Both work perfectly at the entrance.
                </td>
              </tr>
            </table>
          </div>

          <p style="font-size:13px;color:#64748b;margin-top:20px">
            You can view your ticket anytime at
            <a href="https://axontickets.online/account/tickets" style="color:#7C3AED;text-decoration:none">axontickets.online</a>
            under <strong>My Events</strong>. See you at the event!
          </p>

        </div>

        <!-- Footer -->
        <div style="background:#f1f5f9;padding:14px 32px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">Axon Tickets &middot; Online Ticketing Platform &middot; axontickets.online</p>
        </div>

      </div>`,
      attachments,
    );
  }

  async sendCancellationEmail(
    to: string,
    firstName: string,
    referenceNumber: string,
    eventTitle: string,
    reason: string,
    reRegisterUrl?: string,
  ): Promise<void> {
    const reRegisterBlock = reRegisterUrl
      ? `<p style="margin:24px 0">
           <a href="${reRegisterUrl}" style="background:#1A3A5C;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">Register Again</a>
         </p>`
      : '';
    await this.send(
      to,
      `Registration cancelled — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1A3A5C">${eventTitle}</h2>
        <p style="color:#374151">Hi ${firstName},</p>
        <p style="color:#374151">Your registration <strong style="color:#7C3AED">${referenceNumber}</strong> has been cancelled.</p>
        <div style="background:#fef9f0;border-left:4px solid #EA6C00;padding:12px 16px;margin:16px 0;color:#92400e;border-radius:0 8px 8px 0">
          <strong>Reason:</strong> ${reason}
        </div>
        <p style="color:#374151">If this was a mistake or if you want to register again, use the button below.</p>
        ${reRegisterBlock}
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }

  async sendRejectionEmail(
    to: string,
    firstName: string,
    referenceNumber: string,
    eventTitle: string,
    reason: string,
    registrationUrl: string,
  ): Promise<void> {
    await this.send(
      to,
      `We could not verify your payment — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1A3A5C">${eventTitle}</h2>
        <p style="color:#374151">Hi ${firstName},</p>
        <p style="color:#374151">We checked your payment screenshot for reference <strong style="color:#7C3AED">${referenceNumber}</strong>, but we could not approve it.</p>
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;color:#991b1b;border-radius:0 8px 8px 0">
          <strong>Reason:</strong> ${reason}
        </div>
        <p style="color:#374151">Please upload a new, clearer screenshot of your payment. Make sure it shows:</p>
        <ul style="color:#374151;font-size:14px;padding-left:20px">
          <li>The amount transferred</li>
          <li>The date and time of the transfer</li>
          <li>The recipient's name or account number</li>
        </ul>
        <p style="margin:24px 0">
          <a href="${registrationUrl}" style="background:#7C3AED;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">Upload a New Screenshot</a>
        </p>
        <p style="color:#64748b;font-size:13px">If you need help, reply to this email or contact our support team.</p>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }
}
