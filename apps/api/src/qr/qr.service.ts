import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrService {
  /** Returns a PNG image as a Buffer. */
  async generateQrPng(data: string): Promise<Buffer> {
    return QRCode.toBuffer(data, { type: 'png', width: 256, margin: 2 });
  }

  /** Returns a base64 PNG data URI (data:image/png;base64,...). */
  async generateQrDataUrl(data: string): Promise<string> {
    return QRCode.toDataURL(data, { type: 'image/png', width: 256, margin: 2 });
  }

  /**
   * Returns a self-contained branded SVG ticket card (Buffer, UTF-8) with:
   * - Axon Tickets branding header
   * - QR code embedded as a base64 PNG <image>
   * - Attendee full name
   * No native dependencies — safe for serverless / ncc bundling.
   */
  async generateBrandedTicketSvg(
    token: string,
    firstName: string,
    lastName: string,
  ): Promise<Buffer> {
    const pngBuffer = await this.generateQrPng(token);
    const qrB64 = pngBuffer.toString('base64');

    const escapedName = `${firstName} ${lastName}`
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="400" height="480" viewBox="0 0 400 480">
  <defs>
    <clipPath id="headerClip"><rect width="400" height="86" rx="16"/></clipPath>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#00000018"/>
    </filter>
  </defs>

  <!-- Card background -->
  <rect width="400" height="480" rx="16" fill="#ffffff" filter="url(#shadow)"/>

  <!-- Header band -->
  <rect width="400" height="86" fill="#1A3A5C" clip-path="url(#headerClip)"/>
  <rect y="70" width="400" height="16" fill="#1A3A5C"/>

  <!-- Brand mark circle -->
  <circle cx="36" cy="40" r="16" fill="#EA6C00"/>
  <text x="36" y="47" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="bold" fill="#ffffff">A</text>

  <!-- Brand name + tagline -->
  <text x="62" y="34" font-family="Arial,Helvetica,sans-serif"
        font-size="17" font-weight="bold" fill="#ffffff" letter-spacing="0.5">AXON TICKETS</text>
  <text x="62" y="54" font-family="Arial,Helvetica,sans-serif"
        font-size="11" fill="#93c5fd">Online Ticketing Platform</text>

  <!-- Orange accent divider -->
  <rect x="20" y="95" width="360" height="3" rx="1.5" fill="#EA6C00"/>

  <!-- QR Code image -->
  <image xlink:href="data:image/png;base64,${qrB64}" x="90" y="112" width="220" height="220"/>
  <!-- QR border frame -->
  <rect x="87" y="109" width="226" height="226" rx="10"
        fill="none" stroke="#e2e8f0" stroke-width="1.5"/>

  <!-- Attendee name -->
  <text x="200" y="362" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="bold" fill="#1A3A5C">${escapedName}</text>

  <!-- Role label -->
  <text x="200" y="386" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="12" fill="#64748b">Registered Attendee</text>

  <!-- Decorative dot row -->
  <circle cx="174" cy="408" r="2.5" fill="#cbd5e1"/>
  <circle cx="200" cy="408" r="2.5" fill="#EA6C00"/>
  <circle cx="226" cy="408" r="2.5" fill="#cbd5e1"/>

  <!-- Scan hint -->
  <text x="200" y="432" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="12" fill="#94a3b8">Present this code at the entrance</text>

  <!-- Footer -->
  <line x1="20" y1="452" x2="380" y2="452" stroke="#e5e7eb" stroke-width="1"/>
  <text x="200" y="469" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="10" fill="#94a3b8">© ${new Date().getFullYear()} Axon Tickets · axontickets.com</text>
</svg>`;

    return Buffer.from(svg, 'utf-8');
  }
}
