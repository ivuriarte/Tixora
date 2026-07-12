'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatPHP, centavosToPeso } from '@axon-tickets/utils';
import { trackPixelCustomEvent } from '@/lib/metaPixel';
import { trackInternalFunnelEvent } from '@/lib/funnel';

/** Privacy: keep first letter of each word, mask the rest. "Ian Uriarte" -> "I•• U••••••" */
function maskAccountName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 1 ? w : w[0] + '•'.repeat(Math.max(1, w.length - 1))))
    .join(' ');
}

/** Privacy: keep last 4 digits of an account/phone number. "09254626315" -> "•••••••6315" */
function maskAccountNumber(num: string): string {
  const digits = num.replace(/\D/g, '');
  if (digits.length <= 4) return num;
  return '•'.repeat(digits.length - 4) + digits.slice(-4);
}

interface Tier {
  id: string;
  name: string;
  price: number;
  availableQuantity: number;
  totalQuantity: number;
  maxPerOrder: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
}

interface Props {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  tiers: Tier[];
  bankName: string | null;
  gcashNumber: string | null;
  paymentMethods?: Array<{
    type: string;
    name?: string;
    accountName?: string;
    accountNumber?: string;
    qrImageUrl?: string;
  }> | null;
  disabled?: boolean;
}

export default function RegistrationPanel({
  eventId,
  eventTitle,
  eventSlug,
  tiers,
  bankName,
  gcashNumber,
  paymentMethods,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const availableTiers = tiers.filter((t) => t.availableQuantity > 0);
  const [selectedId, setSelectedId] = useState<string>(availableTiers[0]?.id ?? '');
  const [qty, setQty] = useState(() => {
    const first = tiers.find((t) => t.availableQuantity > 0);
    return first ? Math.min(first.maxPerOrder, first.availableQuantity) : 1;
  });

  const selected = tiers.find((t) => t.id === selectedId);
  const maxQty = Math.min(selected?.maxPerOrder ?? 10, selected?.availableQuantity ?? 0);

  const handleRegister = () => {
    if (!selectedId) return;

    const nextUrl = `/events/${eventSlug}/register?tierId=${selectedId}&qty=${qty}&eventId=${encodeURIComponent(eventId)}&eventSlug=${encodeURIComponent(eventSlug)}&eventName=${encodeURIComponent(eventTitle)}`;

    trackPixelCustomEvent(
      'RegisterCTA_Clicked',
      {
        event_id: eventId,
        event_name: eventTitle,
        event_slug: eventSlug,
      },
      `register-cta:${eventId}:${selectedId}:${qty}`,
    );

    void trackInternalFunnelEvent({
      eventId,
      step: 'register_cta_clicked',
      status: 'success',
      metadata: {
        eventSlug,
        eventTitle,
        tierId: selectedId,
        qty,
        returnUrl: nextUrl,
      },
    });

    startTransition(() => {
      router.push(nextUrl);
    });
  };

  if (tiers.length === 0) {
    return (
      <div className="sticky top-6 bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <p className="text-sm text-gray-500 text-center">No ticket tiers available yet.</p>
      </div>
    );
  }

  return (
    <div className="sticky top-6 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">Get Tickets</h3>

      {/* Tier picker */}
      <div className="space-y-2">
        {tiers.map((tier) => {
          const soldOut = tier.availableQuantity === 0;
          return (
            <button
              key={tier.id}
              type="button"
              disabled={soldOut || disabled}
              onClick={() => { setSelectedId(tier.id); setQty(Math.min(tier.maxPerOrder, tier.availableQuantity)); }}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${
                selectedId === tier.id
                  ? 'border-primary bg-violet-50'
                  : soldOut || disabled
                  ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 hover:border-primary'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm text-gray-900">{tier.name}</span>
                <span className="text-sm font-semibold text-primary">
                  {tier.price === 0 ? 'Free' : formatPHP(centavosToPeso(tier.price))}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {soldOut ? 'Sold out' : `${tier.availableQuantity} slots left`}
              </p>
            </button>
          );
        })}
      </div>

      {/* Quantity — hidden when tier only allows 1 per transaction */}
      {selected && !disabled && maxQty > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Attendees</span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:border-primary"
            >
              −
            </button>
            <span className="w-6 text-center font-medium">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:border-primary"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Running total */}
      {selected && !disabled && qty > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm space-y-1.5">
          <div className="flex justify-between text-gray-600">
            <span>{selected.name}</span>
            <span>{selected.price === 0 ? 'Free' : formatPHP(centavosToPeso(selected.price))}</span>
          </div>
          {qty > 1 && (
            <div className="flex justify-between text-gray-500 text-xs">
              <span>Quantity</span>
              <span>× {qty}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-2">
            <span>Total</span>
            <span className="text-primary">
              {selected.price === 0 ? 'Free' : formatPHP(centavosToPeso(selected.price) * qty)}
            </span>
          </div>
        </div>
      )}

      {/* Group booking — single-receipt policy notice */}
      {selected && !disabled && qty > 1 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2V4a2 2 0 0 0-2-2z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-amber-800">One receipt covers all attendees</p>
            <p className="mt-0.5 text-xs text-amber-700 leading-relaxed">
              Pay the full amount in a single transfer and upload{' '}
              <span className="font-semibold">one receipt only</span>. Multiple receipts per registration are not accepted.
            </p>
          </div>
        </div>
      )}

      {/* Payment methods — grouped by type, names only */}
      {paymentMethods && paymentMethods.length > 0 && (() => {
        const eWallets = paymentMethods.filter((pm) => pm.type !== 'bank' && pm.name);
        const bankMethods = paymentMethods.filter((pm) => pm.type === 'bank' && pm.name);
        return (
          <div className="space-y-2">
            <p className="font-semibold text-gray-800 text-sm">Payment Options</p>
            <div className="bg-violet-50 rounded-xl p-3 space-y-2.5">
              {eWallets.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    E-Wallet
                  </span>
                  {eWallets.map((pm, i) => (
                    <span key={i} className="text-xs font-medium text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                      {pm.name}
                    </span>
                  ))}
                </div>
              )}
              {bankMethods.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    Bank Transfer
                  </span>
                  {bankMethods.map((pm, i) => (
                    <span key={i} className="text-xs font-medium text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                      {pm.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400">Full details shown after registration</p>
          </div>
        );
      })()}

      {/* Legacy flat fields fallback for old events */}
      {(!paymentMethods || paymentMethods.length === 0) && (bankName || gcashNumber) && (
        <div className="bg-violet-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
          <p className="font-semibold text-gray-800 text-sm">Payment via bank transfer</p>
          {bankName && <p>{bankName}</p>}
          {gcashNumber && <p>GCash: {gcashNumber}</p>}
          <p className="text-gray-400">Full payment details shown after you register</p>
        </div>
      )}

      <button
        type="button"
        disabled={!selectedId || disabled || maxQty === 0 || isPending}
        onClick={handleRegister}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] disabled:active:scale-100 inline-flex items-center justify-center"
      >
        {isPending && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {isPending ? 'Loading…' : disabled ? 'Unavailable' : 'Reserve Tickets'}
      </button>
    </div>
  );
}
