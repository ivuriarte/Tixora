'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { formatPHP } from '@axon-tickets/utils';
import Button from '@/components/Button';

interface Tier {
  id: string;
  name: string;
  price: number;
  inclusions?: Array<{ id?: string; label: string; stubEnabled?: boolean; sortOrder?: number }>;
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
      router.push(`/auth/access?redirect=${encodeURIComponent(`/events/${eventSlug}`)}`);
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
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.message;
      if (status === 409) {
        toast.error(serverMsg ?? 'This tier is sold out. Try a different ticket type.');
      } else if (status === 401 || status === 403) {
        toast.error('Your session has expired. Please sign in again.');
        router.push(`/auth/access?redirect=${encodeURIComponent(`/events/${eventSlug}`)}`);
      } else if (status === 422 || status === 400) {
        toast.error(serverMsg ?? 'Invalid selection. Please check your quantity and try again.');
      } else if (!status) {
        toast.error('Could not connect to the server. Check your internet connection and try again.');
      } else {
        toast.error(serverMsg ?? 'Could not reserve your tickets. Please try again.');
      }
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
            className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
              selectedTierId === tier.id
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-gray-200 text-gray-700 hover:border-gray-300'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{tier.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {tier.availableQuantity > 0 ? `${tier.availableQuantity} left` : 'Sold out'}
                </p>
              </div>
              <span className="font-semibold shrink-0">{tier.price === 0 ? 'Free' : formatPHP(tier.price)}</span>
            </div>
            {tier.inclusions && tier.inclusions.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Included benefits</p>
                <div className="flex flex-wrap gap-1.5">
                {tier.inclusions.map((item) => (
                  <span key={item.id ?? item.label} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    {item.label}
                  </span>
                ))}
                </div>
              </div>
            )}
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
            {selectedTier.price === 0 ? 'Free' : formatPHP(selectedTier.price * quantity)}
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
        {disabled
          ? 'Unavailable'
          : selectedTier?.price === 0
            ? 'Register Free'
            : 'Proceed to Payment'}
      </Button>

      <p className="text-xs text-gray-400 text-center">
        15-minute hold · No cancellations after payment
      </p>
    </div>
  );
}
