'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Tier {
  id: string;
  name: string;
  price: number;
  available: number;
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
  disabled?: boolean;
}

export default function RegistrationPanel({
  eventSlug,
  tiers,
  bankName,
  gcashNumber,
  disabled = false,
}: Props) {
  const router = useRouter();
  const availableTiers = tiers.filter((t) => t.available > 0);
  const [selectedId, setSelectedId] = useState<string>(availableTiers[0]?.id ?? '');
  const [qty, setQty] = useState(1);

  const selected = tiers.find((t) => t.id === selectedId);
  const maxQty = Math.min(selected?.maxPerOrder ?? 10, selected?.available ?? 0);

  const handleRegister = () => {
    if (!selectedId) return;
    router.push(`/events/${eventSlug}/register?tierId=${selectedId}&qty=${qty}`);
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
          const soldOut = tier.available === 0;
          return (
            <button
              key={tier.id}
              type="button"
              disabled={soldOut || disabled}
              onClick={() => { setSelectedId(tier.id); setQty(1); }}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${
                selectedId === tier.id
                  ? 'border-primary bg-orange-50'
                  : soldOut || disabled
                  ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 hover:border-primary'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm text-gray-900">{tier.name}</span>
                <span className="text-sm font-semibold text-primary">
                  {tier.price === 0 ? 'Free' : `₱${tier.price.toLocaleString()}`}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {soldOut ? 'Sold out' : `${tier.available} slots left`}
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

      {/* Bank / GCash preview */}
      {(bankName || gcashNumber) && (
        <div className="bg-orange-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
          <p className="font-semibold text-gray-800 text-sm">Payment via bank transfer</p>
          {bankName && <p>{bankName}</p>}
          {gcashNumber && <p>GCash: {gcashNumber}</p>}
          <p className="text-gray-400">Details shown after registration</p>
        </div>
      )}

      <button
        type="button"
        disabled={!selectedId || disabled || maxQty === 0}
        onClick={handleRegister}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {disabled ? 'Unavailable' : 'Register Now'}
      </button>
    </div>
  );
}
