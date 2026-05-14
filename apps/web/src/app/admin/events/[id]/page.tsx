'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Tier {
  id: string;
  name: string;
  description: string | null;
  price: number;
  totalQuantity: number;
  soldQuantity: number;
  isVisible: boolean;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
}

interface EventDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: string;
  endsAt: string;
  maxPerUser: number;
  status: string;
  tiers: Tier[];
}

const STATUS_OPTIONS = ['draft', 'published', 'on_sale', 'sold_out', 'cancelled', 'completed'];

export default function AdminEventEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: event, isLoading } = useQuery<EventDetail>({
    queryKey: ['admin-event', id],
    queryFn: () =>
      api
        .get<{ data: EventDetail }>(`/events/${id}/detail`)
        .catch(() => api.get<{ data: EventDetail }>(`/admin/events/${id}`))
        .then((r) => r.data.data),
    enabled: !!id,
  });

  // Use admin events list to find the event if individual endpoint isn't available
  const { data: eventsData } = useQuery<{ data: EventDetail[] }>({
    queryKey: ['admin-events-list'],
    queryFn: () =>
      api.get<{ data: { data: EventDetail[] } }>('/admin/events?limit=100').then((r) => r.data.data),
  });

  const resolvedEvent: EventDetail | undefined =
    event ?? eventsData?.data?.find((e) => e.id === id);

  // ── Edit event form ────────────────────────────────────────────────────
  const [form, setForm] = useState<Partial<EventDetail>>({});
  const isSaved = Object.keys(form).length === 0;

  const updateMutation = useMutation({
    mutationFn: (data: Partial<EventDetail>) => api.put(`/admin/events/${id}`, data),
    onSuccess: () => {
      toast.success('Event updated');
      setForm({});
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['admin-events-list'] });
    },
    onError: () => toast.error('Failed to update event'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.delete(`/admin/events/${id}`),
    onSuccess: () => {
      toast.success('Event cancelled');
      router.push('/admin');
    },
    onError: () => toast.error('Failed to cancel event'),
  });

  // ── Tier management ────────────────────────────────────────────────────
  const [newTier, setNewTier] = useState({
    name: '',
    description: '',
    price: 0,
    totalQuantity: 100,
    maxPerOrder: 4,
    isVisible: true,
  });
  const [showAddTier, setShowAddTier] = useState(false);

  const addTierMutation = useMutation({
    mutationFn: (data: typeof newTier) => api.post(`/admin/events/${id}/tiers`, data),
    onSuccess: () => {
      toast.success('Tier added');
      setShowAddTier(false);
      setNewTier({ name: '', description: '', price: 0, totalQuantity: 100, maxPerOrder: 4, isVisible: true });
      queryClient.invalidateQueries({ queryKey: ['admin-events-list'] });
    },
    onError: () => toast.error('Failed to add tier'),
  });

  const deleteTierMutation = useMutation({
    mutationFn: (tierId: string) => api.delete(`/admin/tiers/${tierId}`),
    onSuccess: () => {
      toast.success('Tier deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-events-list'] });
    },
    onError: () => toast.error('Cannot delete a tier that has sold tickets'),
  });

  const fieldVal = (field: keyof EventDetail) =>
    (form[field] ?? resolvedEvent?.[field] ?? '') as string;

  if (isLoading && !resolvedEvent) {
    return (
      <>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-gray-400">Loading…</p>
        </main>
      </>
    );
  }

  if (!resolvedEvent) {
    return (
      <>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-red-500">Event not found.</p>
          <Link href="/admin" className="text-primary hover:underline text-sm mt-2 block">← Back to Admin</Link>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← Admin</Link>
          <h1 className="text-2xl font-bold text-gray-900">Edit Event</h1>
        </div>

        {/* Event edit form */}
        <section className="bg-white shadow rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Event Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={fieldVal('title')}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              value={fieldVal('description')}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
              <input
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={fieldVal('venue')}
                onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={fieldVal('city')}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starts At</label>
              <input
                type="datetime-local"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={fieldVal('startsAt').slice(0, 16)}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: new Date(e.target.value).toISOString() }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ends At</label>
              <input
                type="datetime-local"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={fieldVal('endsAt').slice(0, 16)}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: new Date(e.target.value).toISOString() }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={(form.status ?? resolvedEvent.status) as string}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Per User</label>
              <input
                type="number"
                min={1}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={(form.maxPerUser ?? resolvedEvent.maxPerUser) as number}
                onChange={(e) => setForm((f) => ({ ...f, maxPerUser: parseInt(e.target.value, 10) }))}
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <button
              disabled={isSaved || updateMutation.isPending}
              onClick={() => updateMutation.mutate(form)}
              className="bg-primary text-white font-semibold px-5 py-2 rounded-xl text-sm hover:bg-primary-hover disabled:opacity-40 transition-colors"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>

            <button
              onClick={() => {
                if (confirm('Cancel this event? This will mark it as cancelled.')) {
                  cancelMutation.mutate();
                }
              }}
              disabled={cancelMutation.isPending || resolvedEvent.status === 'cancelled'}
              className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-40"
            >
              {resolvedEvent.status === 'cancelled' ? 'Already Cancelled' : 'Cancel Event'}
            </button>
          </div>
        </section>

        {/* Ticket tiers */}
        <section className="bg-white shadow rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Ticket Tiers</h2>
            <button
              onClick={() => setShowAddTier((v) => !v)}
              className="text-sm text-primary hover:underline"
            >
              {showAddTier ? 'Cancel' : '+ Add Tier'}
            </button>
          </div>

          {/* Existing tiers */}
          {resolvedEvent.tiers?.length === 0 && !showAddTier && (
            <p className="text-sm text-gray-400">No tiers yet. Add one above.</p>
          )}

          <div className="space-y-3">
            {resolvedEvent.tiers?.map((tier) => (
              <div key={tier.id} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{tier.name}</p>
                  <p className="text-xs text-gray-500">
                    ₱{(tier.price / 100).toLocaleString()} · {tier.soldQuantity}/{tier.totalQuantity} sold
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tier.isVisible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {tier.isVisible ? 'visible' : 'hidden'}
                  </span>
                  <button
                    onClick={() => {
                      if (confirm(`Delete tier "${tier.name}"?`)) {
                        deleteTierMutation.mutate(tier.id);
                      }
                    }}
                    disabled={tier.soldQuantity > 0}
                    className="text-red-500 hover:text-red-700 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                    title={tier.soldQuantity > 0 ? 'Cannot delete a tier with sold tickets' : 'Delete tier'}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add tier form */}
          {showAddTier && (
            <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
              <p className="font-medium text-sm text-gray-900">New Tier</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="e.g. General Admission"
                    value={newTier.name}
                    onChange={(e) => setNewTier((t) => ({ ...t, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Price (centavos)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="50000 = ₱500"
                    value={newTier.price}
                    onChange={(e) => setNewTier((t) => ({ ...t, price: parseInt(e.target.value, 10) || 0 }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Total Quantity</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newTier.totalQuantity}
                    onChange={(e) => setNewTier((t) => ({ ...t, totalQuantity: parseInt(e.target.value, 10) || 1 }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max Per Order</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newTier.maxPerOrder}
                    onChange={(e) => setNewTier((t) => ({ ...t, maxPerOrder: parseInt(e.target.value, 10) || 1 }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={newTier.description}
                  onChange={(e) => setNewTier((t) => ({ ...t, description: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newTier.isVisible}
                  onChange={(e) => setNewTier((t) => ({ ...t, isVisible: e.target.checked }))}
                  className="accent-primary"
                />
                Visible on event page
              </label>
              <button
                disabled={!newTier.name || addTierMutation.isPending}
                onClick={() => addTierMutation.mutate(newTier)}
                className="bg-primary text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-primary-hover disabled:opacity-40"
              >
                {addTierMutation.isPending ? 'Adding…' : 'Add Tier'}
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
