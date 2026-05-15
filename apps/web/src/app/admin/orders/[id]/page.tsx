'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { formatShortDate } from '@axon-tickets/utils';

interface OrderDetail {
  id: string;
  status: string;
  userEmail: string;
  userName: string;
  userId: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventStartsAt: string;
  eventVenue: string;
  subtotal: number;
  fees: number;
  total: number;
  currency: string;
  paymentMethod: string | null;
  paymentRef: string | null;
  items: Array<{
    id: string;
    tierName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  tickets: Array<{
    id: string;
    status: string;
    checkedInAt: string | null;
  }>;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-600',
  refunded: 'bg-purple-100 text-purple-700',
};

const TICKET_STATUS_COLORS: Record<string, string> = {
  valid: 'bg-green-100 text-green-700',
  used: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
};

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ['admin-order', id],
    queryFn: () =>
      api.get<{ data: OrderDetail }>(`/admin/orders/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const resendMutation = useMutation({
    mutationFn: () => api.post(`/admin/orders/${id}/resend-ticket`),
    onSuccess: () => toast.success('Ticket confirmation resent'),
    onError: () => toast.error('Failed to resend ticket'),
  });

  const fmt = (centavos: number) =>
    `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  if (isLoading) {
    return (
      <>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-gray-400">Loading…</p>
        </main>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-red-500">Order not found.</p>
          <Link href="/admin/orders" className="text-primary hover:underline text-sm mt-2 block">
            ← Back to Orders
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link href="/admin/orders" className="text-gray-400 hover:text-gray-600 text-sm block mb-1">
              ← Orders
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Order Detail</h1>
            <p className="font-mono text-xs text-gray-400 mt-0.5">{order.id}</p>
          </div>
          {order.status === 'paid' && (
            <button
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending}
              className="bg-primary text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-primary-hover disabled:opacity-40 transition-colors"
            >
              {resendMutation.isPending ? 'Sending…' : 'Resend Ticket Email'}
            </button>
          )}
        </div>

        {/* Status + Summary */}
        <section className="bg-white shadow rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
              <span className={`mt-1 inline-block text-sm font-semibold px-3 py-1 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {order.status}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmt(order.total)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Customer</p>
              <p className="font-medium text-gray-800 mt-0.5">{order.userName}</p>
              <p className="text-xs text-gray-500">{order.userEmail}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Event</p>
              <p className="font-medium text-gray-800 mt-0.5">{order.eventTitle}</p>
              <p className="text-xs text-gray-500">
                {formatShortDate(new Date(order.eventStartsAt))} · {order.eventVenue}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Payment Method</p>
              <p className="text-gray-700 mt-0.5">{order.paymentMethod ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Ordered At</p>
              <p className="text-gray-700 mt-0.5">{formatShortDate(new Date(order.createdAt))}</p>
            </div>
            {order.paymentRef && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Payment Ref</p>
                <p className="font-mono text-xs text-gray-600 mt-0.5">{order.paymentRef}</p>
              </div>
            )}
          </div>
        </section>

        {/* Order items */}
        <section className="bg-white shadow rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Order Items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="pb-2">Tier</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Unit Price</th>
                <th className="pb-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 text-gray-800">{item.tierName}</td>
                  <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                  <td className="py-2 text-right text-gray-600">{fmt(item.unitPrice)}</td>
                  <td className="py-2 text-right font-medium text-gray-800">{fmt(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td colSpan={3} className="pt-3 text-right text-xs text-gray-400">Subtotal</td>
                <td className="pt-3 text-right text-gray-700">{fmt(order.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="text-right text-xs text-gray-400">Fees</td>
                <td className="text-right text-gray-700">{fmt(order.fees)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="text-right font-semibold text-gray-900">Total</td>
                <td className="text-right font-bold text-gray-900">{fmt(order.total)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Tickets */}
        {order.tickets.length > 0 && (
          <section className="bg-white shadow rounded-2xl p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Tickets ({order.tickets.length})</h2>
            <div className="space-y-2">
              {order.tickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-gray-500">{ticket.id}</span>
                  <div className="flex items-center gap-3">
                    {ticket.checkedInAt && (
                      <span className="text-xs text-gray-400">
                        Checked in {formatShortDate(new Date(ticket.checkedInAt))}
                      </span>
                    )}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TICKET_STATUS_COLORS[ticket.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {ticket.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
