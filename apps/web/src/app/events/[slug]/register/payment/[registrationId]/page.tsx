'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth';
import api from '@/lib/api';
import CheckoutStepper from '@/components/CheckoutStepper';
import PaymentProofDropzone from '@/components/PaymentProofDropzone';
import type { Registration } from '@axon-tickets/types';

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
      router.replace(`/auth/login?redirect=/events/${slug}/register/payment/${registrationId}`);
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
    router.push(`/registrations/${registrationId}`);
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
    instructions?: string;
  }>;
  const hasBank = ev.bankName || ev.bankAccountNumber;

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <CheckoutStepper current={2} />

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
              ₱{reg.total.toLocaleString()}
            </p>
            <button
              onClick={() => copy('amount', String(reg.total))}
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
            <a href="mailto:support@axontickets.com" className="text-primary hover:underline">
              Contact support
            </a>
          </span>
        </div>
      </div>
    </main>
  );
}
