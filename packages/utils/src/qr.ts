import { createHmac, timingSafeEqual } from 'crypto';

export interface QrPayload {
  ticketId: string;
  userId: string;
  eventId: string;
  tierId: string;
}

/**
 * Generate an HMAC-SHA256 signed QR token.
 * Format: base64url(JSON payload) + '.' + base64url(HMAC signature)
 */
export function generateQrToken(payload: QrPayload, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export interface AttendeeQrPayload {
  attendeeId: string;
  registrationId: string;
  eventId: string;
}

/**
 * Generate an HMAC-SHA256 signed QR token for an attendee (manual-payment flow).
 * Same signing scheme as generateQrToken.
 */
export function generateAttendeeQrToken(payload: AttendeeQrPayload, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Verify an attendee QR token and return the payload, or null if invalid.
 */
export function verifyAttendeeQrToken(
  token: string,
  secret: string,
): AttendeeQrPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, sig] = parts;
  const expectedSig = createHmac('sha256', secret).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8'),
    ) as AttendeeQrPayload;
    if (!decoded.attendeeId || !decoded.registrationId || !decoded.eventId) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verify a QR token and return the payload, or null if invalid.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyQrToken(token: string, secret: string): QrPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, sig] = parts;

  const expectedSig = createHmac('sha256', secret).update(data).digest('base64url');

  const sigBuf = Buffer.from(sig, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');

  if (sigBuf.length !== expectedBuf.length) return null;

  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as QrPayload;
    if (!decoded.ticketId || !decoded.userId || !decoded.eventId || !decoded.tierId) return null;
    return decoded;
  } catch {
    return null;
  }
}
