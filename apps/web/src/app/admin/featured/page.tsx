'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { EmptyState, ScreenSkeleton } from '@/components/ScreenState';

interface AdminEvent {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  venue: string;
  isFeatured?: boolean;
  featuredOrder?: number | null;
  featuredUntil?: string | null;
  tagline?: string | null;
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
    });
  } catch {
    return null;
  }
}

interface EditState {
  isFeatured: boolean;
  featuredOrder: string;
  featuredUntil: string;
  tagline: string;
}

function editStateFor(event: AdminEvent): EditState {
  return {
    isFeatured: event.isFeatured ?? false,
    featuredOrder: event.featuredOrder != null ? String(event.featuredOrder) : '',
    featuredUntil: event.featuredUntil ? event.featuredUntil.slice(0, 10) : '',
    tagline: event.tagline ?? '',
  };
}

function EventFeaturedRow({ event }: { event: AdminEvent }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>(() => editStateFor(event));

  useEffect(() => {
    setForm(editStateFor(event));
  }, [event]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/admin/events/${event.id}`, data),
    onSuccess: () => {
      toast.success('Featured settings updated.');
      qc.invalidateQueries({ queryKey: ['admin-events-all'] });
      setEditing(false);
    },
    onError: () => toast.error('Could not update. Please try again.'),
  });

  function handleToggle() {
    const next = !form.isFeatured;
    const previous = form;
    const nextForm = {
      ...form,
      isFeatured: next,
      ...(!next && { featuredOrder: '', featuredUntil: '' }),
    };
    setForm(nextForm);
    mutation.mutate(
      {
        isFeatured: next,
        ...(!next && { featuredOrder: null, featuredUntil: null }),
      },
      { onError: () => setForm(previous) },
    );
  }

  function handleSave() {
    mutation.mutate({
      isFeatured: form.isFeatured,
      tagline: form.tagline.trim() || null,
      featuredOrder: form.featuredOrder.trim() ? parseInt(form.featuredOrder, 10) : null,
      featuredUntil: form.featuredUntil
        ? new Date(`${form.featuredUntil}T23:59:59+08:00`).toISOString()
        : null,
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 truncate">{event.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {fmtDate(event.startsAt)} · {event.venue}
          </p>
          {form.isFeatured && form.tagline && (
            <p className="text-xs text-indigo-600 mt-0.5 truncate">{form.tagline}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {form.isFeatured && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {editing ? 'Close' : 'Edit settings'}
            </button>
          )}
          {form.isFeatured && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {form.featuredOrder && (
                <span className="bg-indigo-50 text-indigo-700 font-medium px-2 py-0.5 rounded-full">
                  Slot {form.featuredOrder}
                </span>
              )}
              {form.featuredUntil ? (
                <span>Until {fmtDate(form.featuredUntil)}</span>
              ) : (
                <span className="text-gray-400">No expiry</span>
              )}
            </div>
          )}
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={form.isFeatured}
              onChange={handleToggle}
              disabled={mutation.isPending}
            />
            <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
          </label>
        </div>
      </div>

      {editing && form.isFeatured && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Tagline <span className="text-gray-400 font-normal">(shown as badge in hero carousel)</span>
            </label>
            <input
              type="text"
              maxLength={100}
              placeholder="e.g. FULL-DAY LEADERSHIP CONFERENCE"
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Display slot <span className="text-gray-400 font-normal">(1 = first)</span>
              </label>
              <input
                type="number"
                min={1}
                placeholder="1"
                value={form.featuredOrder}
                onChange={(e) => setForm((f) => ({ ...f, featuredOrder: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Featured until <span className="text-gray-400 font-normal">(leave blank = no expiry)</span>
              </label>
              <input
                type="date"
                value={form.featuredUntil}
                onChange={(e) => setForm((f) => ({ ...f, featuredUntil: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeaturedEventsPage() {
  const { data: events = [], isLoading } = useQuery<AdminEvent[]>({
    queryKey: ['admin-events-all'],
    queryFn: () =>
      api.get<{ data: { data: AdminEvent[] } }>('/admin/events?limit=200').then((r) => r.data.data.data),
  });

  const featured = events.filter((e) => e.isFeatured);
  const notFeatured = events.filter((e) => !e.isFeatured && e.status !== 'cancelled');

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="axon-page-title text-3xl sm:text-4xl">Featured Events</h1>
        <p className="text-sm text-gray-500 mt-1">
          Featured events appear in the animated hero carousel on the homepage. Only admins can manage this.
        </p>
      </div>

      {isLoading && <ScreenSkeleton rows={5} compact />}

      {featured.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            Currently Featured — {featured.length} event{featured.length !== 1 ? 's' : ''}
          </h2>
          <div className="space-y-3">
            {featured
              .sort((a, b) => (a.featuredOrder ?? 99) - (b.featuredOrder ?? 99))
              .map((event) => (
                <EventFeaturedRow key={event.id} event={event} />
              ))}
          </div>
        </section>
      )}

      {featured.length === 0 && !isLoading && (
        <div className="mb-8"><EmptyState title="No featured events" message="Choose an eligible event below to add it to the homepage carousel." /></div>
      )}

      {notFeatured.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            All Events
          </h2>
          <div className="space-y-3">
            {notFeatured.map((event) => (
              <EventFeaturedRow key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
