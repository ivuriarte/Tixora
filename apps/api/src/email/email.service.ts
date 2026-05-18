import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromName: string;
  private readonly fromEmail: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(config.get<string>('resend.apiKey'));
    this.fromName = config.get<string>('resend.fromName') ?? 'Axon Tickets';
    this.fromEmail = config.get<string>('resend.fromEmail') ?? '';
  }

  /**
   * Send a raw email. Errors are logged and swallowed so callers never throw.
   */
  async send(to: string, subject: string, html: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: `${this.fromName} <${this.fromEmail}>`,
      to,
      subject,
      html,
    });
    if (error) {
      this.logger.warn({ msg: 'Failed to send email', to, subject, error: error.message });
    }
  }

  // ── Auth emails ────────────────────────────────────────────────────────────

  async sendOtpEmail(to: string, code: string): Promise<void> {
    await this.send(
      to,
      'Your Axon Tickets verification code',
      `<div style="font-family:sans-serif;max-width:400px;margin:0 auto">
        <h2 style="color:#1A3A5C">Verify your email</h2>
        <p>Your verification code is:</p>
        <p style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#EA6C00">${code}</p>
        <p style="color:#64748b;font-size:14px">This code expires in 5 minutes. Do not share it with anyone.</p>
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
  ): Promise<void> {
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
            Keep this reference number when making your payment.
          </p>
        </div>
        <h3 style="color:#1A3A5C">Payment Instructions</h3>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px 0;color:#64748b">Bank</td><td style="padding:8px 0;font-weight:600">${bankName}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Account Number</td><td style="padding:8px 0;font-weight:600">${bankAccountNumber}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Account Name</td><td style="padding:8px 0;font-weight:600">${bankAccountName}</td></tr>
        </table>
        <p style="color:#64748b;font-size:14px;margin-top:16px">
          After payment, upload your proof of payment via the registration portal.
          Your QR code will be emailed once payment is verified.
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
      `Payment proof received — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1A3A5C">${eventTitle}</h2>
        <p>Hi ${firstName}, we have received your payment proof for reference <strong>${referenceNumber}</strong>.</p>
        <p>Our team will verify your payment within 1–2 business days.
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
    attendeeRows: string,
  ): Promise<void> {
    await this.send(
      to,
      `Your QR code is ready — ${eventTitle}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#EA6C00;margin-bottom:4px">Payment verified!</h1>
        <h2 style="margin-top:0;color:#1A3A5C">${eventTitle}</h2>
        <p style="color:#64748b">${eventDate} · ${eventVenue}</p>
        <p>Hi ${firstName}, here are your QR codes. Show them at the door.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead>
            <tr style="background:#f7f9fc">
              <th style="padding:12px;text-align:left;color:#1A3A5C">Attendee</th>
              <th style="padding:12px;text-align:center;color:#1A3A5C">QR Code</th>
            </tr>
          </thead>
          <tbody>${attendeeRows}</tbody>
        </table>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px">Axon Tickets · Online Ticketing Platform</p>
      </div>`,
    );
  }
}
