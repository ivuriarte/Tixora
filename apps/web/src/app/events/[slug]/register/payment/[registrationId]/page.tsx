'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth';
import api from '@/lib/api';
import CheckoutStepper from '@/components/CheckoutStepper';
import PaymentProofDropzone from '@/components/PaymentProofDropzone';
import type { Registration } from '@axon-tickets/types';
import { centavosToPeso, formatPHP } from '@axon-tickets/utils';

export default function PaymentStepPage() {
  const router = useRouter();
  const params = useParams<{ slug: string; registrationId: string }>();
  const { slug, registrationId } = params;

  const [reg, setReg] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/auth/access?redirect=/events/${slug}/register/payment/${registrationId}`);
      return;
    }
    (async () => {
      try {
        const res = await api.get(`/registrations/${registrationId}`);
        const body = res.data?.data ?? res.data;
        setReg(body);
      } catch {
        setError('We could not load your registration.');
      } finally {
        setLoading(false);
      }
    })();
  }, [registrationId, router, slug]);

  const handleUploaded = () => {
    router.push('/account/tickets?tab=registrations');
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
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 bg-white rounded-2xl border border-gray-200 animate-pulse"
            />
          ))}
        </div>
      </main>
    );
  }

  if (error || !reg) {
    return (
      <main className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">{error ?? 'Registration not found.'}</p>
          <button
            onClick={() => router.push(`/events/${slug}`)}
            className="mt-4 text-primary text-sm hover:underline"
          >
            Back to event
          </button>
        </div>
      </main>
    );
  }

  if (reg.status !== 'pending_payment' && reg.status !== 'rejected') {
    // Already submitted / verified / cancelled — send to status page.
    router.replace(`/registrations/${registrationId}`);
    return null;
  }

  const ev = reg.event;
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
        <CheckoutStepper current={2} />

        {/* Back navigation */}
        {reg.status === 'pending_payment' && (
          <button
            onClick={() =>
              reg.tierId
                ? router.push(
                    `/events/${slug}/register?registrationId=${registrationId}&tierId=${reg.tierId}&qty=${reg.attendeeCount}`,
                  )
                : router.push(`/events/${slug}`)
            }
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
            {reg.tierId ? 'Back to Attendee Details' : 'Back to Event'}
          </button>
        )}

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Payment</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reference{' '}
            <span className="font-mono text-primary font-semibold">{reg.referenceNumber}</span>{' '}
            · {ev.title}
          </p>
        </div>

        {/* Amount due */}
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5">
          <p className="text-xs uppercase tracking-wide text-primary/80 font-semibold">
            Amount Due
          </p>
          <div className="mt-1 flex items-end gap-3">
            <p className="text-3xl font-bold text-gray-900">
              {formatPHP(centavosToPeso(reg.total))}
            </p>
            <button
              onClick={() => copy('amount', centavosToPeso(reg.total).toFixed(2))}
              className="mb-1 text-xs font-medium text-primary hover:underline"
            >
              {copied === 'amount' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Transfer the <span className="font-semibold">exact amount</span> and include your
            reference number in the remarks.
          </p>
        </div>

        {/* Payment methods */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 mb-5 space-y-3">
          <header>
            <h2 className="font-semibold text-gray-900">Pay using any of these methods</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Send the payment, screenshot the confirmation, then upload it below.
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
                      <img
                        src={m.qrImageUrl}
                        alt={`${m.name} QR Code`}
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
                  full <span className="font-semibold">{formatPHP(centavosToPeso(reg.total))}</span>{' '}
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
        <section className="rounded-2xl border border-gray-200 bg-white p-5 mb-5">
          <header className="mb-3">
            <h2 className="font-semibold text-gray-900">Upload Proof of Payment</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Once submitted, the organizer will verify your payment and email your tickets.
            </p>
          </header>
          <PaymentProofDropzone
            registrationId={registrationId}
            onUploaded={handleUploaded}
          />
        </section>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <button
            onClick={() => router.push(`/registrations/${registrationId}`)}
            className="hover:text-gray-700"
          >
            I&apos;ll pay later
          </button>
          <span>
            Need help?{' '}
            <a href="mailto:support@axontickets.online" className="text-primary hover:underline">
              Contact support
            </a>
          </span>
        </div>
      </div>
    </main>
  );
}
