'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth';
import api from '@/lib/api';
import CheckoutStepper from '@/components/CheckoutStepper';
import PaymentProofDropzone from '@/components/PaymentProofDropzone';
import type { Registration } from '@axon-tickets/types';
import { formatPHP } from '@axon-tickets/utils';
import { trackPixelCustomEvent, trackPixelEvent } from '@/lib/metaPixel';
import { trackInternalFunnelEvent } from '@/lib/funnel';
import { ErrorState, ScreenSkeleton } from '@/components/ScreenState';
import FulfillmentInstructions from '@/components/FulfillmentInstructions';
import ConfirmModal from '@/components/ConfirmModal';
import HoldBanner from '@/components/guest-hold/HoldBanner';
import PayLaterCard from '@/components/guest-hold/PayLaterCard';
import ReservationEndState, { type ReservationEndVariant } from '@/components/guest-hold/ReservationEndState';
import {
  classifyMissingReservation,
  forgetHold,
  readApiFailure,
  readRememberedDeadline,
  rememberDeadline,
} from '@/lib/guestHold';

export default function PaymentStepPage() {
  const router = useRouter();
  const params = useParams<{ slug: string; registrationId: string }>();
  const { slug, registrationId } = params;

  const [reg, setReg] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [guestAccessToken, setGuestAccessToken] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [endState, setEndState] = useState<ReservationEndVariant | null>(null);
  const [renewed, setRenewed] = useState(false);
  // True from the moment the on-screen timer hits zero until the server has answered.
  const [checkingHold, setCheckingHold] = useState(false);
  const [showPayLater, setShowPayLater] = useState(false);
  // True once this page has seen a hold deadline, so a cancelled read afterwards means "expired".
  const sawHold = useRef(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Event organizer for the "We couldn't open this registration" screen (Contact link).
  const [organizer, setOrganizer] = useState<{ name: string; slug: string } | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelProblem, setCancelProblem] = useState<'network' | 'proof' | 'throttled' | null>(null);

  // A logged-in visitor asked for a registration that is not theirs (the API answers 404 either
  // way). Show the clear screen. One extra event lookup, only here, finds the organizer page.
  const notOwnedTrackedRef = useRef(false);
  const showNotYours = useCallback(async () => {
    // Look the organizer up BEFORE showing the screen (short timeout), so a paid customer never
    // sees "Start again" alone first and then has the Contact button push it down.
    let eventId: string | undefined;
    try {
      const res = await api.get(`/events/${slug}`, { timeout: 4000 });
      const event = res.data?.data ?? res.data;
      if (typeof event?.id === 'string') eventId = event.id;
      if (event?.organizerSlug && event?.organizerName) {
        setOrganizer({ name: event.organizerName, slug: event.organizerSlug });
      }
    } catch {
      // The screen simply omits the Contact link.
    }
    setEndState('notyours');
    if (notOwnedTrackedRef.current) return;
    notOwnedTrackedRef.current = true;
    void trackInternalFunnelEvent({
      step: 'order_not_owned_seen',
      status: 'blocked',
      eventId,
      metadata: { where: 'payment' },
    });
  }, [slug]);

  const loadReservation = useCallback(
    async (guestToken: string | null, options: { quiet?: boolean } = {}) => {
      try {
        const res = guestToken
          ? await api.get(`/registrations/guest/${registrationId}`, {
              headers: { 'x-registration-token': guestToken },
            })
          : await api.get(`/registrations/${registrationId}`);
        const body = res.data?.data ?? res.data;
        setReg(body);
        setError(null);
        const deadline = typeof body?.holdExpiresAt === 'string' ? body.holdExpiresAt : null;
        if (deadline) sawHold.current = true;
        setHoldExpiresAt(deadline);
        if (guestToken) rememberDeadline(window.sessionStorage, registrationId, deadline);
        return body as Registration;
      } catch (err) {
        const failure = readApiFailure(err);
        if (guestToken && failure.status === 404) {
          // Missing, expired-and-removed, or opened on another device: the API cannot tell
          // which, so use the last deadline this browser saw.
          setEndState(classifyMissingReservation(readRememberedDeadline(window.sessionStorage, registrationId)));
        } else if (options.quiet) {
          // A background re-check (the hold timer reached zero) must never replace the
          // page with an error screen because of a momentary network problem.
        } else if (!guestToken && failure.status === 404) {
          // Awaited so `loading` stays true (skeleton) until the screen is ready.
          await showNotYours();
        } else if (failure.status === 429) {
          setEndState('throttled');
        } else {
          setError('We could not load your registration.');
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [registrationId, showNotYours],
  );

  useEffect(() => {
    const scopedGuestToken = window.sessionStorage.getItem(`axon_guest_registration_${registrationId}`);
    setGuestAccessToken(scopedGuestToken);
    setRenewed(new URLSearchParams(window.location.search).get('renewed') === '1');
    if (!getAccessToken() && !scopedGuestToken) {
      router.replace(`/auth/access?redirect=/events/${slug}/register/payment/${registrationId}`);
      return;
    }
    void loadReservation(scopedGuestToken);
  }, [loadReservation, registrationId, router, slug]);

  useEffect(() => {
    if (endState !== 'expired') return;
    void trackInternalFunnelEvent({ step: 'hold_expired_seen', status: 'abandoned' });
  }, [endState]);

  // The banner reached zero. The server may keep the seats a few minutes longer, so ask it
  // before deciding: only show the expired screen once the reservation is really gone.
  const handleHoldExpired = useCallback(async () => {
    setCheckingHold(true);
    // The on-screen timer can reach zero up to a second before the server's deadline, so ask
    // again shortly after the deadline instead of giving up on the first answer.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const latest = await loadReservation(guestAccessToken, { quiet: true });
      if (latest?.status === 'cancelled') {
        setEndState('expired');
        return;
      }
      if (!latest) break;
      const deadline = latest.holdExpiresAt ? new Date(latest.holdExpiresAt).getTime() : 0;
      const wait = Math.max(0, deadline - Date.now()) + 1000;
      if (!deadline || wait > 15_000 || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    setCheckingHold(false);
  }, [guestAccessToken, loadReservation]);

  const goToUpload = useCallback(() => {
    setShowPayLater(false);
    setCancelOpen(false);
    requestAnimationFrame(() => {
      const target = document.getElementById('upload-proof');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus();
    });
  }, []);

  const cancelReservation = useCallback(async () => {
    if (!guestAccessToken) return;
    setCancelBusy(true);
    setCancelProblem(null);
    try {
      await api.post(`/registrations/guest/${registrationId}/cancel`, undefined, {
        headers: { 'x-registration-token': guestAccessToken },
      });
      const eventId = (reg as (Registration & { eventId?: string }) | null)?.eventId;
      if (eventId) forgetHold(window.sessionStorage, eventId);
      void trackInternalFunnelEvent({ eventId, step: 'hold_cancelled', status: 'abandoned' });
      setCancelOpen(false);
      setEndState('cancelled');
    } catch (err) {
      const failure = readApiFailure(err);
      if (failure.code === 'HAS_PROOF') setCancelProblem('proof');
      else if (failure.status === 429) setCancelProblem('throttled');
      else if (failure.code === 'NOT_PENDING' || failure.status === 404) {
        setCancelOpen(false);
        void loadReservation(guestAccessToken);
      } else setCancelProblem('network');
    } finally {
      setCancelBusy(false);
    }
  }, [guestAccessToken, loadReservation, reg, registrationId]);

  useEffect(() => {
    if (!reg) return;
    const trackedEventId = (reg as Registration & { eventId?: string }).eventId;

    const totalPesos = reg.total;
    trackPixelEvent(
      'InitiateCheckout',
      {
        content_type: 'event_ticket',
        content_ids: trackedEventId ? [trackedEventId] : [],
        content_name: reg.event.title,
        currency: reg.currency || 'PHP',
        value: totalPesos,
        num_items: reg.attendeeCount || 1,
      },
      `initiate-checkout:${reg.id}`,
    );

    void trackInternalFunnelEvent({
      eventId: trackedEventId,
      step: 'payment_started',
      status: 'success',
      metadata: {
        registrationId: reg.id,
        eventSlug: reg.event.slug,
        attendeeCount: reg.attendeeCount,
        total: reg.total,
      },
    });
  }, [reg]);

  const handleUploaded = () => {
    if (reg) {
      const trackedEventId = (reg as Registration & { eventId?: string }).eventId;
      const totalPesos = reg.total;
      trackPixelEvent('AddPaymentInfo', {
        content_name: reg.event.title,
        currency: reg.currency || 'PHP',
        value: totalPesos,
      });
      trackPixelCustomEvent('Payment_Proof_Submitted', {
        event_id: trackedEventId ?? null,
        event_name: reg.event.title,
        currency: reg.currency || 'PHP',
        value: totalPesos,
      });
    }
    const guestQuery = guestAccessToken ? '&guest=1' : '';
    router.push(
      `/events/${slug}/register?registrationId=${registrationId}&tierId=${reg?.tierId ?? ''}&qty=${reg?.attendeeCount ?? 1}${guestQuery}`,
    );
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-4">
          <ScreenSkeleton rows={5} />
        </div>
      </main>
    );
  }

  if (endState) {
    return (
      <main className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
        <div className="w-full max-w-lg px-4">
          <ReservationEndState
            variant={endState}
            slug={slug}
            pageHeading
            organizer={organizer}
            onRetry={
              endState === 'throttled'
                ? () => {
                    setEndState(null);
                    setLoading(true);
                    void loadReservation(guestAccessToken);
                  }
                : undefined
            }
          />
        </div>
      </main>
    );
  }

  if (error || !reg) {
    return (
      <main className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
        <div className="w-full max-w-lg px-4"><ErrorState title="Payment screen unavailable" message={error ?? 'This registration may have been removed or the link is incorrect.'} action={<button onClick={() => router.push(`/events/${slug}`)} className="axon-pill bg-primary text-xs text-white">Back to event</button>} /></div>
      </main>
    );
  }

  if (reg.status === 'cancelled' && (guestAccessToken || sawHold.current)) {
    return (
      <main className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
        <div className="w-full max-w-lg px-4">
          <ReservationEndState variant="expired" slug={slug} pageHeading />
        </div>
      </main>
    );
  }

  if (reg.status === 'proof_submitted') {
    const guestQuery = guestAccessToken ? '&guest=1' : '';
    router.replace(
      `/events/${slug}/register?registrationId=${registrationId}&tierId=${reg.tierId ?? ''}&qty=${reg.attendeeCount}${guestQuery}`,
    );
    return null;
  }

  if (reg.status !== 'pending_payment' && reg.status !== 'rejected') {
    router.replace(guestAccessToken ? `/events/${slug}` : `/registrations/${registrationId}`);
    return null;
  }

  const ev = reg.event;
  const inclusionItems = reg.lineItems?.filter((item) => item.kind === 'inclusion') ?? [];
  const hasAddOns = inclusionItems.length > 0;
  const methods = (ev.paymentMethods ?? []) as Array<{
    name: string;
    type?: string;
    accountName?: string;
    accountNumber?: string;
    qrImageUrl?: string;
    instructions?: string;
  }>;
  const hasBank = ev.bankName || ev.bankAccountNumber;

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <CheckoutStepper
          current={hasAddOns ? 3 : 1}
          flow="paid-payment-first"
          includesAddOns={hasAddOns}
        />

        {/* Back navigation */}
        {reg.status === 'pending_payment' && (
          <button
            onClick={() => router.push(`/events/${slug}`)}
            className="mt-4 mb-1 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors group"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
            >
              <path
                fillRule="evenodd"
                d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd"
              />
            </svg>
            Back to event
          </button>
        )}

        {/* Header */}
        <div className="mb-6">
          <h1 className="axon-display text-4xl">Complete Your Payment</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reference{' '}
            <span className="font-mono text-primary font-semibold">{reg.referenceNumber}</span>{' '}
            · {ev.title}
          </p>
        </div>

        {/* Guests and logged-in customers share the same hold banner and expired screen. */}
        {reg.status === 'pending_payment' && (
          <HoldBanner deadlineIso={holdExpiresAt} onExpired={handleHoldExpired} renewed={renewed} />
        )}
        {reg.status === 'pending_payment' && checkingHold && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
            <p className="font-semibold">Checking your reservation…</p>
            <p className="mt-1 text-xs text-amber-800">
              The hold time on screen has ended. If your seats were released you will be asked to start
              again; otherwise you can still upload your proof.
            </p>
          </div>
        )}

        {/* Amount due */}
        <div className="mb-5 rounded-lg border border-primary/20 bg-[#ede9fe] p-5">
          <p className="text-xs uppercase tracking-wide text-primary/80 font-semibold">
            Amount Due
          </p>
          <div className="mt-1 flex items-end gap-3">
            <p className="text-3xl font-bold text-gray-900">
              {formatPHP(reg.total)}
            </p>
            <button
              onClick={() => copy('amount', String(reg.total))}
              className="mb-1 min-h-[44px] px-3 text-xs font-bold text-primary hover:underline"
            >
              {copied === 'amount' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Transfer the <span className="font-semibold">exact amount</span> and include your
            reference number in the remarks.
          </p>
        </div>

        {hasAddOns && reg.inclusionHoldExpiresAt && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
            <p className="font-semibold">Your add-on stock is held until {new Date(reg.inclusionHoldExpiresAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}.</p>
            <p className="mt-1 text-xs text-amber-800">Upload one proof for the exact basket total before the hold expires. Expired add-on stock is released automatically.</p>
          </div>
        )}

        {reg.lineItems && reg.lineItems.length > 0 && (
          <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900">Payment breakdown</h2>
            <div className="mt-3 space-y-2 text-sm">
              {reg.lineItems.map((item, index) => (
                <div key={item.id ?? `${item.kind}-${index}`} className="flex items-start justify-between gap-4 text-gray-600">
                  <div className="min-w-0 flex-1">
                    <span>{item.name}{item.variantName ? ` · ${item.variantName}` : ''} × {item.quantity}</span>
                    {item.attendeeName && <span className="block text-xs text-gray-400">For {item.attendeeName}</span>}
                    {item.kind === 'inclusion' && (
                      <FulfillmentInstructions instructions={item.fulfillmentInstructions} />
                    )}
                  </div>
                  <span>{item.total === 0 ? 'Free' : formatPHP(item.total)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-100 pt-3 font-bold text-gray-900">
                <span>Exact amount to transfer</span>
                <span className="text-primary">{formatPHP(reg.total)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Payment methods */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 mb-5 space-y-3">
          <header>
            <h2 className="font-semibold text-gray-900">Choose how to pay</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Send the exact amount using one of the options below, then take a screenshot and upload it.
            </p>
          </header>

          {methods.length === 0 && !hasBank && (
            <p className="text-sm text-gray-500 italic">
              The organizer has not configured payment methods. Please contact them directly.
            </p>
          )}

          <div className="space-y-3">
            {methods.map((m, i) => (
              <div
                key={i}
                className="rounded-xl border border-gray-100 bg-gray-50 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-900">{m.name}</span>
                  {m.type && (
                    <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {m.type}
                    </span>
                  )}
                </div>
                {m.accountName && (
                  <div className="mt-1 text-xs text-gray-600">
                    <span className="font-medium">Account Name:</span> {m.accountName}
                  </div>
                )}
                {m.accountNumber && (
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-600">
                    <span>
                      <span className="font-medium">Account No.:</span>{' '}
                      <span className="font-mono">{m.accountNumber}</span>
                    </span>
                    <button
                      onClick={() => copy(`acct-${i}`, m.accountNumber!)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      {copied === `acct-${i}` ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
                {m.instructions && (
                  <p className="mt-1 text-xs text-gray-500">{m.instructions}</p>
                )}
                {m.qrImageUrl && (
                  <div className="mt-3 flex justify-center">
                    <div className="inline-block rounded-lg border-2 border-gray-200 bg-white p-2 shadow-sm">
                      <Image
                        src={m.qrImageUrl}
                        alt={`${m.name} QR Code`}
                        width={192}
                        height={192}
                        unoptimized
                        className="h-48 w-48 object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {hasBank && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="font-semibold text-sm text-gray-900">Bank Transfer</div>
                {ev.bankName && (
                  <div className="mt-1 text-xs text-gray-600">
                    <span className="font-medium">Bank:</span> {ev.bankName}
                  </div>
                )}
                {ev.bankAccountName && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">Account Name:</span> {ev.bankAccountName}
                  </div>
                )}
                {ev.bankAccountNumber && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>
                      <span className="font-medium">Account No.:</span>{' '}
                      <span className="font-mono">{ev.bankAccountNumber}</span>
                    </span>
                    <button
                      onClick={() => copy('bank', ev.bankAccountNumber!)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      {copied === 'bank' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Group booking — single-receipt policy (shown only for multi-attendee registrations) */}
        {reg.attendeeCount > 1 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 mb-5">
            <div className="flex items-start gap-4">
              {/* Icon badge */}
              <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-amber-100 gap-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-amber-600"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2V4a2 2 0 0 0-2-2z" />
                  <line x1="9" y1="9" x2="15" y2="9" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                  <line x1="9" y1="17" x2="11" y2="17" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-900 text-sm">
                  Group booking &mdash; upload exactly 1 receipt
                </p>
                <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                  This registration covers{' '}
                  <span className="font-semibold">{reg.attendeeCount} attendees</span>. Transfer the
                  full <span className="font-semibold">{formatPHP(reg.total)}</span>{' '}
                  in a single payment and upload <span className="font-semibold">one receipt</span> below.
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-amber-700">
                  <li className="flex items-center gap-1.5">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-amber-500">
                      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.03 5.03l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 111.06-1.06l.97.97 2.97-2.97a.75.75 0 111.06 1.06z" />
                    </svg>
                    One receipt per order — no split payments
                  </li>
                  <li className="flex items-center gap-1.5">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-amber-500">
                      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.03 5.03l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 111.06-1.06l.97.97 2.97-2.97a.75.75 0 111.06 1.06z" />
                    </svg>
                    Amount must match the total shown above exactly
                  </li>
                  <li className="flex items-center gap-1.5">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-amber-500">
                      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.03 5.03l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 111.06-1.06l.97.97 2.97-2.97a.75.75 0 111.06 1.06z" />
                    </svg>
                    Multiple receipts will be rejected
                  </li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Upload */}
        <section id="upload-proof" tabIndex={-1} className="rounded-2xl border border-gray-200 bg-white p-5 mb-5 outline-none">
          <header className="mb-3">
            <h2 className="font-semibold text-gray-900">Upload Your Payment Screenshot</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Take a screenshot of your transfer confirmation and upload it here.
              Once approved, your QR ticket will be emailed to you. The QR is for admission only;
              add-ons follow the separate fulfillment instructions in your registration.
            </p>
          </header>
          <PaymentProofDropzone
            registrationId={registrationId}
            guestAccessToken={guestAccessToken ?? undefined}
            onUploaded={handleUploaded}
            onExpired={() => setEndState('expired')}
          />
        </section>

        <aside className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-gray-700">
          <p className="font-semibold text-gray-900">What happens next?</p>
          <p className="mt-1">
            After your proof uploads, we will ask for the attendee details. You can review the
            payment, attendees, and order total before final confirmation.
          </p>
        </aside>

        {guestAccessToken && showPayLater && (
          <PayLaterCard
            registrationId={registrationId}
            guestAccessToken={guestAccessToken}
            eventId={(reg as Registration & { eventId?: string }).eventId}
            eventSlug={slug}
            holdExpiresAt={holdExpiresAt}
            onHoldChanged={(deadline) => {
              setHoldExpiresAt(deadline);
              rememberDeadline(window.sessionStorage, registrationId, deadline);
            }}
            onExpired={() => setEndState('expired')}
            onLeave={() => router.push(`/events/${slug}`)}
            onUploadNow={goToUpload}
          />
        )}

        <div className="flex items-center justify-between text-xs text-gray-500">
          {guestAccessToken ? (
            !showPayLater && reg.status === 'pending_payment' ? (
              <button
                type="button"
                onClick={() => setShowPayLater(true)}
                className="min-h-[44px] font-medium hover:text-primary"
              >
                I will pay later
              </button>
            ) : (
              <span />
            )
          ) : (
            <button
              onClick={() => router.push(`/registrations/${registrationId}`)}
              className="min-h-[44px] font-medium hover:text-primary"
            >
              {/* Logged-in holds are not extended, so this does not promise more time. */}
              View my registration
            </button>
          )}
          <span>
            Need help?{' '}
            <a href="mailto:support@axontickets.online" className="text-primary hover:underline">
              Contact us
            </a>
          </span>
        </div>

        {guestAccessToken && reg.status === 'pending_payment' && (
          <div className="mt-2 border-t border-gray-200 pt-2">
            <button
              type="button"
              onClick={() => {
                setCancelProblem(null);
                setCancelOpen(true);
              }}
              className="min-h-[44px] text-xs font-medium text-red-700 underline hover:text-red-900"
            >
              Cancel reservation
            </button>
          </div>
        )}

        <ConfirmModal
          open={cancelOpen}
          loading={cancelBusy}
          variant="danger"
          title={
            cancelProblem === 'proof'
              ? "This reservation can't be cancelled here"
              : cancelProblem === 'throttled'
                ? 'Too many attempts'
                : cancelProblem === 'network'
                  ? "We couldn't cancel your reservation"
                  : 'Cancel this reservation?'
          }
          message={
            cancelProblem === 'proof'
              ? 'Your payment proof was already uploaded, so it is waiting for review.'
              : cancelProblem === 'throttled'
                ? 'Please wait a minute and try again.'
                : cancelProblem === 'network'
                  ? 'Check your connection and try again.'
                  : 'Your seats go back on sale right away. Nothing was charged.'
          }
          confirmLabel={
            cancelProblem === 'proof' ? 'Upload proof' : cancelProblem ? 'Try again' : 'Cancel reservation'
          }
          cancelLabel="Keep my seats"
          onConfirm={() => (cancelProblem === 'proof' ? goToUpload() : void cancelReservation())}
          onCancel={() => {
            setCancelOpen(false);
            setCancelProblem(null);
          }}
        />
      </div>
    </main>
  );
}
