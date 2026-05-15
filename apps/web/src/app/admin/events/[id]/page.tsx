'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import toast from 'react-hot-toast';

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
  status: string;
  speakerName?: string | null;
  agenda?: Array<{ time: string; title: string; description?: string }> | null;
  sponsors?: Array<{ name: string; logoUrl?: string; tier?: string }> | null;
  faqs?: Array<{ question: string; answer: string }> | null;
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

const STATUS_OPTIONS = ['draft', 'published', 'on_sale', 'sold_out', 'cancelled', 'completed'];
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
  const [status, setStatus] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [agendaJson, setAgendaJson] = useState('');
  const [sponsorsJson, setSponsorsJson] = useState('');
  const [faqsJson, setFaqsJson] = useState('');
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});

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
      setStatus(event.status ?? 'draft');
      setSpeakerName(event.speakerName ?? '');
      setAgendaJson(event.agenda ? JSON.stringify(event.agenda, null, 2) : '');
      setSponsorsJson(event.sponsors ? JSON.stringify(event.sponsors, null, 2) : '');
      setFaqsJson(event.faqs ? JSON.stringify(event.faqs, null, 2) : '');
    }
  }, [event]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const startsAtISO = startDate && startTime ? new Date(`${startDate}T${startTime}`).toISOString() : undefined;
  const endsAtISO = endDate && endTime ? new Date(`${endDate}T${endTime}`).toISOString() : undefined;
  const endBeforeStart = !!startsAtISO && !!endsAtISO && new Date(endsAtISO) <= new Date(startsAtISO);
  const hasJsonErrors = Object.keys(jsonErrors).length > 0;
  const requiredFilled = title.trim() && description.trim() && venue.trim() && city.trim() && startsAtISO;
  const canSave = requiredFilled && !hasJsonErrors && !endBeforeStart;

  function validateJson(raw: string, key: string) {
    const result = parseJsonSafe(raw);
    if (!result.ok) {
      setJsonErrors((e) => ({ ...e, [key]: 'Invalid JSON. Must be a valid JSON array.' }));
    } else {
      setJsonErrors((e) => { const n = { ...e }; delete n[key]; return n; });
    }
  }

  // ── Mutations ────────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/admin/events/${id}`, data),
    onSuccess: () => {
      toast.success('Event updated');
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
    onError: () => toast.error('Failed to update event'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.delete(`/admin/events/${id}`),
    onSuccess: () => { toast.success('Event cancelled'); router.push('/admin'); },
    onError: () => toast.error('Failed to cancel event'),
  });

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
      status,
      speakerName: speakerName.trim() || null,
    };
    const agendaResult = parseJsonSafe(agendaJson);
    const sponsorsResult = parseJsonSafe(sponsorsJson);
    const faqsResult = parseJsonSafe(faqsJson);
    if (agendaResult.ok) payload.agenda = agendaResult.value;
    if (sponsorsResult.ok) payload.sponsors = sponsorsResult.value;
    if (faqsResult.ok) payload.faqs = faqsResult.value;
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
              <select className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Per User</label>
              <input type="number" min={1}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={maxPerUser} onChange={(e) => setMaxPerUser(e.target.value)} />
            </div>
          </div>

          {/* Save / Cancel Event row */}
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
            <button
              onClick={() => { if (confirm('Cancel this event? This will mark it as cancelled.')) cancelMutation.mutate(); }}
              disabled={cancelMutation.isPending || event.status === 'cancelled'}
              className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-40"
            >
              {event.status === 'cancelled' ? 'Already Cancelled' : 'Cancel Event'}
            </button>
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

          {([
            { key: 'agenda', label: 'Agenda', placeholder: '[\n  { "time": "8:00 AM", "title": "Opening Remarks", "description": "Welcome session" }\n]', value: agendaJson, setter: setAgendaJson },
            { key: 'sponsors', label: 'Sponsors', placeholder: '[\n  { "name": "Globe Business", "tier": "Gold" }\n]', value: sponsorsJson, setter: setSponsorsJson },
            { key: 'faqs', label: 'FAQs', placeholder: '[\n  { "question": "What is included?", "answer": "Full day access with meals." }\n]', value: faqsJson, setter: setFaqsJson },
          ] as const).map(({ key, label, placeholder, value, setter }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label} <span className="text-gray-400 font-normal text-xs">— JSON array</span>
              </label>
              <textarea rows={key === 'agenda' ? 8 : 4} spellCheck={false} placeholder={placeholder}
                value={value}
                onChange={(e) => { setter(e.target.value as any); if (jsonErrors[key]) setJsonErrors((prev) => { const n = { ...prev }; delete n[key]; return n; }); }}
                onBlur={(e) => { if (e.target.value.trim()) validateJson(e.target.value, key); }}
                className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y ${jsonErrors[key] ? 'border-red-400' : 'border-gray-300'}`}
              />
              {jsonErrors[key] && <p className="text-xs text-red-500 mt-1">{jsonErrors[key]}</p>}
            </div>
          ))}
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
                      onClick={() => { if (confirm(`Delete tier "${tier.name}"?`)) deleteTierMutation.mutate(tier.id); }}
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
