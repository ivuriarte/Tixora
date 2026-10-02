import { ServiceUnavailableException } from '@nestjs/common';
import { makeGuestHold } from './guest-hold.testing';
import { RESUME_TOKEN_PATTERN } from './guest-hold.service';

const REG = '3f2a1b9c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const IP = '203.0.113.7';

describe('GuestHoldService deadlines', () => {
  it('computes the initial and extended deadlines from configuration', () => {
    const { service } = makeGuestHold();
    const now = new Date('2026-10-02T10:00:00.000Z');
    expect(service.initialDeadline(now)).toEqual(new Date('2026-10-02T11:00:00.000Z'));
    expect(service.extendedDeadline(now)).toEqual(new Date('2026-10-03T10:00:00.000Z'));
  });

  it('honours different configured values', () => {
    const { service } = makeGuestHold({ 'guestHold.minutes': 30, 'guestHold.extendedHours': 6 });
    const now = new Date('2026-10-02T10:00:00.000Z');
    expect(service.initialDeadline(now)).toEqual(new Date('2026-10-02T10:30:00.000Z'));
    expect(service.extendedDeadline(now)).toEqual(new Date('2026-10-02T16:00:00.000Z'));
  });

  it('never moves a hold earlier than the deadline it already has', () => {
    const { service } = makeGuestHold();
    const later = new Date('2026-10-04T00:00:00.000Z');
    const sooner = new Date('2026-10-03T00:00:00.000Z');
    expect(service.laterOf(later, sooner)).toBe(later);
    expect(service.laterOf(sooner, later)).toBe(later);
    expect(service.laterOf(null, sooner)).toBe(sooner);
  });
});

describe('GuestHoldService hold-creation cap', () => {
  it('allows holds up to the cap and blocks the next one, undoing its own count', async () => {
    const { service, redis } = makeGuestHold({ 'guestHold.perIp': 2 });
    const first = await service.acquireCreateSlot('event-1', IP);
    const second = await service.acquireCreateSlot('event-1', IP);
    const third = await service.acquireCreateSlot('event-1', IP);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third).toEqual({ allowed: false });
    // The blocked attempt must not leave the counter above the cap.
    expect(redis.store.get(first.counterKey as string)).toBe('2');
  });

  it('counts per event and per network separately', async () => {
    const { service } = makeGuestHold({ 'guestHold.perIp': 1 });
    expect((await service.acquireCreateSlot('event-1', IP)).allowed).toBe(true);
    expect((await service.acquireCreateSlot('event-2', IP)).allowed).toBe(true);
    expect((await service.acquireCreateSlot('event-1', '198.51.100.9')).allowed).toBe(true);
    expect((await service.acquireCreateSlot('event-1', IP)).allowed).toBe(false);
  });

  it('never stores a raw IP address in a Redis key', async () => {
    const { service, redis } = makeGuestHold();
    await service.acquireCreateSlot('event-1', IP);
    for (const key of redis.store.keys()) expect(key).not.toContain(IP);
  });

  it('fails open when Redis is down, so checkout keeps working', async () => {
    const { service, redis } = makeGuestHold();
    redis.outage = true;
    await expect(service.acquireCreateSlot('event-1', IP)).resolves.toEqual({ allowed: true });
  });

  it('skips the cap when the request IP is unknown', async () => {
    const { service, redis } = makeGuestHold({ 'guestHold.perIp': 1 });
    await expect(service.acquireCreateSlot('event-1', undefined)).resolves.toEqual({ allowed: true });
    await expect(service.acquireCreateSlot('event-1', '')).resolves.toEqual({ allowed: true });
    expect(redis.store.size).toBe(0);
  });

  it('gives a slot back when a hold is released, and never goes below zero', async () => {
    const { service, redis } = makeGuestHold({ 'guestHold.perIp': 1 });
    const slot = await service.acquireCreateSlot('event-1', IP);
    await service.bindSlot(REG, slot.counterKey);
    expect((await service.acquireCreateSlot('event-1', IP)).allowed).toBe(false);

    await service.releaseSlot(REG);
    expect(redis.store.get(slot.counterKey as string)).toBe('0');
    expect(redis.store.has(`guest-hold-reg:${REG}`)).toBe(false);
    expect((await service.acquireCreateSlot('event-1', IP)).allowed).toBe(true);

    // A second release (or one for an unknown registration) must not push the counter negative.
    await service.releaseSlot(REG);
    await service.releaseSlot('unknown');
    expect(Number(redis.store.get(slot.counterKey as string))).toBeGreaterThanOrEqual(0);
  });

  it('does not create or change a counter when the original counter already expired', async () => {
    const { service, redis } = makeGuestHold();
    const slot = await service.acquireCreateSlot('event-1', IP);
    await service.bindSlot(REG, slot.counterKey);
    redis.store.delete(slot.counterKey as string); // counter expired, mapping still there
    await service.releaseSlot(REG);
    expect(redis.store.has(slot.counterKey as string)).toBe(false);
  });

  it('undoes a count taken for a hold that was never created', async () => {
    const { service, redis } = makeGuestHold();
    const slot = await service.acquireCreateSlot('event-1', IP);
    await service.undoSlot(slot.counterKey);
    expect(redis.store.get(slot.counterKey as string)).toBe('0');
  });

  it('never throws from the best-effort release helpers when Redis is down', async () => {
    const { service, redis } = makeGuestHold();
    redis.outage = true;
    await expect(service.bindSlot(REG, 'k')).resolves.toBeUndefined();
    await expect(service.releaseSlot(REG)).resolves.toBeUndefined();
    await expect(service.undoSlot('k')).resolves.toBeUndefined();
  });
});

describe('GuestHoldService extended-hold cap', () => {
  it('allows the configured number of extended holds per IP per event, then refuses', async () => {
    const { service } = makeGuestHold({ 'guestHold.extendedPerIp': 2 });
    expect(await service.acquireExtendedSlot('event-1', IP)).toBe(true);
    expect(await service.acquireExtendedSlot('event-1', IP)).toBe(true);
    expect(await service.acquireExtendedSlot('event-1', IP)).toBe(false);
    expect(await service.acquireExtendedSlot('event-2', IP)).toBe(true);
  });

  it('fails closed: no extension when Redis is down or the IP is unknown', async () => {
    const { service, redis } = makeGuestHold();
    expect(await service.acquireExtendedSlot('event-1', undefined)).toBe(false);
    redis.outage = true;
    expect(await service.acquireExtendedSlot('event-1', IP)).toBe(false);
  });
});

describe('GuestHoldService email limits', () => {
  const input = { registrationId: REG, email: 'Guest@Example.com', ip: IP };

  it('allows a first send, then enforces the 60-second cooldown for the same registration', async () => {
    const { service } = makeGuestHold();
    expect(await service.allowResumeEmail(input)).toBe(true);
    expect(await service.allowResumeEmail(input)).toBe(false);
  });

  it('caps sends per registration at three per day', async () => {
    const { service, redis } = makeGuestHold();
    let sent = 0;
    for (let i = 0; i < 6; i++) {
      redis.store.delete(`resume-mail-cd:${REG}`); // skip the cooldown to isolate the daily cap
      if (await service.allowResumeEmail({ ...input, email: `a${i}@example.com`, ip: `10.0.0.${i}` })) sent++;
    }
    expect(sent).toBe(3);
  });

  it('caps sends per recipient address at three per day across different registrations', async () => {
    const { service } = makeGuestHold();
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(
        await service.allowResumeEmail({
          registrationId: `reg-${i}`,
          email: 'victim@example.com',
          ip: `10.0.1.${i}`,
        }),
      );
    }
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('treats the recipient address case-insensitively', async () => {
    const { service } = makeGuestHold();
    for (let i = 0; i < 3; i++) {
      await service.allowResumeEmail({ registrationId: `r${i}`, email: 'MiXed@Example.com', ip: `10.0.2.${i}` });
    }
    expect(
      await service.allowResumeEmail({ registrationId: 'r9', email: 'mixed@example.com', ip: '10.0.2.9' }),
    ).toBe(false);
  });

  it('caps sends per IP at ten per hour', async () => {
    const { service } = makeGuestHold();
    let sent = 0;
    for (let i = 0; i < 14; i++) {
      if (await service.allowResumeEmail({ registrationId: `reg-${i}`, email: `u${i}@example.com`, ip: IP })) sent++;
    }
    expect(sent).toBe(10);
  });

  it('keeps raw emails and IPs out of every Redis key', async () => {
    const { service, redis } = makeGuestHold();
    await service.allowResumeEmail(input);
    for (const key of redis.store.keys()) {
      expect(key).not.toContain('example.com');
      expect(key).not.toContain(IP);
    }
  });

  it('fails closed: sends nothing when Redis is down or the IP is unknown', async () => {
    const { service, redis } = makeGuestHold();
    expect(await service.allowResumeEmail({ ...input, ip: undefined })).toBe(false);
    redis.outage = true;
    expect(await service.allowResumeEmail(input)).toBe(false);
  });
});

describe('GuestHoldService resume exchange limit', () => {
  it('allows 20 exchanges per IP per hour, then refuses', async () => {
    const { service } = makeGuestHold();
    let allowed = 0;
    for (let i = 0; i < 25; i++) if (await service.allowResumeExchange(IP)) allowed++;
    expect(allowed).toBe(20);
  });

  it('fails open when Redis is down (the signature cannot be forged, so this only bounds cost)', async () => {
    const { service, redis } = makeGuestHold();
    redis.outage = true;
    expect(await service.allowResumeExchange(IP)).toBe(true);
  });
});

describe('GuestHoldService reminder marker', () => {
  it('lets exactly one caller claim a registration, and frees it again on request', async () => {
    const { service } = makeGuestHold();
    expect(await service.claimReminder(REG)).toBe(true);
    expect(await service.claimReminder(REG)).toBe(false);
    await service.releaseReminderClaim(REG);
    expect(await service.claimReminder(REG)).toBe(true);
  });

  it('claims for 48 hours and skips (never duplicates) when Redis is down', async () => {
    const { service, redis } = makeGuestHold();
    await service.claimReminder(REG);
    expect(redis.ttls.get(`payment-reminder:${REG}`)).toBe(172_800);
    redis.outage = true;
    expect(await service.claimReminder('another')).toBe(false);
    await expect(service.releaseReminderClaim('another')).resolves.toBeUndefined();
  });
});

describe('GuestHoldService resume token', () => {
  const future = () => new Date(Date.now() + 60 * 60 * 1000);

  it('signs a token that matches the documented format and verifies it', () => {
    const { service } = makeGuestHold();
    const expiresAt = future();
    const token = service.signResumeToken(REG, expiresAt);

    expect(token).toMatch(RESUME_TOKEN_PATTERN);
    const verified = service.verifyResumeToken(token);
    expect(verified?.registrationId).toBe(REG);
    expect(verified?.expiresAt.getTime()).toBe(Math.floor(expiresAt.getTime() / 1000) * 1000);
  });

  it('rejects an expired token', () => {
    const { service } = makeGuestHold();
    const token = service.signResumeToken(REG, new Date(Date.now() + 1_000));
    expect(service.verifyResumeToken(token, new Date(Date.now() + 5_000))).toBeNull();
  });

  it('rejects tampering with the id, the expiry or the signature', () => {
    const { service } = makeGuestHold();
    const token = service.signResumeToken(REG, future());
    const [v, id, exp, sig] = token.split('.');
    const otherId = '00000000-0000-4000-8000-000000000000';
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');

    expect(service.verifyResumeToken([v, otherId, exp, sig].join('.'))).toBeNull();
    expect(service.verifyResumeToken([v, id, String(Number(exp) + 3600), sig].join('.'))).toBeNull();
    expect(service.verifyResumeToken([v, id, exp, flipped].join('.'))).toBeNull();
  });

  it('rejects wrong versions, wrong lengths and malformed input without throwing', () => {
    const { service } = makeGuestHold();
    const token = service.signResumeToken(REG, future());
    const bad: unknown[] = [
      token.replace(/^v1/, 'v2'),
      token.slice(0, -5),
      `${token}AAAA`,
      '',
      'not-a-token',
      `${token}.extra`,
      undefined,
      null,
      42,
      'v1..1.x',
    ];
    for (const value of bad) expect(service.verifyResumeToken(value as string)).toBeNull();
  });

  it('does not accept a token signed with different key material', () => {
    const a = makeGuestHold();
    const b = makeGuestHold({ 'jwt.privateKey': 'a-completely-different-private-key-0123456789abcdef' });
    const token = a.service.signResumeToken(REG, future());
    expect(b.service.verifyResumeToken(token)).toBeNull();
  });

  it('touches no Redis key while verifying (no network or database before the signature check)', () => {
    const { service, redis } = makeGuestHold();
    const token = service.signResumeToken(REG, future());
    const spy = jest.spyOn(redis, 'get');
    service.verifyResumeToken(token);
    service.verifyResumeToken('garbage');
    expect(spy).not.toHaveBeenCalled();
    expect(redis.store.size).toBe(0);
  });

  it('refuses to operate without strong key material instead of using a weak key', () => {
    const { service } = makeGuestHold({ 'jwt.privateKey': '' });
    expect(() => service.signResumeToken(REG, future())).toThrow(ServiceUnavailableException);
  });
});
