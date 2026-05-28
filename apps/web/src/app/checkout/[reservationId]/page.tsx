'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useCartStore } from '@/store/cart.store';
import { formatPHP } from '@axon-tickets/utils';
import Button from '@/components/Button';
import Navbar from '@/components/Navbar';
import CountdownTimer from '@/components/CountdownTimer';

const ONLINE_PAYMENT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ONLINE_PAYMENT === 'true';

export default function CheckoutPage() {
  const params = useParams<{ reservationId: string }>();
  const router = useRouter();
  const { reservationId, tierName, quantity, unitPrice, expiresAt, clearCart } = useCartStore();
  const [paymentMethod, setPaymentMethod] = useState<'gcash' | 'maya' | 'card'>('gcash');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<null | { id: string }>(null);

  // Feature flag: online payment is disabled for MVP manual-proof flow.
  // Set NEXT_PUBLIC_ENABLE_ONLINE_PAYMENT=true to re-enable.
  useEffect(() => {
    if (!ONLINE_PAYMENT_ENABLED) {
      router.replace('/');
    }
  }, [router]);

  // Guard: ensure reservation matches
  useEffect(() => {
    if (!ONLINE_PAYMENT_ENABLED) return;
    if (reservationId && reservationId !== params.reservationId) {
      router.replace('/');
    }
  }, [reservationId, params.reservationId, router]);

  if (!ONLINE_PAYMENT_ENABLED) {
    return null;
  }

  const subtotal = (unitPrice ?? 0) * (quantity ?? 0);
  // Note: this online-payment flow is gated behind NEXT_PUBLIC_ENABLE_ONLINE_PAYMENT.
  // The authoritative fee comes from the event (event.platformFee) and is computed
  // server-side when the order is created; the value below is a display fallback only.
  const fee = 50;
  const total = subtotal + fee;

  async function handlePay() {
    setLoading(true);
    try {
      // 1. Create order from reservation
      const idempotencyKey = `order-${params.reservationId}`;
      const orderRes = await api.post<{ data: { id: string } }>('/orders', {
        reservationId: params.reservationId,
        paymentMethod,
        idempotencyKey,
      });
      const createdOrder = orderRes.data.data;
      setOrder(createdOrder);

      // 2. Get payment URL from PayMongo
      const payRes = await api.post<{ data: { paymentUrl: string } }>(
        `/orders/${createdOrder.id}/payment-intent`,
      );
      const { paymentUrl } = payRes.data.data;
      clearCart();
      window.location.href = paymentUrl;
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Payment could not be completed. Please try again or choose a different method.');
    } finally {
      setLoading(false);
    }
  }

  const methods = [
    { id: 'gcash', label: 'GCash', icon: '📱' },
    { id: 'maya', label: 'Maya', icon: '💚' },
    { id: 'card', label: 'Credit/Debit Card', icon: '💳' },
  ] as const;

  return (
    <>
      <Navbar />
      <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>

        {expiresAt && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-sm">
            <span className="text-amber-800 font-medium">Tickets held for</span>
            <CountdownTimer expiresAt={expiresAt} onExpire={() => { clearCart(); router.push('/'); toast.error('Your reservation has expired. Please select your tickets again.'); }} />
          </div>
        )}

        {/* Order summary */}
        <div className="bg-white shadow rounded-2xl p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">Order Summary</h2>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{tierName} × {quantity}</span>
            <span>{formatPHP(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Service fee</span>
            <span className="text-gray-500">{formatPHP(fee)}</span>
          </div>
          <div className="border-t pt-3 flex justify-between font-bold">
            <span>Total</span>
            <span>{formatPHP(total)}</span>
          </div>
        </div>

        {/* Payment method */}
        <div className="bg-white shadow rounded-2xl p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">Payment Method</h2>
          <div className="space-y-2">
            {methods.map((m) => (
              <button
                key={m.id}
                onClick={() => setPaymentMethod(m.id)}
                className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  paymentMethod === m.id
                    ? 'border-primary bg-primary-50 text-primary'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="text-lg">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={handlePay} loading={loading} className="w-full" size="lg">
          Pay {formatPHP(total)}
        </Button>

        <p className="text-xs text-center text-gray-400">
          Secured by PayMongo · All transactions encrypted
        </p>
      </main>
    </>
  );
}
