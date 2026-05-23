'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatPHP, centavosToPeso } from '@axon-tickets/utils';

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
  const [qty, setQty] = useState(1);

  const selected = tiers.find((t) => t.id === selectedId);
  const maxQty = Math.min(selected?.maxPerOrder ?? 10, selected?.availableQuantity ?? 0);

  const handleRegister = () => {
    if (!selectedId) return;
    startTransition(() => {
      router.push(`/events/${eventSlug}/register?tierId=${selectedId}&qty=${qty}`);
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
      <h3 className="font-semibold text-gray-900">Register</h3>

      {/* Tier picker */}
      <div className="space-y-2">
        {tiers.map((tier) => {
          const soldOut = tier.availableQuantity === 0;
          return (
            <button
              key={tier.id}
              type="button"
              disabled={soldOut || disabled}
              onClick={() => { setSelectedId(tier.id); setQty(1); }}
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

      {/* Quantity */}
      {selected && !disabled && (
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

      {/* Payment methods — new card format */}
      {paymentMethods && paymentMethods.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold text-gray-800 text-sm">Payment Options</p>
          {paymentMethods.map((pm, i) => (
            <div key={i} className="bg-violet-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${
                pm.type === 'bank' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
              }`}>
                {pm.type === 'bank' ? 'Bank Transfer' : 'E-Wallet'}
              </span>
              {pm.name && <p className="font-medium text-gray-800">{pm.name}</p>}
              {pm.accountName && <p>Account: {maskAccountName(pm.accountName)}</p>}
              {pm.accountNumber && <p>Number: {maskAccountNumber(pm.accountNumber)}</p>}
              {pm.qrImageUrl && (
                <img src={pm.qrImageUrl} alt="Payment QR" className="mt-1 h-24 w-24 object-contain rounded border border-gray-200" />
              )}
            </div>
          ))}
          <p className="text-xs text-gray-400">Full details shown after registration</p>
        </div>
      )}

      {/* Legacy flat fields fallback for old events */}
      {(!paymentMethods || paymentMethods.length === 0) && (bankName || gcashNumber) && (
        <div className="bg-violet-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
          <p className="font-semibold text-gray-800 text-sm">Payment via bank transfer</p>
          {bankName && <p>{bankName}</p>}
          {gcashNumber && <p>GCash: {gcashNumber}</p>}
          <p className="text-gray-400">Details shown after registration</p>
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
        {isPending ? 'Loading…' : disabled ? 'Unavailable' : 'Register Now'}
      </button>
    </div>
  );
}
