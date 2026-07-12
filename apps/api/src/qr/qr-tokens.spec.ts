/**
 * U-25 – U-28: QR token unit tests
 * Tests the HMAC-signed token utilities from @axon-tickets/utils
 * used by the check-in flow (Phase 6).
 */
import {
  generateQrToken,
  verifyQrToken,
  generateAttendeeQrToken,
  verifyAttendeeQrToken,
} from '@axon-tickets/utils';

const SECRET = 'test-secret-32-chars-long-enough!';
const WRONG_SECRET = 'wrong-secret';

// ─── U-25: verifyAttendeeQrToken — valid token round-trip ──────────────────

describe('U-25: verifyAttendeeQrToken — valid token', () => {
  const payload = {
    attendeeId: 'att_01',
    registrationId: 'reg_01',
    eventId: 'evt_01',
  };

  it('returns the original payload for a correctly signed token', () => {
    const token = generateAttendeeQrToken(payload, SECRET);
    const result = verifyAttendeeQrToken(token, SECRET);
    expect(result).toEqual(payload);
  });

  it('produces a token with two dot-separated parts', () => {
    const token = generateAttendeeQrToken(payload, SECRET);
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('produces different tokens for different secrets', () => {
    const t1 = generateAttendeeQrToken(payload, SECRET);
    const t2 = generateAttendeeQrToken(payload, WRONG_SECRET);
    expect(t1).not.toBe(t2);
  });
});

// ─── U-26: verifyAttendeeQrToken — tampered / invalid token ───────────────

describe('U-26: verifyAttendeeQrToken — invalid/tampered tokens', () => {
  const payload = {
    attendeeId: 'att_02',
    registrationId: 'reg_02',
    eventId: 'evt_02',
  };

  it('returns null for a token signed with the wrong secret', () => {
    const token = generateAttendeeQrToken(payload, SECRET);
    expect(verifyAttendeeQrToken(token, WRONG_SECRET)).toBeNull();
  });

  it('returns null when the signature is truncated', () => {
    const token = generateAttendeeQrToken(payload, SECRET);
    const [data] = token.split('.');
    expect(verifyAttendeeQrToken(`${data}.short`, SECRET)).toBeNull();
  });

  it('returns null for an entirely malformed token (no dot separator)', () => {
    expect(verifyAttendeeQrToken('notavalidtoken', SECRET)).toBeNull();
  });

  it('returns null when the payload data is tampered', () => {
    const token = generateAttendeeQrToken(payload, SECRET);
    const [, sig] = token.split('.');
    // Replace data with a different payload encoded the same way
    const altData = Buffer.from(
      JSON.stringify({ ...payload, attendeeId: 'att_EVIL' }),
    ).toString('base64url');
    expect(verifyAttendeeQrToken(`${altData}.${sig}`, SECRET)).toBeNull();
  });

  it('returns null when required field is missing from decoded JSON', () => {
    // Build a token whose payload is missing attendeeId
    const badPayload = { registrationId: 'reg_02', eventId: 'evt_02' };
    const data = Buffer.from(JSON.stringify(badPayload)).toString('base64url');
    const { createHmac } = require('crypto');
    const sig = createHmac('sha256', SECRET).update(data).digest('base64url');
    expect(verifyAttendeeQrToken(`${data}.${sig}`, SECRET)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(verifyAttendeeQrToken('', SECRET)).toBeNull();
  });
});

// ─── U-27: generateQrToken / verifyQrToken — ticket flow round-trip ───────

describe('U-27: generateQrToken + verifyQrToken round-trip', () => {
  const payload = {
    ticketId: 'tkt_01',
    userId: 'usr_01',
    eventId: 'evt_01',
    tierId: 'tier_01',
  };

  it('verifyQrToken returns original payload for valid token', () => {
    const token = generateQrToken(payload, SECRET);
    expect(verifyQrToken(token, SECRET)).toEqual(payload);
  });

  it('verifyQrToken returns null for wrong secret', () => {
    const token = generateQrToken(payload, SECRET);
    expect(verifyQrToken(token, WRONG_SECRET)).toBeNull();
  });

  it('verifyQrToken returns null for tampered payload', () => {
    const token = generateQrToken(payload, SECRET);
    const [, sig] = token.split('.');
    const altData = Buffer.from(
      JSON.stringify({ ...payload, ticketId: 'tkt_EVIL' }),
    ).toString('base64url');
    expect(verifyQrToken(`${altData}.${sig}`, SECRET)).toBeNull();
  });

  it('verifyQrToken returns null when a required field is absent', () => {
    const { createHmac } = require('crypto');
    const badPayload = { ticketId: 'tkt_01', userId: 'usr_01', eventId: 'evt_01' }; // missing tierId
    const data = Buffer.from(JSON.stringify(badPayload)).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(data).digest('base64url');
    expect(verifyQrToken(`${data}.${sig}`, SECRET)).toBeNull();
  });
});

// ─── U-28: duplicate check-in detection logic ──────────────────────────────
// Tested as a pure function to mirror the guard in admin.service.ts checkIn().

describe('U-28: duplicate check-in detection', () => {
  /**
   * Simulates the duplicate-check guard from admin.service checkIn():
   * if attendee already has checkedInAt set, throw a conflict.
   */
  function assertNotAlreadyCheckedIn(checkedInAt: Date | null): void {
    if (checkedInAt !== null) {
      throw Object.assign(new Error('Attendee already checked in'), {
        status: 409,
        checkedInAt,
      });
    }
  }

  it('does NOT throw for an attendee that has never been checked in', () => {
    expect(() => assertNotAlreadyCheckedIn(null)).not.toThrow();
  });

  it('throws a 409 conflict when checkedInAt is already set', () => {
    const checkTime = new Date('2025-06-01T10:00:00Z');
    expect(() => assertNotAlreadyCheckedIn(checkTime)).toThrow('already checked in');
  });

  it('attaches the original checkedInAt timestamp to the thrown error', () => {
    const checkTime = new Date('2025-06-01T10:00:00Z');
    try {
      assertNotAlreadyCheckedIn(checkTime);
      fail('Expected throw');
    } catch (err: unknown) {
      expect((err as { checkedInAt: Date }).checkedInAt).toEqual(checkTime);
      expect((err as { status: number }).status).toBe(409);
    }
  });
});
