import { expect, test } from '@playwright/test';
import {
  announcementText,
  buildCopyLink,
  classifyMissingReservation,
  crossedAnnouncement,
  describeHold,
  forgetHold,
  formatCountdown,
  formatHoldDeadline,
  formatHoursMinutes,
  maskEmail,
  parseResumeFragment,
  readApiFailure,
  readRememberedHold,
  rememberHold,
  stripFragment,
} from '../src/lib/guestHold';
import { scrubAnalyticsEvent, scrubBreadcrumbData, scrubRequestUrl } from '../src/lib/scrubUrls';
import { isPixelExcludedPath } from '../src/lib/metaPixelRoutes';

const REG = '3f2a1b9c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const EMAILED = `v1.${REG}.1790000000.${'A'.repeat(43)}`;

// Pure helpers: no browser is opened for these tests.
test.describe('guest hold helpers', () => {
  test('formats deadlines as weekday, month, day, year and time in Philippine time', () => {
    // 2026-10-03 01:30 UTC is 9:30 AM in Manila (UTC+8), a Saturday.
    expect(formatHoldDeadline('2026-10-03T01:30:00.000Z')).toBe('Sat, Oct 3, 2026 · 9:30 AM');
    // The same instant across midnight in Manila.
    expect(formatHoldDeadline('2026-10-02T16:05:00.000Z')).toBe('Sat, Oct 3, 2026 · 12:05 AM');
    expect(formatHoldDeadline('2026-10-02T04:00:00.000Z')).toBe('Fri, Oct 2, 2026 · 12:00 PM');
  });

  test('shows minutes and seconds, and hours and minutes', () => {
    expect(formatCountdown(2530)).toBe('42:10');
    expect(formatCountdown(59)).toBe('0:59');
    expect(formatCountdown(-5)).toBe('0:00');
    expect(formatHoursMinutes(4320)).toBe('1 hr 12 min');
    expect(formatHoursMinutes(7200)).toBe('2 hr');
  });

  test('banner wording follows the time left', () => {
    const now = Date.parse('2026-10-02T10:00:00.000Z');
    const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();

    expect(describeHold(null, now)).toBeNull();
    expect(describeHold(undefined, now)).toBeNull();
    expect(describeHold('not a date', now)).toBeNull();
    expect(describeHold(at(-1), now)).toEqual({ mode: 'expired', seconds: 0 });
    expect(describeHold(at(0), now)).toEqual({ mode: 'expired', seconds: 0 });
    expect(describeHold(at(272), now)).toEqual({ mode: 'countdown', seconds: 272, text: '4:32', urgent: true });
    expect(describeHold(at(2530), now)).toMatchObject({ mode: 'countdown', text: '42:10', urgent: false });
    expect(describeHold(at(3599), now)).toMatchObject({ mode: 'countdown' });
    expect(describeHold(at(3600), now)).toMatchObject({ mode: 'hours', text: '1 hr' });
    expect(describeHold(at(4320), now)).toMatchObject({ mode: 'hours', text: '1 hr 12 min' });
    expect(describeHold(at(7200), now)).toMatchObject({ mode: 'hours' });
    expect(describeHold(at(7201), now)).toMatchObject({ mode: 'date', text: formatHoldDeadline(at(7201)) });
  });

  test('announces only when 10, 5 or 1 minute is crossed, never every second', () => {
    expect(crossedAnnouncement(601, 600)).toBe(600);
    expect(crossedAnnouncement(305, 299)).toBe(300);
    expect(crossedAnnouncement(61, 60)).toBe(60);
    expect(crossedAnnouncement(500, 499)).toBeNull();
    expect(crossedAnnouncement(600, 600)).toBeNull();
    expect(announcementText(600)).toBe('10 minutes left to upload your payment proof.');
    expect(announcementText(60)).toBe('1 minute left to upload your payment proof.');
  });

  test('removes a URL fragment before it can reach analytics', () => {
    expect(stripFragment('https://axontickets.online/events/x/register/resume#t=secret')).toBe(
      'https://axontickets.online/events/x/register/resume',
    );
    expect(stripFragment('https://axontickets.online/a?b=1#r=id.token')).toBe('https://axontickets.online/a?b=1');
    expect(stripFragment('https://axontickets.online/a')).toBe('https://axontickets.online/a');
  });

  test('masks an email for display', () => {
    expect(maskEmail('juan@example.com')).toBe('j***@example.com');
    expect(maskEmail('  Ana@Example.com ')).toBe('A***@Example.com');
    expect(maskEmail('no-at-sign')).toBe('');
  });

  test('reads the emailed and copied link fragments, and ignores anything malformed', () => {
    expect(parseResumeFragment(`#t=${EMAILED}`)).toEqual({ kind: 'emailed', token: EMAILED });
    expect(parseResumeFragment(`t=${EMAILED}`)).toEqual({ kind: 'emailed', token: EMAILED });
    const accessToken = 'x'.repeat(43);
    expect(parseResumeFragment(`#r=${REG}.${accessToken}`)).toEqual({
      kind: 'copied',
      registrationId: REG,
      accessToken,
    });

    for (const bad of ['', '#', '#t=', '#t=garbage', '#r=', `#r=${REG}`, `#r=${REG}.short`, '#r=nope.token', '#x=1', `#t=${EMAILED}extra`]) {
      expect(parseResumeFragment(bad)).toEqual({ kind: 'none' });
    }
  });

  test('builds a copy link that parses back to the same reservation', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
    const link = buildCopyLink('https://axontickets.online', 'glee-cabaret', REG, token);
    expect(link).toBe(`https://axontickets.online/events/glee-cabaret/register/resume#r=${REG}.${token}`);
    expect(parseResumeFragment(new URL(link).hash)).toEqual({ kind: 'copied', registrationId: REG, accessToken: token });
  });

  test('tells an expired reservation from one opened on another device', () => {
    const now = Date.parse('2026-10-02T10:00:00.000Z');
    expect(classifyMissingReservation('2026-10-02T09:59:00.000Z', now)).toBe('expired');
    expect(classifyMissingReservation('2026-10-02T10:00:00.000Z', now)).toBe('expired');
    expect(classifyMissingReservation('2026-10-02T10:30:00.000Z', now)).toBe('elsewhere');
    expect(classifyMissingReservation(null, now)).toBe('elsewhere');
    expect(classifyMissingReservation('garbage', now)).toBe('elsewhere');
  });

  test('remembers and forgets the hold for an event, and survives unusable storage', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    expect(readRememberedHold(storage, 'event-1')).toBeNull();
    rememberHold(storage, 'event-1', { registrationId: REG, tierId: 'tier-1', qty: 2 });
    expect(readRememberedHold(storage, 'event-1')).toEqual({ registrationId: REG, tierId: 'tier-1', qty: 2 });
    expect(readRememberedHold(storage, 'event-2')).toBeNull();
    forgetHold(storage, 'event-1');
    expect(readRememberedHold(storage, 'event-1')).toBeNull();

    data.set('axon_guest_hold_event-1', '{not json');
    expect(readRememberedHold(storage, 'event-1')).toBeNull();
    data.set('axon_guest_hold_event-1', JSON.stringify({ registrationId: 1 }));
    expect(readRememberedHold(storage, 'event-1')).toBeNull();

    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readRememberedHold(blocked, 'event-1')).toBeNull();
    expect(() => rememberHold(blocked, 'event-1', { registrationId: REG, tierId: 't', qty: 1 })).not.toThrow();
    expect(() => forgetHold(blocked, 'event-1')).not.toThrow();
  });

  test('reads the status, code and message from an API error', () => {
    expect(readApiFailure({ response: { status: 409, data: { code: 'GUEST_HOLD_LIMIT', message: 'Too many' } } })).toEqual({
      status: 409,
      code: 'GUEST_HOLD_LIMIT',
      message: 'Too many',
    });
    expect(readApiFailure({ response: { status: 400, data: { message: ['a', 'b'] } } })).toEqual({
      status: 400,
      code: null,
      message: 'a b',
    });
    expect(readApiFailure(new Error('Network Error'))).toEqual({ status: null, code: null, message: null });
    expect(readApiFailure(undefined)).toEqual({ status: null, code: null, message: null });
  });

  test('every tracker scrubber removes a reservation secret from the URL fragment', () => {
    const secretUrl = `https://axontickets.online/events/x/register/resume#t=${EMAILED}`;
    const copiedUrl = `https://axontickets.online/events/x/register/resume#r=${REG}.${'x'.repeat(43)}`;

    // Sentry events and transactions
    expect(scrubRequestUrl({ url: secretUrl }).url).toBe('https://axontickets.online/events/x/register/resume');
    expect(scrubRequestUrl({ url: copiedUrl }).url).toBe('https://axontickets.online/events/x/register/resume');
    expect(scrubRequestUrl(undefined)).toBeUndefined();
    expect(scrubRequestUrl({})).toEqual({});

    // Sentry navigation and fetch breadcrumbs
    const crumb = scrubBreadcrumbData({ data: { from: secretUrl, to: copiedUrl, url: secretUrl, status_code: 200 } });
    expect(crumb.data).toEqual({
      from: 'https://axontickets.online/events/x/register/resume',
      to: 'https://axontickets.online/events/x/register/resume',
      url: 'https://axontickets.online/events/x/register/resume',
      status_code: 200,
    });
    expect(JSON.stringify(crumb)).not.toContain(EMAILED);
    expect(scrubBreadcrumbData({})).toEqual({});

    // Vercel Analytics and Speed Insights
    const analytics = scrubAnalyticsEvent({ type: 'pageview', url: secretUrl });
    expect(analytics).toEqual({ type: 'pageview', url: 'https://axontickets.online/events/x/register/resume' });
  });

  test('the Meta Pixel never tracks the resume page, but still tracks ordinary event pages', () => {
    expect(isPixelExcludedPath('/events/glee-cabaret/register/resume')).toBe(true);
    expect(isPixelExcludedPath('/events/glee-cabaret/register/resume/')).toBe(true);
    expect(isPixelExcludedPath('/admin/orders')).toBe(true);
    expect(isPixelExcludedPath('/registrations/abc')).toBe(true);
    expect(isPixelExcludedPath('/events/glee-cabaret')).toBe(false);
    expect(isPixelExcludedPath('/events/glee-cabaret/register')).toBe(false);
    expect(isPixelExcludedPath('/events/glee-cabaret/register/payment/abc')).toBe(false);
    expect(isPixelExcludedPath('/events/glee-cabaret/register/resumed')).toBe(false);
  });
});
