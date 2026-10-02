'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { trackInternalFunnelEvent } from '@/lib/funnel';
import {
  buildCopyLink,
  formatHoldDeadline,
  maskEmail,
  readApiFailure,
} from '@/lib/guestHold';

interface PayLaterCardProps {
  registrationId: string;
  guestAccessToken: string;
  eventId?: string;
  eventSlug: string;
  /** The hold deadline we currently know about (ISO). Shown in error text so it stays true. */
  holdExpiresAt: string | null | undefined;
  /** Called with the real deadline the server returned. */
  onHoldChanged: (holdExpiresAt: string) => void;
  /** The reservation is gone (expired, cancelled): show the expired screen. */
  onExpired: () => void;
  /** Leave without an email: back to the event page. */
  onLeave: () => void;
  /** Close the card and go back to uploading proof. */
  onUploadNow: () => void;
}

type Problem = 'bad-address' | 'mail-failed' | 'throttled' | null;
type CopyState = 'idle' | 'copied' | 'blocked';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * "I will pay later" for a guest. An email is optional: with one we send a link back and
 * (within limits) hold the seats longer; without one the seats are held for the short
 * default and the guest starts again afterwards. "Copy my link" needs no email.
 *
 * The notice below is the agreed wording from the spec. The success message is
 * conditional ("If the address is right...") because the server answers the same way
 * whether or not an email was actually sent, and the deadline shown is always the real
 * one the server returned, never an assumed "24 hours".
 */
export default function PayLaterCard({
  registrationId,
  guestAccessToken,
  eventId,
  eventSlug,
  holdExpiresAt,
  onHoldChanged,
  onExpired,
  onLeave,
  onUploadNow,
}: PayLaterCardProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [sent, setSent] = useState<{ masked: string; deadline: string } | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const emailRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const copyLink = buildCopyLink(
    typeof window === 'undefined' ? '' : window.location.origin,
    eventSlug,
    registrationId,
    guestAccessToken,
  );

  // Opening the card moves focus to the email field.
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  const stillHeldUntil = holdExpiresAt ? ` Your seats are still held until ${formatHoldDeadline(holdExpiresAt)}.` : '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_SHAPE.test(address)) {
      setProblem('bad-address');
      emailRef.current?.focus();
      return;
    }
    setSending(true);
    setProblem(null);
    try {
      const response = await api.post(
        `/registrations/guest/${registrationId}/save-for-later`,
        { email: address },
        { headers: { 'x-registration-token': guestAccessToken } },
      );
      const body = response.data?.data ?? response.data;
      const deadline = typeof body?.holdExpiresAt === 'string' ? body.holdExpiresAt : holdExpiresAt;
      if (deadline) onHoldChanged(deadline);
      setSent({ masked: maskEmail(address), deadline: deadline ?? '' });
      void trackInternalFunnelEvent({ eventId, step: 'hold_email_saved', status: 'success' });
    } catch (error) {
      const failure = readApiFailure(error);
      if (failure.status === 429) setProblem('throttled');
      else if (failure.status === 503 || failure.status === null) setProblem('mail-failed');
      else if (failure.status === 400 && /email/i.test(failure.message ?? '')) setProblem('bad-address');
      else if (failure.status === 400 || failure.status === 404) onExpired();
      else setProblem('mail-failed');
    } finally {
      setSending(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyLink);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 4000);
    } catch {
      // In-app browsers (Facebook, Messenger) often block the clipboard: show the link instead.
      setCopyState('blocked');
    }
  }

  const copyButton = (
    <button
      type="button"
      onClick={copy}
      className="axon-pill min-h-[44px] border border-primary bg-white text-xs text-primary"
    >
      Copy my link
    </button>
  );

  const copyFeedback =
    copyState === 'copied' ? (
      <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800" role="status">
        <p className="font-semibold">Link copied.</p>
        {holdExpiresAt && <p>It works until {formatHoldDeadline(holdExpiresAt)}.</p>}
      </div>
    ) : copyState === 'blocked' ? (
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
        <p className="font-semibold">Your browser blocked copying.</p>
        <p>Select the link below and copy it yourself.</p>
        <label className="block text-xs font-semibold" htmlFor="pay-later-link">Your link</label>
        <input
          id="pay-later-link"
          readOnly
          value={copyLink}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 text-xs text-gray-900"
        />
      </div>
    ) : null;

  if (sent) {
    return (
      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5" aria-label="Finish later">
        <div
          ref={successRef}
          tabIndex={-1}
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 outline-none"
          role="status"
        >
          <p className="font-semibold">
            If the address is right, your link is on its way to {sent.masked}.
          </p>
          {sent.deadline && (
            <p className="mt-1 text-xs">
              Your seats are held until {formatHoldDeadline(sent.deadline)}. Check your spam folder,
              or copy your link instead.
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" onClick={onUploadNow} className="axon-pill min-h-[44px] bg-primary text-xs text-white">
            Upload proof now
          </button>
          {copyButton}
        </div>
        {copyFeedback && <div className="mt-3">{copyFeedback}</div>}
        <button type="button" onClick={onLeave} className="mt-3 min-h-[44px] text-xs font-medium text-gray-500 underline hover:text-primary">
          Back to the event
        </button>
      </section>
    );
  }

  const noticeId = 'pay-later-notice';
  const errorId = 'pay-later-error';
  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5" aria-label="Finish later">
      <h2 className="font-semibold text-gray-900">Finish later?</h2>
      <p id={noticeId} className="mt-1 text-xs text-gray-600">
        We&apos;ll email you a link and hold your seats for 24 hours. No email? Your seats are held for
        60 minutes only. After that you&apos;ll need to start again.
      </p>

      {problem && (
        <div id={errorId} className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
          {problem === 'bad-address' && (
            <>
              <p className="font-semibold">That email address doesn&apos;t look right.</p>
              <p>Check it and try again.{stillHeldUntil}</p>
            </>
          )}
          {problem === 'mail-failed' && (
            <>
              <p className="font-semibold">We couldn&apos;t send the email right now.</p>
              <p>Try again in a minute, or copy your link instead.{stillHeldUntil}</p>
            </>
          )}
          {problem === 'throttled' && (
            <>
              <p className="font-semibold">Too many requests.</p>
              <p>You can ask for another email in 1 minute. You can also copy your link now.</p>
            </>
          )}
        </div>
      )}

      <form onSubmit={submit} className="mt-3 space-y-3" noValidate>
        <div>
          <label htmlFor="pay-later-email" className="block text-xs font-semibold text-gray-800">
            Email for your link (optional)
          </label>
          <input
            id="pay-later-email"
            ref={emailRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            disabled={sending}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={problem ? `${noticeId} ${errorId}` : noticeId}
            aria-invalid={problem === 'bad-address'}
            placeholder="you@example.com"
            className="mt-1 min-h-[44px] w-full rounded-xl border border-gray-300 px-3 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={sending || problem === 'throttled' || email.trim() === ''}
            aria-busy={sending}
            className="axon-pill min-h-[44px] bg-primary text-xs text-white disabled:opacity-60"
          >
            {sending ? 'Sending…' : problem === 'mail-failed' ? 'Try again' : 'Email me my link'}
          </button>
          {copyButton}
        </div>
      </form>
      <p className="mt-2 text-xs text-gray-600">
        Anyone with a copied link can open your reservation, so don&apos;t share it publicly.
      </p>
      {copyFeedback && <div className="mt-3">{copyFeedback}</div>}
      <button
        type="button"
        onClick={onLeave}
        className="mt-2 min-h-[44px] text-xs font-medium text-gray-500 underline hover:text-primary"
      >
        No thanks, take me back to the event
      </button>
    </section>
  );
}
