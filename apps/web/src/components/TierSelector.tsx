'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { formatPHP, centavosToPeso } from '@axon-tickets/utils';
import Button from '@/components/Button';

interface Tier {
  id: string;
  name: string;
  price: number;
  availableQuantity: number;
  maxPerOrder: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
}

interface Props {
  eventId: string;
  eventSlug: string;
  maxPerUser: number;
  tiers: Tier[];
  disabled: boolean;
}

export default function TierSelector({ eventId, eventSlug, tiers, disabled }: Props) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { setReservation } = useCartStore();
  const [selectedTierId, setSelectedTierId] = useState<string | null>(
    tiers[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const selectedTier = tiers.find((t) => t.id === selectedTierId);
  const maxQty = Math.min(selectedTier?.maxPerOrder ?? 4, selectedTier?.availableQuantity ?? 0);

  async function handleReserve() {
    if (!isAuthenticated) {
      router.push(`/auth/login`);
      return;
    }
    if (!selectedTier) return;
    setLoading(true);
    try {
      const idempotencyKey = `${selectedTier.id}-${Date.now()}`;
      const res = await api.post<{ data: { id: string; expiresAt: string } }>('/reservations', {
        tierId: selectedTier.id,
        quantity,
        idempotencyKey,
      });
      const reservation = res.data.data;
      setReservation(
        reservation.id,
        selectedTier.id,
        selectedTier.name,
        quantity,
        selectedTier.price,
        eventSlug,
        new Date(reservation.expiresAt),
      );
      router.push(`/checkout/${reservation.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not reserve tickets');
    } finally {
      setLoading(false);
    }
  }

  if (tiers.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
        Tickets not available yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5 sticky top-20">
      <h2 className="text-lg font-semibold text-gray-900">Get Tickets</h2>

      <div className="space-y-2">
        {tiers.map((tier) => (
          <button
            key={tier.id}
            onClick={() => { setSelectedTierId(tier.id); setQuantity(1); }}
            disabled={tier.availableQuantity === 0 || disabled}
            className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors ${
              selectedTierId === tier.id
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-gray-200 text-gray-700 hover:border-gray-300'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <div className="text-left">
              <p className="font-medium">{tier.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {tier.availableQuantity > 0 ? `${tier.availableQuantity} left` : 'Sold out'}
              </p>
            </div>
            <span className="font-semibold ml-4 shrink-0">{formatPHP(centavosToPeso(tier.price))}</span>
          </button>
        ))}
      </div>

      {selectedTier && maxQty > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
          <select
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      {selectedTier && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Total</span>
          <span className="font-bold text-gray-900 text-base">
            {formatPHP(centavosToPeso(selectedTier.price * quantity))}
          </span>
        </div>
      )}

      <Button
        onClick={handleReserve}
        loading={loading}
        disabled={disabled || !selectedTier || maxQty === 0}
        className="w-full"
        size="lg"
      >
        {disabled ? 'Unavailable' : 'Reserve Tickets'}
      </Button>

      <p className="text-xs text-gray-400 text-center">
        15-minute hold · No cancellations after payment
      </p>
    </div>
  );
}
