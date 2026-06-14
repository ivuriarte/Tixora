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
   * Errors are logged and swallowed so callers never throw.
   */
  async send(
    to: string,
    subject: string,
    html: string,
    attachments?: { content: string | Buffer; filename: string; content_type: string }[],
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
    const apiUrl = this.config.get<string>('apiUrl') ?? '';

    const attachments: { content: Buffer; filename: string; content_type: string }[] = [];
    const rows = await Promise.all(
      attendees.map(async (a) => {
        if (a.qrToken) {
          const svgBuffer = await this.qrService.generateBrandedTicketSvg(
            a.qrToken,
            a.firstName,
            a.lastName,
          );
          const safeName = `${a.firstName}-${a.lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, '_');
          attachments.push({
            content: svgBuffer,
            filename: `axon-tickets-${safeName}.svg`,
            content_type: 'image/svg+xml',
          });
        }

        const qrCell = a.qrToken
          ? `<img src="${apiUrl}/qr/${encodeURIComponent(a.qrToken)}" alt="QR Code" width="180" height="180" style="display:block" />`
          : '<span style="color:#dc2626">No QR generated</span>';

        return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:12px;vertical-align:top">
            <strong>${a.firstName} ${a.lastName}</strong><br />
            <span style="color:#64748b;font-size:13px">${a.email}</span>
          </td>
          <td style="padding:12px;text-align:center">${qrCell}</td>
        </tr>`;
      }),
    );

    await this.send(
      to,
      `Your QR code is ready — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:4px">Your ticket is ready!</h1>
        <h2 style="margin-top:0;color:#1A3A5C">${eventTitle}</h2>
        <p style="color:#64748b">${eventDate} · ${eventVenue}</p>
        <p style="color:#374151">Hi ${firstName}, your payment has been approved!</p>
        <p style="color:#374151">${attendees.length === 1 ? 'Here is your QR ticket. Just show this to the staff at the entrance — no printing needed.' : 'Here are your QR tickets. Each attendee should show their own QR code at the entrance.'}</p>
        <p style="background:#fef3c7;border-radius:8px;padding:12px 16px;color:#92400e;font-size:13px">
          <strong>Save a screenshot of your QR code</strong> so you can find it easily on event day.
          You can also view your ticket anytime under My Tickets on the Axon Tickets website.
        </p>
        <p style="color:#64748b;font-size:13px">
          Your ticket card is also attached to this email as a file you can save.
        </p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead>
            <tr style="background:#f7f9fc">
              <th style="padding:12px;text-align:left;color:#1A3A5C">Attendee</th>
              <th style="padding:12px;text-align:center;color:#1A3A5C">QR Code</th>
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
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
