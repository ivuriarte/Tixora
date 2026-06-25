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
    if (!this.transporter) {
      this.logger.warn({ msg: 'Email skipped (SMTP disabled)', to, subject });
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
        to,
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
    if (!this.transporter) {
      this.logger.warn({ msg: 'OTP/critical email skipped (SMTP disabled)', to, subject });
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
          to,
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
            to,
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
          to,
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
      `Organizer application needs updates — ${safeOrg}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#991b1b;margin-bottom:4px">Your application needs updates</h1>
        <p style="color:#374151">Hi ${safeName}, we reviewed the organizer application for <strong>${safeOrg}</strong>. We cannot approve it yet.</p>
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 16px;margin:20px 0;border-radius:0 8px 8px 0;color:#991b1b">
          <strong>Reason:</strong> ${safeReason}
        </div>
        <p style="color:#374151">You can update the same application record instead of starting from zero. The form will load your latest submitted details so you only need to change what is necessary.</p>
        <p style="margin:24px 0">
          <a href="${reapplyUrl}" style="background:#1A3A5C;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">Update application</a>
        </p>
        <p style="color:#64748b;font-size:13px">After you resubmit, we will ask you to verify by email again and then review the updated details.</p>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
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
          </td>
        </tr>`;
      }),
    );

    const isSingle = attendees.length === 1;

    await this.send(
      to,
      `✅ Your ticket is ready! — ${eventTitle}`,
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:0;background:#f8fafc">

        <!-- Header -->
        <div style="background:#1A3A5C;padding:28px 32px;text-align:center">
          <p style="margin:0;font-size:13px;color:#93c5fd;letter-spacing:1px;text-transform:uppercase">Axon Tickets</p>
          <h1 style="margin:8px 0 0;font-size:28px;color:#ffffff">🎉 Your ticket is ready!</h1>
        </div>

        <!-- Body -->
        <div style="background:#ffffff;padding:32px">

          <p style="font-size:16px;color:#1A3A5C;margin-top:0">
            Hi <strong>${firstName}</strong>, your payment was approved!
          </p>
          <p style="font-size:15px;color:#374151;margin-top:0">
            Your ${isSingle ? 'ticket' : 'tickets'} for <strong>${eventTitle}</strong> ${isSingle ? 'is' : 'are'} below.
          </p>
          <p style="color:#64748b;font-size:14px;margin-top:0">
            📅 ${eventDate} &nbsp;|&nbsp; 📍 ${eventVenue}
          </p>

          <!-- What to do box -->
          <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:20px;margin:24px 0">
            <p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:#166534">
              What do I do with this ticket?
            </p>
            <ol style="margin:0;padding-left:20px;color:#15803d;font-size:14px;line-height:1.8">
              <li>Find your QR code below in this email.</li>
              <li><strong>Screenshot or save</strong> the QR code to your phone's photo gallery.</li>
              <li>On event day, <strong>show the QR code to the staff at the entrance.</strong></li>
              <li>No printing needed — your phone screen is enough!</li>
            </ol>
          </div>

          <!-- QR table -->
          <table style="width:100%;border-collapse:collapse;margin-top:8px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
            <thead>
              <tr style="background:#f7f9fc">
                <th style="padding:12px 16px;text-align:left;color:#1A3A5C;font-size:13px;font-weight:600">Attendee Name</th>
                <th style="padding:12px 16px;text-align:center;color:#1A3A5C;font-size:13px;font-weight:600">QR Code (show at entrance)</th>
              </tr>
            </thead>
            <tbody>${rows.join('')}</tbody>
          </table>

          <!-- Tip box -->
          <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:14px 16px;margin-top:24px;border-radius:0 8px 8px 0">
            <p style="margin:0;font-size:13px;color:#92400e">
              <strong>💡 Tip:</strong> Can't see the QR code above?
              The QR code is also saved as a <strong>.png image file</strong> attached to this email.
              Open the attachment to view and save it to your phone.
              If you still can't find it, check your <strong>Spam</strong> or <strong>Promotions</strong> folder.
            </p>
          </div>

          <p style="font-size:13px;color:#64748b;margin-top:24px">
            You can also view your ticket anytime by logging in to
            <a href="https://axontickets.online/account/tickets" style="color:#7C3AED">axontickets.online</a>
            and going to <strong>My Events</strong>.
          </p>

        </div>

        <!-- Footer -->
        <div style="background:#f1f5f9;padding:16px 32px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">Axon Tickets · Online Ticketing Platform · axontickets.online</p>
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
