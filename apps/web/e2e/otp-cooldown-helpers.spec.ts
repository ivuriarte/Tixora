import { expect, test } from '@playwright/test';
import {
  DEFAULT_OTP_WAIT_SECONDS,
  OTP_LIFETIME_MS,
  canResumeCode,
  readOtpCooldown,
  readSendWaitSeconds,
  secondsUntil,
} from '../src/lib/otpCooldown';

function apiError(data: Record<string, unknown>) {
  return { response: { status: 400, data } };
}

// Pure helpers: no browser is opened for these tests.
test.describe('OTP cooldown helpers', () => {
  test('reads the cooldown the API sends for a guest checkout code', () => {
    expect(
      readOtpCooldown(
        apiError({
          message: 'Please wait 42 seconds before requesting a new code.',
          code: 'OTP_COOLDOWN',
          retryAfterSeconds: 42,
          codeActive: true,
        }),
      ),
    ).toEqual({ retryAfterSeconds: 42, codeActive: true, userId: null });
  });

  test('reads the user id that the account sign-in API adds', () => {
    expect(
      readOtpCooldown(
        apiError({ code: 'OTP_COOLDOWN', retryAfterSeconds: 9, codeActive: true, userId: 'user-1' }),
      ),
    ).toEqual({ retryAfterSeconds: 9, codeActive: true, userId: 'user-1' });
  });

  test('is not a cooldown for any other API error', () => {
    expect(readOtpCooldown(apiError({ message: 'Too many codes', code: 'OTP_SEND_LIMIT' }))).toBeNull();
    expect(readOtpCooldown(apiError({ message: 'Please wait 60 seconds' }))).toBeNull();
    expect(readOtpCooldown(new Error('Network Error'))).toBeNull();
    expect(readOtpCooldown(null)).toBeNull();
    expect(readOtpCooldown(undefined)).toBeNull();
    expect(readOtpCooldown('OTP_COOLDOWN')).toBeNull();
  });

  test('only treats a code as still usable when the API says so', () => {
    expect(readOtpCooldown(apiError({ code: 'OTP_COOLDOWN', retryAfterSeconds: 5 }))?.codeActive).toBe(false);
    expect(
      readOtpCooldown(apiError({ code: 'OTP_COOLDOWN', retryAfterSeconds: 5, codeActive: 'true' }))
        ?.codeActive,
    ).toBe(false);
  });

  test('keeps the wait between 1 and 300 seconds and falls back to 60 when it is unreadable', () => {
    expect(readOtpCooldown(apiError({ code: 'OTP_COOLDOWN', retryAfterSeconds: 0 }))?.retryAfterSeconds).toBe(1);
    expect(readOtpCooldown(apiError({ code: 'OTP_COOLDOWN', retryAfterSeconds: -4 }))?.retryAfterSeconds).toBe(1);
    expect(readOtpCooldown(apiError({ code: 'OTP_COOLDOWN', retryAfterSeconds: 2.2 }))?.retryAfterSeconds).toBe(3);
    expect(readOtpCooldown(apiError({ code: 'OTP_COOLDOWN', retryAfterSeconds: 9999 }))?.retryAfterSeconds).toBe(300);
    expect(readOtpCooldown(apiError({ code: 'OTP_COOLDOWN' }))?.retryAfterSeconds).toBe(60);
    expect(readOtpCooldown(apiError({ code: 'OTP_COOLDOWN', retryAfterSeconds: 'soon' }))?.retryAfterSeconds).toBe(60);
  });

  test('ignores an empty or non-string user id', () => {
    expect(readOtpCooldown(apiError({ code: 'OTP_COOLDOWN', retryAfterSeconds: 5, userId: '' }))?.userId).toBeNull();
    expect(readOtpCooldown(apiError({ code: 'OTP_COOLDOWN', retryAfterSeconds: 5, userId: 7 }))?.userId).toBeNull();
  });

  test('counts whole seconds left and stops at zero', () => {
    expect(secondsUntil(10_000, 0)).toBe(10);
    expect(secondsUntil(10_000, 9_001)).toBe(1);
    expect(secondsUntil(10_000, 9_999)).toBe(1);
    expect(secondsUntil(10_000, 10_000)).toBe(0);
    expect(secondsUntil(10_000, 12_000)).toBe(0);
    expect(secondsUntil(0, Date.now())).toBe(0);
  });

  test('a code lives for five minutes, matching the API', () => {
    expect(OTP_LIFETIME_MS).toBe(300_000);
  });

  test('reads the wait from a send reply, with or without the data envelope, and falls back to 60', () => {
    expect(readSendWaitSeconds({ data: { retryAfterSeconds: 45 } })).toBe(45);
    expect(readSendWaitSeconds({ retryAfterSeconds: 30 })).toBe(30);
    expect(readSendWaitSeconds({ data: { retryAfterSeconds: 2.2 } })).toBe(3);
    expect(readSendWaitSeconds({ data: { retryAfterSeconds: 9999 } })).toBe(300);
    for (const unreadable of [null, undefined, {}, { data: {} }, { data: { retryAfterSeconds: 0 } }, { retryAfterSeconds: 'soon' }]) {
      expect(readSendWaitSeconds(unreadable)).toBe(DEFAULT_OTP_WAIT_SECONDS);
    }
  });

  test('only resumes when the earlier code still works and the API named the account', () => {
    expect(canResumeCode({ retryAfterSeconds: 9, codeActive: true, userId: 'user-1' })).toBe(true);
    expect(canResumeCode({ retryAfterSeconds: 9, codeActive: false, userId: 'user-1' })).toBe(false);
    expect(canResumeCode({ retryAfterSeconds: 9, codeActive: true, userId: null })).toBe(false);
    expect(canResumeCode(null)).toBe(false);
  });
});
