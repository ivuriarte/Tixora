'use client';

import Image from 'next/image';
import { ChangeEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { EmptyState, ScreenSkeleton } from '@/components/ScreenState';

const FEATURED_LIMIT = 3;
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 800;
const MAX_WIDTH = 3600;
const MAX_HEIGHT = 2400;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface AdminEvent {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  venue: string;
  imageUrl?: string | null;
  featuredImageUrl?: string | null;
  isFeatured?: boolean;
  featuredOrder?: number | null;
  featuredUntil?: string | null;
}

interface FeaturedImageResponse {
  featuredImageUrl: string;
  width: number;
  height: number;
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

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected file could not be read as an image.'));
    };
    image.src = objectUrl;
  });
}

interface EditState {
  isFeatured: boolean;
  featuredOrder: string;
  featuredUntil: string;
  featuredImageUrl: string;
}

function stateFromEvent(event: AdminEvent): EditState {
  return {
    isFeatured: event.isFeatured ?? false,
    featuredOrder: event.featuredOrder != null ? String(event.featuredOrder) : '',
    featuredUntil: event.featuredUntil ? event.featuredUntil.slice(0, 10) : '',
    featuredImageUrl: event.featuredImageUrl ?? '',
  };
}

function EventFeaturedRow({ event, featuredCount }: { event: AdminEvent; featuredCount: number }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>(() => stateFromEvent(event));

  useEffect(() => {
    setForm(stateFromEvent(event));
  }, [event]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/admin/events/${event.id}`, data),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-events-all'] }),
        qc.invalidateQueries({ queryKey: ['featured-events'] }),
      ]);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (payload: FormData) =>
      api.post<{ data: FeaturedImageResponse }>(`/upload/events/${event.id}/featured-image`, payload),
    onSuccess: async (response) => {
      const uploaded = response.data.data;
      setForm((current) => ({ ...current, featuredImageUrl: uploaded.featuredImageUrl }));
      toast.success(`Featured artwork saved (${uploaded.width}×${uploaded.height}).`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-events-all'] }),
        qc.invalidateQueries({ queryKey: ['featured-events'] }),
      ]);
    },
    onError: () => toast.error('The artwork could not be uploaded. Check the format and dimensions, then try again.'),
  });

  async function handleToggle() {
    const next = !form.isFeatured;
    if (next && featuredCount >= FEATURED_LIMIT) {
      toast.error('The homepage supports up to 3 featured events. Disable one first.');
      return;
    }

    setForm((current) => ({ ...current, isFeatured: next }));
    if (next) setEditing(true);
    try {
      await updateMutation.mutateAsync({ isFeatured: next });
      toast.success(next ? 'Event added to the homepage.' : 'Event removed from the homepage.');
      if (!next) setEditing(false);
    } catch {
      setForm((current) => ({ ...current, isFeatured: !next }));
      toast.error('The featured setting was not saved. Please try again.');
    }
  }

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        isFeatured: form.isFeatured,
        featuredOrder: form.featuredOrder.trim() ? parseInt(form.featuredOrder, 10) : null,
        featuredUntil: form.featuredUntil
          ? new Date(`${form.featuredUntil}T23:59:59+08:00`).toISOString()
          : null,
      });
      toast.success('Featured settings saved.');
      setEditing(false);
    } catch {
      toast.error('The featured settings were not saved. Please try again.');
    }
  }

  async function handleArtwork(eventChange: ChangeEvent<HTMLInputElement>) {
    const file = eventChange.target.files?.[0];
    eventChange.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Choose a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Featured artwork must be 5 MB or smaller.');
      return;
    }

    try {
      const { width, height } = await readImageDimensions(file);
      const ratio = width / height;
      const validDimensions = width >= MIN_WIDTH && height >= MIN_HEIGHT && width <= MAX_WIDTH && height <= MAX_HEIGHT;
      if (!validDimensions || Math.abs(ratio - 1.5) > 0.015) {
        toast.error('Use a 3:2 image between 1200×800 and 3600×2400 px. Recommended: 1800×1200 px.');
        return;
      }
      const payload = new FormData();
      payload.append('image', file);
      uploadMutation.mutate(payload);
    } catch {
      toast.error('The selected file could not be read as an image.');
    }
  }

  const artwork = form.featuredImageUrl || event.imageUrl || null;
  const isSaving = updateMutation.isPending || uploadMutation.isPending;

  return (
    <article className="rounded-lg border border-[#e4dcf4] bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[#1a0533]">{event.title}</p>
          <p className="mt-1 text-xs text-[#756a92]">{fmtDate(event.startsAt)} · {event.venue}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {form.isFeatured && (
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="text-xs font-semibold text-primary hover:text-primary-hover"
            >
              {editing ? 'Close' : 'Configure'}
            </button>
          )}
          <label className="relative inline-flex cursor-pointer items-center" aria-label={`${form.isFeatured ? 'Disable' : 'Enable'} ${event.title} as a featured event`}>
            <input
              type="checkbox"
              className="peer sr-only"
              checked={form.isFeatured}
              onChange={handleToggle}
              disabled={isSaving}
            />
            <span className="h-6 w-11 rounded-full bg-[#e4dcf4] transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-disabled:cursor-wait peer-disabled:opacity-50 after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:border after:border-[#d3c8e8] after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
          </label>
        </div>
      </div>

      {form.isFeatured && !editing && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6b5b8a]">
          {form.featuredOrder && <span className="rounded-full bg-[#f0ebff] px-2.5 py-1 font-semibold text-primary">Slot {form.featuredOrder}</span>}
          <span className="rounded-full bg-[#f5f0ff] px-2.5 py-1">{form.featuredUntil ? `Until ${fmtDate(form.featuredUntil)}` : 'No expiry'}</span>
          <span className={`rounded-full px-2.5 py-1 ${form.featuredImageUrl ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {form.featuredImageUrl ? 'Dedicated artwork ready' : 'Using event cover fallback'}
          </span>
        </div>
      )}

      {editing && form.isFeatured && (
        <div className="mt-4 space-y-5 border-t border-[#eee8f7] pt-4">
          <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-start">
            <div className="relative aspect-[3/2] overflow-hidden rounded-lg border border-[#e4dcf4] bg-[#1a0533]">
              {artwork ? (
                <Image src={artwork} alt={`${event.title} featured artwork preview`} fill sizes="220px" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-5 text-center text-xs font-semibold text-[#c4b5fd]">No featured artwork uploaded</div>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1a0533]">Homepage featured artwork</p>
              <p className="mt-1 text-xs leading-5 text-[#6b5b8a]">
                Separate from the event-detail cover. Use a 3:2 landscape composition with the subject inside the center safe area.
              </p>
              <div className="mt-3 rounded-lg bg-[#f5f0ff] p-3 text-xs leading-5 text-[#4f416c]">
                <strong>Recommended:</strong> 1800×1200 px · <strong>Accepted:</strong> 1200×800 to 3600×2400 px · JPG, PNG, or WEBP · 5 MB maximum
              </div>
              <label className="axon-pill mt-3 cursor-pointer bg-primary px-4 text-[11px] text-white hover:bg-primary-hover">
                {uploadMutation.isPending ? 'Uploading…' : form.featuredImageUrl ? 'Replace artwork' : 'Upload artwork'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={isSaving} onChange={handleArtwork} />
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`featured-order-${event.id}`} className="mb-1 block text-xs font-semibold text-[#4f416c]">Display slot <span className="font-normal text-[#8d82a8]">(1 = first)</span></label>
              <input
                id={`featured-order-${event.id}`}
                type="number"
                min={1}
                max={3}
                placeholder="1"
                value={form.featuredOrder}
                onChange={(change) => setForm((current) => ({ ...current, featuredOrder: change.target.value }))}
                className="axon-input w-full text-sm"
              />
            </div>
            <div>
              <label htmlFor={`featured-until-${event.id}`} className="mb-1 block text-xs font-semibold text-[#4f416c]">Featured until <span className="font-normal text-[#8d82a8]">(optional)</span></label>
              <input
                id={`featured-until-${event.id}`}
                type="date"
                value={form.featuredUntil}
                onChange={(change) => setForm((current) => ({ ...current, featuredUntil: change.target.value }))}
                className="axon-input w-full text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={handleSave} disabled={isSaving} className="axon-pill bg-primary px-5 text-[11px] text-white hover:bg-primary-hover disabled:cursor-wait disabled:opacity-50">
              {updateMutation.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function FeaturedEventsPage() {
  const { data: events = [], isLoading } = useQuery<AdminEvent[]>({
    queryKey: ['admin-events-all'],
    queryFn: () => api.get<{ data: { data: AdminEvent[] } }>('/admin/events?limit=200').then((response) => response.data.data.data),
  });

  const featured = events.filter((event) => event.isFeatured);
  const activeFeaturedCount = featured.filter((event) => !event.featuredUntil || new Date(event.featuredUntil) > new Date()).length;
  const notFeatured = events.filter((event) => !event.isFeatured && event.status !== 'cancelled');

  return (
    <main className="axon-admin-page max-w-5xl">
      <div className="mb-8">
        <h1 className="axon-page-title text-3xl sm:text-4xl">Featured Events</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b5b8a]">
          Select up to three events for the homepage carousel, set their order, and upload artwork composed specifically for the larger hero.
        </p>
      </div>

      {isLoading && <ScreenSkeleton rows={5} compact />}

      {featured.length > 0 && (
        <section className="mb-8" aria-labelledby="currently-featured-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="currently-featured-heading" className="axon-section-title text-sm">Currently Featured</h2>
            <span className="text-xs font-semibold text-[#756a92]">{activeFeaturedCount} / {FEATURED_LIMIT} active slots</span>
          </div>
          <div className="space-y-3">
            {[...featured]
              .sort((a, b) => (a.featuredOrder ?? 99) - (b.featuredOrder ?? 99))
              .map((event) => <EventFeaturedRow key={event.id} event={event} featuredCount={activeFeaturedCount} />)}
          </div>
        </section>
      )}

      {featured.length === 0 && !isLoading && (
        <div className="mb-8"><EmptyState title="No featured events" message="Choose an eligible event below to add it to the homepage carousel." /></div>
      )}

      {notFeatured.length > 0 && (
        <section aria-labelledby="all-events-heading">
          <h2 id="all-events-heading" className="axon-section-title mb-3 text-sm">All Events</h2>
          <div className="space-y-3">
            {notFeatured.map((event) => <EventFeaturedRow key={event.id} event={event} featuredCount={activeFeaturedCount} />)}
          </div>
        </section>
      )}
    </main>
  );
}
