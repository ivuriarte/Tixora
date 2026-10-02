'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { trackInternalFunnelEvent } from '@/lib/funnel';
import { ErrorState, ScreenSkeleton } from '@/components/ScreenState';
import ReservationEndState from '@/components/guest-hold/ReservationEndState';
import {
  parseResumeFragment,
  readApiFailure,
  rememberDeadline,
  type ResumeFragment,
} from '@/lib/guestHold';

type ResumeState = 'loading' | 'success' | 'retry' | 'invalid' | 'incomplete' | 'throttled';

/** Remove the tab-scoped copy of the link secret once it will not be needed again. */
function clearStoredFragment() {
  try {
    window.sessionStorage.removeItem('axon_resume_fragment');
  } catch {
    // Nothing to remove.
  }
}

/**
 * Opened from the "finish your payment" email or a copied link. The secret lives in the
 * URL fragment; `instrumentation-client.ts` has already moved it out of the address bar
 * before any tracker started (it is handed over through `window.__axonResumeFragment`).
 * Errors are told apart on purpose: a network problem offers a retry and never claims the
 * link is dead, because that would make a guest give up seats that are still held.
 */
export default function ResumePage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<ResumeState>('loading');
  const fragment = useRef<ResumeFragment | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  const run = useCallback(async () => {
    setState('loading');
    const parsed = fragment.current;
    if (!parsed || parsed.kind === 'none') {
      clearStoredFragment();
      setState('incomplete');
      return;
    }
    try {
      let registrationId: string;
      let eventSlug = slug;
      let nextStep: 'payment' | 'details' = 'payment';
      let tierId = '';
      let attendeeCount = 1;

      if (parsed.kind === 'emailed') {
        const response = await api.post('/registrations/guest/resume', { token: parsed.token });
        const body = response.data?.data ?? response.data;
        registrationId = body.registrationId;
        eventSlug = body.eventSlug ?? slug;
        window.sessionStorage.setItem(`axon_guest_registration_${registrationId}`, body.guestAccessToken);
        rememberDeadline(window.sessionStorage, registrationId, body.holdExpiresAt ?? null);
      } else {
        // A copied link carries the reservation's own access token: validate it with the
        // existing guest read, with no exchange and no rotation.
        const response = await api.get(`/registrations/guest/${parsed.registrationId}`, {
          headers: { 'x-registration-token': parsed.accessToken },
        });
        const body = response.data?.data ?? response.data;
        // Route by status: never offer an upload for a reservation that is not waiting for payment.
        if (body.status === 'proof_submitted') {
          nextStep = 'details';
          tierId = body.tierId ?? '';
          attendeeCount = body.attendeeCount ?? 1;
        } else if (body.status !== 'pending_payment') {
          clearStoredFragment();
          setState('invalid');
          return;
        }
        registrationId = parsed.registrationId;
        window.sessionStorage.setItem(`axon_guest_registration_${registrationId}`, parsed.accessToken);
        rememberDeadline(window.sessionStorage, registrationId, body.holdExpiresAt ?? null);
      }

      clearStoredFragment();
      void trackInternalFunnelEvent({ step: 'hold_resumed', status: 'success' });
      setState('success');
      router.replace(
        nextStep === 'payment'
          ? `/events/${eventSlug}/register/payment/${registrationId}`
          : `/events/${eventSlug}/register?registrationId=${registrationId}&tierId=${tierId}&qty=${attendeeCount}&guest=1`,
      );
    } catch (error) {
      const failure = readApiFailure(error);
      // Only a clear 404 is final. A network problem or throttle keeps the stored secret so
      // a reload can try again.
      if (failure.status === 404) {
        clearStoredFragment();
        setState('invalid');
      } else if (failure.status === 429) setState('throttled');
      else setState('retry');
    }
  }, [router, slug]);

  useEffect(() => {
    // Read the fragment exactly once (React may run this effect twice in development).
    if (fragment.current === null) {
      const handedOver = (window as unknown as { __axonResumeFragment?: string }).__axonResumeFragment;
      let raw = handedOver ?? '';
      if (!raw) {
        try {
          raw = window.sessionStorage.getItem('axon_resume_fragment') ?? '';
        } catch {
          raw = '';
        }
      }
      if (!raw) raw = window.location.hash;

      // Remove the in-memory copy and any visible fragment now. The tab-scoped sessionStorage
      // copy stays until the link reaches a final answer, so a reload after a temporary
      // failure can still retry (see clearStoredFragment).
      delete (window as unknown as { __axonResumeFragment?: string }).__axonResumeFragment;
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      fragment.current = parseResumeFragment(raw);
    }
    void run();
  }, [run]);

  useEffect(() => {
    if (state !== 'loading') headingRef.current?.focus();
  }, [state]);

  const startAgain = (
    <button
      type="button"
      onClick={() => router.push(`/events/${slug}`)}
      className="axon-pill min-h-[44px] bg-primary text-xs text-white"
    >
      Start again
    </button>
  );

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <h1 className="sr-only">Resuming your reservation</h1>
      <div
        className="mx-auto max-w-lg px-4 outline-none"
        ref={headingRef}
        tabIndex={-1}
        aria-label="Reservation status"
      >
        {state === 'loading' && <ScreenSkeleton rows={3} compact />}
        {state === 'success' && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
            <p className="font-semibold">Welcome back.</p>
            <p className="mt-1">Taking you to your payment page…</p>
          </div>
        )}
        {state === 'retry' && (
          <ErrorState
            title="We couldn't open your reservation"
            message="Check your connection and try again. Your seats are still held."
            action={
              <button type="button" onClick={() => void run()} className="axon-pill min-h-[44px] bg-primary text-xs text-white">
                Try again
              </button>
            }
          />
        )}
        {state === 'invalid' && (
          <ErrorState
            title="This link is no longer valid"
            message="The reservation may have expired or been cancelled. Nothing was charged. Start again to pick your seats."
            action={startAgain}
          />
        )}
        {state === 'incomplete' && (
          <ErrorState
            title="This link looks incomplete"
            message="Open the link from your email again. If it still doesn't work, start again."
            action={startAgain}
          />
        )}
        {state === 'throttled' && (
          <ReservationEndState variant="throttled" slug={slug} onRetry={() => void run()} />
        )}
      </div>
    </main>
  );
}
