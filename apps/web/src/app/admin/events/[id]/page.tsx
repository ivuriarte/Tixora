'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import ConfirmModal from '@/components/ConfirmModal';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { SponsorListManager, FaqListManager, AgendaListManager, type SponsorItem, type FaqItem, type AgendaItem } from '@/components/ConferenceFields';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Tier {
  id: string;
  name: string;
  description: string | null;
  price: number;       // centavos from API
  totalQuantity: number;
  soldQuantity: number;
  maxPerOrder: number;
  isVisible: boolean;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
}

interface EventDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  venue: string;
  address: string | null;
  city: string;
  startsAt: string;
  endsAt: string | null;
  maxPerUser: number;
  maxCapacity: number | null;
  status: string;
  imageUrl?: string | null;
  speakerName?: string | null;
  agenda?: Array<{ time: string; title: string; description?: string }> | null;
  sponsors?: Array<{ name: string; logoUrl?: string; tier?: string }> | null;
  faqs?: Array<{ question: string; answer: string }> | null;
  allowManualPayment?: boolean;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  gcashNumber?: string | null;
  tiers: Tier[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function parseJsonSafe(raw: string): { ok: true; value: unknown } | { ok: false } {
  if (!raw.trim()) return { ok: true, value: null };
  try { return { ok: true, value: JSON.parse(raw) }; } catch { return { ok: false }; }
}

// completed is auto-only — never in the dropdown
const STATUS_OPTIONS = ['draft', 'on_sale', 'sold_out', 'cancelled'];
const REQ = <span className="text-red-500 ml-0.5">*</span>;

// ── Tier inline edit form ──────────────────────────────────────────────────────

function TierEditForm({
  tier,
  onSave,
  onCancel,
}: {
  tier: Tier;
  onSave: (id: string, data: Partial<Tier>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tier.name);
  const [description, setDescription] = useState(tier.description ?? '');
  const [priceStr, setPriceStr] = useState(String(tier.price / 100)); // pesos
  const [totalQuantity, setTotalQuantity] = useState(String(tier.totalQuantity));
  const [maxPerOrder, setMaxPerOrder] = useState(String(tier.maxPerOrder));
  const [isVisible, setIsVisible] = useState(tier.isVisible);

  const isValid = name.trim() && priceStr !== '' && !isNaN(parseFloat(priceStr)) && parseInt(totalQuantity, 10) > 0;

  return (
    <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
      <p className="font-medium text-sm text-gray-900">Edit Tier</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
          <input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Price (₱) <span className="text-red-500">*</span></label>
          <input type="number" min={0} step="0.01"
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)} />
          <p className="text-xs text-gray-400 mt-0.5">Enter amount in pesos</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Total Quantity <span className="text-red-500">*</span></label>
          <input type="number" min={tier.soldQuantity || 1}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={totalQuantity}
            onChange={(e) => setTotalQuantity(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Per Order</label>
          <input type="number" min={1} max={20}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={maxPerOrder}
            onChange={(e) => setMaxPerOrder(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
        <input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          value={description}
          onChange={(e) => setDescription(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} className="accent-primary" />
        Visible on event page
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={!isValid}
          onClick={() => onSave(tier.id, {
            name: name.trim(),
            description: description.trim() || null,
            price: Math.round(parseFloat(priceStr) * 100),
            totalQuantity: parseInt(totalQuantity, 10),
            maxPerOrder: parseInt(maxPerOrder, 10),
            isVisible,
          })}
          className="bg-primary text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-primary-hover disabled:opacity-40">
          Save Changes
        </button>
        <button type="button" onClick={onCancel}
          className="border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminEventEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: event, isLoading } = useQuery<EventDetail>({
    queryKey: ['admin-event', id],
    queryFn: () =>
      api.get<{ data: EventDetail }>(`/admin/events/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  // ── Edit event form ─────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [maxPerUser, setMaxPerUser] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('');
  const [status, setStatus] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [sponsors, setSponsors] = useState<SponsorItem[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [jsonErrors] = useState<Record<string, string>>({});

  // Payment configuration
  const [allowManualPayment, setAllowManualPayment] = useState(true);
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [gcashNumber, setGcashNumber] = useState('');

  // Populate form once event loads
  const formInitialised = useRef(false);
  useEffect(() => {
    if (event && !formInitialised.current) {
      formInitialised.current = true;
      setTitle(event.title ?? '');
      setDescription(event.description ?? '');
      setVenue(event.venue ?? '');
      setAddress(event.address ?? '');
      setCity(event.city ?? '');
      const startLocal = toDatetimeLocal(event.startsAt);
      setStartDate(startLocal.slice(0, 10));
      setStartTime(startLocal.slice(11, 16));
      if (event.endsAt) {
        const endLocal = toDatetimeLocal(event.endsAt);
        setEndDate(endLocal.slice(0, 10));
        setEndTime(endLocal.slice(11, 16));
      }
      setMaxPerUser(String(event.maxPerUser ?? ''));
      setMaxCapacity(event.maxCapacity != null ? String(event.maxCapacity) : '');
      setStatus(event.status ?? 'draft');
      setSpeakerName(event.speakerName ?? '');
      setImageUrl(event.imageUrl ?? '');
      setAgenda(
        Array.isArray(event.agenda)
          ? event.agenda.map((a) => ({
              time: a.time,
              title: a.title,
              ...(a.description ? { description: a.description } : {}),
            }))
          : [],
      );
      setSponsors(
        event.sponsors
          ? event.sponsors.map((s) => ({ name: s.name, logoUrl: s.logoUrl ?? '', tier: s.tier ?? '' }))
          : [],
      );
      setFaqs(event.faqs ? event.faqs.map((f) => ({ question: f.question, answer: f.answer })) : []);
      setAllowManualPayment(event.allowManualPayment ?? true);
      setBankName(event.bankName ?? '');
      setBankAccountName(event.bankAccountName ?? '');
      setBankAccountNumber(event.bankAccountNumber ?? '');
      setGcashNumber(event.gcashNumber ?? '');
    }
  }, [event]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const startsAtISO = startDate && startTime ? new Date(`${startDate}T${startTime}`).toISOString() : undefined;
  const endsAtISO = endDate && endTime ? new Date(`${endDate}T${endTime}`).toISOString() : undefined;
  const endBeforeStart = !!startsAtISO && !!endsAtISO && new Date(endsAtISO) <= new Date(startsAtISO);
  const hasJsonErrors = Object.keys(jsonErrors).length > 0;
  const requiredFilled = title.trim() && description.trim() && venue.trim() && city.trim() && startsAtISO;
  const canSave = requiredFilled && !hasJsonErrors && !endBeforeStart;

  function validateJson(_raw: string, _key: string) {
    /* no-op kept for compatibility */
  }
  void validateJson;

  // ── Mutations ────────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/admin/events/${id}`, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['admin-event', id] });
      const prev = queryClient.getQueryData<EventDetail>(['admin-event', id]);
      queryClient.setQueryData<EventDetail>(['admin-event', id], (old) =>
        old ? { ...old, ...(data as Partial<EventDetail>) } : old!
      );
      return { prev };
    },
    onSuccess: () => {
      toast.success('Event updated');
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin-event', id], ctx.prev);
      toast.error('Failed to update event');
    },
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => api.put(`/admin/events/${id}`, { status: newStatus }),
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: ['admin-event', id] });
      const prev = queryClient.getQueryData<EventDetail>(['admin-event', id]);
      queryClient.setQueryData<EventDetail>(['admin-event', id], (old) =>
        old ? { ...old, status: newStatus } : old!
      );
      queryClient.setQueryData<EventDetail[]>(['admin-events'], (old: any) =>
        Array.isArray(old) ? old.map((e: any) => (e.id === id ? { ...e, status: newStatus } : e)) : old
      );
      return { prev };
    },
    onSuccess: () => toast.success('Status updated'),
    onError: (_, __, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin-event', id], ctx.prev);
      toast.error('Failed to update status');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/events/${id}`),
    onSuccess: () => {
      toast.success('Event deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      router.push('/admin');
    },
    onError: () => toast.error('Failed to delete event'),
  });

  // ── Confirm dialog ──────────────────────────────────────────────────────────
  type ConfirmState = {
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'warning';
    onConfirm: () => void;
  } | null;
  const [dialog, setDialog] = useState<ConfirmState>(null);

  // ── Tier management ──────────────────────────────────────────────────────────
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [showAddTier, setShowAddTier] = useState(false);
  const [newTierName, setNewTierName] = useState('');
  const [newTierPrice, setNewTierPrice] = useState('');
  const [newTierQty, setNewTierQty] = useState('');
  const [newTierMaxOrder, setNewTierMaxOrder] = useState('4');
  const [newTierDesc, setNewTierDesc] = useState('');
  const [newTierVisible, setNewTierVisible] = useState(true);

  const addTierMutation = useMutation({
    mutationFn: (data: object) => api.post(`/admin/events/${id}/tiers`, data),
    onSuccess: () => {
      toast.success('Tier added');
      setShowAddTier(false);
      setNewTierName(''); setNewTierPrice(''); setNewTierQty(''); setNewTierMaxOrder('4'); setNewTierDesc(''); setNewTierVisible(true);
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    },
    onError: () => toast.error('Failed to add tier'),
  });

  const updateTierMutation = useMutation({
    mutationFn: ({ tierId, data }: { tierId: string; data: object }) =>
      api.put(`/admin/tiers/${tierId}`, data),
    onSuccess: () => {
      toast.success('Tier updated');
      setEditingTierId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    },
    onError: () => toast.error('Failed to update tier'),
  });

  const deleteTierMutation = useMutation({
    mutationFn: (tierId: string) => api.delete(`/admin/tiers/${tierId}`),
    onSuccess: () => {
      toast.success('Tier deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    },
    onError: () => toast.error('Cannot delete a tier that has sold tickets'),
  });

  function handleSave() {
    if (!canSave) return;
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim(),
      venue: venue.trim(),
      address: address.trim() || null,
      city: city.trim(),
      startsAt: startsAtISO,
      endsAt: endsAtISO ?? null,
      maxPerUser: parseInt(maxPerUser, 10) || undefined,
      maxCapacity: maxCapacity.trim() === '' ? null : parseInt(maxCapacity, 10),
      status,
      speakerName: speakerName.trim() || null,
      imageUrl: imageUrl.trim() || null,
      allowManualPayment,
      bankName: bankName.trim() || null,
      bankAccountName: bankAccountName.trim() || null,
      bankAccountNumber: bankAccountNumber.trim() || null,
      gcashNumber: gcashNumber.trim() || null,
    };
    payload.agenda = agenda.length > 0 ? agenda : null;
    payload.sponsors = sponsors.length > 0
      ? sponsors.map((s) => ({ name: s.name, ...(s.logoUrl && { logoUrl: s.logoUrl }), ...(s.tier && { tier: s.tier }) }))
      : null;
    payload.faqs = faqs.length > 0 ? faqs : null;
    updateMutation.mutate(payload);
  }

  // ── Loading / not found ──────────────────────────────────────────────────────
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

  if (!event) {
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
      <ConfirmModal
        open={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={dialog?.confirmLabel}
        variant={dialog?.variant ?? 'danger'}
        onConfirm={() => { dialog?.onConfirm(); setDialog(null); }}
        onCancel={() => setDialog(null)}
      />
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← Admin</Link>
          <h1 className="text-2xl font-bold text-gray-900">Edit Event</h1>
        </div>

        {/* ── Event Details ─────────────────────────────────────────── */}
        <section className="bg-white shadow rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Event Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title{REQ}</label>
            <input className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description{REQ}</label>
            <textarea rows={3} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue{REQ}</label>
              <input className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={venue} onChange={(e) => setVenue(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City{REQ}</label>
              <input className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. SM Lanang Premier, JP Laurel Ave, Davao City 8000"
              value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Starts At{REQ}</label>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <input type="time" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ends At <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <input type="time" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            {endBeforeStart && (
              <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                End date/time must be after the start date/time.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              {event.status === 'completed' ? (
                <div className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-600">
                  completed <span className="text-xs text-gray-400 ml-2">(auto)</span>
                </div>
              ) : (
                <select className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={status}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    if (newStatus === 'cancelled') {
                      setDialog({
                        title: `Cancel "${event.title}"?`,
                        message: "This will mark the event as cancelled. Customers won't be able to purchase new tickets.",
                        confirmLabel: 'Yes, cancel event',
                        variant: 'warning',
                        onConfirm: () => { setStatus('cancelled'); statusMutation.mutate('cancelled'); },
                      });
                      return;
                    }
                    setStatus(newStatus);
                    statusMutation.mutate(newStatus);
                  }}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              )}
              {statusMutation.isPending && (
                <p className="text-xs text-primary mt-1">Saving…</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Capacity</label>
              <input type="number" min={1}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. 500"
                value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Auto-switches to sold out when reached.</p>
            </div>
          </div>

          {/* Save / Cancel / Delete row */}
          <div className="flex items-center justify-between pt-2">
            <button
              disabled={!canSave || updateMutation.isPending}
              onClick={handleSave}
              className="bg-primary text-white font-semibold px-5 py-2 rounded-xl text-sm hover:bg-primary-hover disabled:opacity-40 transition-colors"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
            {!canSave && (
              <p className="text-xs text-gray-400">
                {!requiredFilled ? 'Fill in required fields (*)' : endBeforeStart ? 'Fix end date/time' : hasJsonErrors ? 'Fix JSON errors' : ''}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDialog({
                  title: `Cancel "${event.title}"?`,
                  message: "This will mark the event as cancelled. Customers won't be able to purchase new tickets.",
                  confirmLabel: 'Yes, cancel event',
                  variant: 'warning',
                  onConfirm: () => statusMutation.mutate('cancelled'),
                })}
                disabled={statusMutation.isPending || event.status === 'cancelled'}
                className="text-amber-600 hover:text-amber-800 text-sm font-medium disabled:opacity-40"
              >
                {event.status === 'cancelled' ? 'Already Cancelled' : 'Cancel Event'}
              </button>
              <button
                onClick={() => setDialog({
                  title: `Delete "${event.title}"?`,
                  message: 'This permanently removes the event and all its data. This cannot be undone.',
                  confirmLabel: 'Delete event',
                  variant: 'danger',
                  onConfirm: () => deleteMutation.mutate(),
                })}
                disabled={deleteMutation.isPending}
                className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-40"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete Event'}
              </button>
            </div>
          </div>
        </section>

        {/* ── Conference Details ──────────────────────────────────────── */}
        <section className="bg-white shadow rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Conference Details <span className="text-gray-400 text-sm font-normal">(optional)</span></h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Speaker Name</label>
            <input className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. John Smith"
              value={speakerName} onChange={(e) => setSpeakerName(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cover Image URL <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <input type="url" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="https://example.com/cover.jpg"
              value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </div>

          <AgendaListManager agenda={agenda} onChange={setAgenda} />

          <SponsorListManager sponsors={sponsors} onChange={setSponsors} />

          <FaqListManager faqs={faqs} onChange={setFaqs} />
        </section>

        {/* ── Payment Options ───────────────────────────────── */}
        <section className="bg-white shadow rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Payment Options</h2>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={allowManualPayment}
              onChange={(e) => setAllowManualPayment(e.target.checked)} className="accent-primary" />
            Accept manual payment (bank transfer / GCash with proof of payment)
          </label>

          {allowManualPayment && (
            <div className="space-y-4 pl-6 border-l-2 border-primary/20">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                  <input value={bankName} onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. BPI"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                  <input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)}
                    placeholder="e.g. Axon Tickets Inc."
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account Number</label>
                  <input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="e.g. 1234-5678-90"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GCash Number</label>
                  <input value={gcashNumber} onChange={(e) => setGcashNumber(e.target.value)}
                    placeholder="e.g. 0917-123-4567"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <p className="text-xs text-gray-400">These details are shown to attendees after registration.</p>
            </div>
          )}
        </section>

        {/* ── Ticket Tiers ───────────────────────────────────────────── */}
        <section className="bg-white shadow rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Ticket Tiers</h2>
            {!showAddTier && editingTierId === null && (
              <button onClick={() => setShowAddTier((v) => !v)} className="text-sm text-primary hover:underline">
                + Add Tier
              </button>
            )}
          </div>

          {event.tiers?.length === 0 && !showAddTier && (
            <p className="text-sm text-gray-400">No tiers yet. Add one above.</p>
          )}

          <div className="space-y-3">
            {event.tiers?.map((tier) =>
              editingTierId === tier.id ? (
                <TierEditForm
                  key={tier.id}
                  tier={tier}
                  onSave={(tierId, data) => updateTierMutation.mutate({ tierId, data })}
                  onCancel={() => setEditingTierId(null)}
                />
              ) : (
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
                    <button onClick={() => setEditingTierId(tier.id)}
                      className="text-primary hover:underline text-xs">Edit</button>
                    <button
                      onClick={() => setDialog({
                        title: `Delete tier "${tier.name}"?`,
                        message: 'This will permanently remove the ticket tier.',
                        confirmLabel: 'Delete tier',
                        variant: 'danger',
                        onConfirm: () => deleteTierMutation.mutate(tier.id),
                      })}
                      disabled={tier.soldQuantity > 0}
                      className="text-red-500 hover:text-red-700 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                      title={tier.soldQuantity > 0 ? 'Cannot delete a tier with sold tickets' : 'Delete tier'}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            )}
          </div>

          {showAddTier && (
            <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
              <p className="font-medium text-sm text-gray-900">New Tier</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
                  <input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="e.g. General Admission"
                    value={newTierName} onChange={(e) => setNewTierName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Price (₱) <span className="text-red-500">*</span></label>
                  <input type="number" min={0} step="0.01"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="e.g. 500"
                    value={newTierPrice} onChange={(e) => setNewTierPrice(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-0.5">Enter amount in pesos</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Total Quantity <span className="text-red-500">*</span></label>
                  <input type="number" min={1}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="e.g. 100"
                    value={newTierQty} onChange={(e) => setNewTierQty(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max Per Order</label>
                  <input type="number" min={1} max={20}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    value={newTierMaxOrder} onChange={(e) => setNewTierMaxOrder(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Includes lunch and materials"
                  value={newTierDesc} onChange={(e) => setNewTierDesc(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={newTierVisible}
                  onChange={(e) => setNewTierVisible(e.target.checked)} className="accent-primary" />
                Visible on event page
              </label>
              <div className="flex gap-2">
                <button
                  disabled={!newTierName || !newTierPrice || !newTierQty || addTierMutation.isPending}
                  onClick={() => addTierMutation.mutate({
                    name: newTierName.trim(),
                    description: newTierDesc.trim() || undefined,
                    price: Math.round(parseFloat(newTierPrice) * 100),
                    totalQuantity: parseInt(newTierQty, 10),
                    maxPerOrder: parseInt(newTierMaxOrder, 10),
                    isVisible: newTierVisible,
                  })}
                  className="bg-primary text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-primary-hover disabled:opacity-40"
                >
                  {addTierMutation.isPending ? 'Adding…' : 'Add Tier'}
                </button>
                <button onClick={() => setShowAddTier(false)}
                  className="border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
