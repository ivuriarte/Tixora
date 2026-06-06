import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import { QrService } from '../qr/qr.service';

@Injectable()
export class EmailService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromName: string;
  private readonly fromEmail: string;

  constructor(
    private readonly config: ConfigService,
    private readonly qrService: QrService,
  ) {
    this.fromName = config.get<string>('smtp.fromName') ?? 'Axon Tickets';
    this.fromEmail = config.get<string>('smtp.fromEmail') ?? '';

    this.transporter = nodemailer.createTransport({
      host: config.get<string>('smtp.host'),
      port: config.get<number>('smtp.port') ?? 587,
      secure: false, // STARTTLS on port 587
      // Hard limits so a slow/unreachable SMTP server never hangs the Vercel function
      connectionTimeout: 5_000,  // 5 s to establish TCP connection
      greetingTimeout: 5_000,    // 5 s for SMTP greeting after connection
      socketTimeout: 10_000,     // 10 s idle socket before giving up
      auth: {
        user: config.get<string>('smtp.user'),
        pass: config.get<string>('smtp.pass'),
      },
    });

    // Log SMTP config on startup so misconfiguration is immediately visible
    this.logger.log({
      msg: 'SMTP transporter initialised',
      host: config.get<string>('smtp.host'),
      port: config.get<number>('smtp.port') ?? 587,
      user: config.get<string>('smtp.user'),
      fromEmail: this.fromEmail,
    });
  }

  onModuleDestroy(): void {
    this.transporter.close();
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
      'Your Axon Tickets verification code',
      `<div style="font-family:sans-serif;max-width:400px;margin:0 auto">
        <h2 style="color:#1A3A5C">Verify your email</h2>
        <p>Your verification code is:</p>
        <p style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#EA6C00">${code}</p>
        <p style="color:#64748b;font-size:14px">This code expires in 5 minutes. Do not share it with anyone.</p>
      </div>`,
      2, // maxRetries — keep total time < 30 s (Vercel function limit)
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
      `Registration confirmed — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#EA6C00;margin-bottom:4px">You're registered!</h1>
        <h2 style="margin-top:0;color:#1A3A5C">${eventTitle}</h2>
        <p>Hi ${firstName}, your registration has been received.</p>
        <div style="background:#f7f9fc;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0 0 8px"><strong>Reference Number:</strong>
            <span style="font-size:18px;font-weight:bold;color:#EA6C00">${referenceNumber}</span>
          </p>
          <p style="margin:0;color:#64748b;font-size:14px">
            Use this reference number when making your payment.
          </p>
        </div>
        <h3 style="color:#1A3A5C">Payment Instructions</h3>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px 0;color:#64748b">Bank</td><td style="padding:8px 0;font-weight:600">${bankName}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Account Number</td><td style="padding:8px 0;font-weight:600">${bankAccountNumber}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Account Name</td><td style="padding:8px 0;font-weight:600">${bankAccountName}</td></tr>
        </table>
        <p style="color:#64748b;font-size:14px;margin-top:16px">
          After payment, upload your proof of payment via the link below.
          Our team reviews proofs within <strong>24 hours</strong>.
          Your QR code will be emailed to you once payment is verified.
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
      `Payment proof received — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1A3A5C">${eventTitle}</h2>
        <p>Hi ${firstName}, we have received your payment proof for reference <strong>${referenceNumber}</strong>.</p>
        <p>Our team will verify your payment within <strong>24 hours</strong>.
           You will receive another email with your QR code once approved.</p>
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
        <h1 style="color:#EA6C00;margin-bottom:4px">Payment verified!</h1>
        <h2 style="margin-top:0;color:#1A3A5C">${eventTitle}</h2>
        <p style="color:#64748b">${eventDate} · ${eventVenue}</p>
        <p>Hi ${firstName}, ${attendees.length === 1 ? 'here is your QR code. Show it at the door.' : 'here are your QR codes. Show them at the door.'}</p>
        <p style="color:#64748b;font-size:13px">
          Your branded ticket card(s) are also attached to this email.
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
        <p>Hi ${firstName},</p>
        <p>Your registration <strong>${referenceNumber}</strong> has been cancelled.</p>
        <div style="background:#fef9f0;border-left:4px solid #EA6C00;padding:12px 16px;margin:16px 0;color:#92400e">
          <strong>Reason:</strong> ${reason}
        </div>
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
      `Payment proof needs attention — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1A3A5C">${eventTitle}</h2>
        <p>Hi ${firstName},</p>
        <p>We reviewed your payment proof for reference <strong>${referenceNumber}</strong> and could not verify it.</p>
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;color:#991b1b">
          <strong>Reason:</strong> ${reason}
        </div>
        <p>Please re-upload a clearer proof of payment using the link below.</p>
        <p style="margin:24px 0">
          <a href="${registrationUrl}" style="background:#EA6C00;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">Re-upload Proof</a>
        </p>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }
}
