'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Button from '@/components/Button';
import { SponsorListManager, FaqListManager, AgendaListManager, type SponsorItem, type FaqItem, type AgendaItem } from '@/components/ConferenceFields';

// ── helpers ────────────────────────────────────────────────────────────────────

function combineDatetime(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  return new Date(`${date}T${time}`).toISOString();
}

interface LocalTier {
  key: number;
  name: string;
  description: string;
  price: string; // pesos, e.g. "500"
  totalQuantity: string;
  maxPerOrder: string;
  isVisible: boolean;
}

function emptyTier(key: number): LocalTier {
  return { key, name: '', description: '', price: '', totalQuantity: '', maxPerOrder: '4', isVisible: true };
}

function parseJsonSafe(raw: string): { ok: true; value: unknown } | { ok: false } {
  if (!raw.trim()) return { ok: true, value: null };
  try { return { ok: true, value: JSON.parse(raw) }; } catch { return { ok: false }; }
}

const REQ = <span className="text-red-500 ml-0.5">*</span>;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminNewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    venue: '',
    address: '',
    city: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    maxPerUser: '',
  });

  const [speakerName, setSpeakerName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [sponsors, setSponsors] = useState<SponsorItem[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});

  // Payment configuration
  const [allowManualPayment, setAllowManualPayment] = useState(true);
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [gcashNumber, setGcashNumber] = useState('');

  const [tiers, setTiers] = useState<LocalTier[]>([]);
  const [tierKey, setTierKey] = useState(0);
  const [showAddTier, setShowAddTier] = useState(false);
  const [editingTierKey, setEditingTierKey] = useState<number | null>(null);
  const [tiersSubmitAttempted, setTiersSubmitAttempted] = useState(false);

  function update(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  const startsAtISO = combineDatetime(form.startDate, form.startTime);
  const endsAtISO = combineDatetime(form.endDate, form.endTime);
  const endBeforeStart =
    !!startsAtISO && !!endsAtISO && new Date(endsAtISO) <= new Date(startsAtISO);

  const requiredFilled =
    form.title.trim() &&
    form.description.trim() &&
    form.venue.trim() &&
    form.address.trim() &&
    form.city.trim() &&
    startsAtISO;

  const hasJsonErrors = Object.keys(jsonErrors).length > 0;
  const canSubmit = requiredFilled && tiers.length > 0 && !hasJsonErrors && !endBeforeStart;

  function validateJson(raw: string, key: string) {
    const result = parseJsonSafe(raw);
    if (!result.ok) {
      setJsonErrors((e) => ({ ...e, [key]: 'Invalid JSON. Must be a valid JSON array.' }));
    } else {
      setJsonErrors((e) => { const n = { ...e }; delete n[key]; return n; });
    }
  }
  void validateJson;

  function addTier(t: LocalTier) {
    setTiers((prev) => [...prev, t]);
    const next = tierKey + 1;
    setTierKey(next);
    setShowAddTier(false);
  }

  function saveEditTier(updated: LocalTier) {
    setTiers((prev) => prev.map((t) => (t.key === updated.key ? updated : t)));
    setEditingTierKey(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTiersSubmitAttempted(true);
    if (!canSubmit) return;
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        venue: form.venue.trim(),
        address: form.address.trim() || undefined,
        city: form.city.trim(),
        startsAt: startsAtISO,
        endsAt: endsAtISO ?? undefined,
        maxPerUser: form.maxPerUser ? parseInt(form.maxPerUser, 10) : undefined,
        speakerName: speakerName.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        allowManualPayment,
        bankName: bankName.trim() || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        gcashNumber: gcashNumber.trim() || undefined,
      };
      if (agenda.length > 0) payload.agenda = agenda;
      if (sponsors.length > 0) payload.sponsors = sponsors.map((s) => ({ name: s.name, ...(s.logoUrl && { logoUrl: s.logoUrl }), ...(s.tier && { tier: s.tier }) }));
      if (faqs.length > 0) payload.faqs = faqs;

      const { data: eventData } = await api.post<{ data: { id: string } }>('/admin/events', payload);
      const eventId = eventData.data.id;

      await Promise.all(
        tiers.map((t) =>
          api.post(`/admin/events/${eventId}/tiers`, {
            name: t.name.trim(),
            description: t.description.trim() || undefined,
            price: Math.round(parseFloat(t.price) * 100),
            totalQuantity: parseInt(t.totalQuantity, 10),
            maxPerOrder: parseInt(t.maxPerOrder, 10),
            isVisible: t.isVisible,
          }),
        ),
      );

      toast.success('Event created!');
      router.push('/admin');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to create event');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">New Event</h1>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Event Details ──────────────────────────────────────────── */}
          <section className="bg-white shadow rounded-2xl p-8 space-y-5">
            <h2 className="font-semibold text-gray-900">Event Details</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title{REQ}</label>
              <input name="title" value={form.title} onChange={update}
                placeholder="e.g. My Awesome Concert 2026"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description{REQ}</label>
              <textarea name="description" rows={4} value={form.description} onChange={update}
                placeholder="Describe your event for attendees…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue{REQ}</label>
                <input name="venue" value={form.venue} onChange={update}
                  placeholder="e.g. SMX Convention Center"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City{REQ}</label>
                <input name="city" value={form.city} onChange={update}
                  placeholder="e.g. Davao City"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address{REQ}</label>
              <input name="address" value={form.address} onChange={update}
                placeholder="e.g. SM Lanang Premier, JP Laurel Ave, Davao City 8000"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starts At{REQ}</label>
              <div className="grid grid-cols-2 gap-3">
                <input name="startDate" type="date" value={form.startDate} onChange={update}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <input name="startTime" type="time" value={form.startTime} onChange={update}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ends At <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <input name="endDate" type="date" value={form.endDate} onChange={update}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <input name="endTime" type="time" value={form.endTime} onChange={update}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max tickets per user</label>
              <input name="maxPerUser" type="number" min={1} max={20} value={form.maxPerUser} onChange={update}
                placeholder="e.g. 4"
                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </section>

          {/* ── Conference Details ─────────────────────────────────────── */}
          <section className="bg-white shadow rounded-2xl p-8 space-y-5">
            <h2 className="font-semibold text-gray-900">
              Conference Details <span className="text-gray-400 text-sm font-normal">(optional)</span>
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Speaker Name</label>
              <input value={speakerName} onChange={(e) => setSpeakerName(e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cover Image URL <span className="text-gray-400 font-normal text-xs">(optional)</span>
              </label>
              <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/cover.jpg"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <AgendaListManager agenda={agenda} onChange={setAgenda} />

            <SponsorListManager sponsors={sponsors} onChange={setSponsors} />

            <FaqListManager faqs={faqs} onChange={setFaqs} />
          </section>

          {/* ── Payment Options ───────────────────────────────── */}
          <section className="bg-white shadow rounded-2xl p-8 space-y-5">
            <h2 className="font-semibold text-gray-900">
              Payment Options <span className="text-gray-400 text-sm font-normal">(optional)</span>
            </h2>

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
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                    <input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)}
                      placeholder="e.g. Axon Tickets Inc."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account Number</label>
                    <input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder="e.g. 1234-5678-90"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">GCash Number</label>
                    <input value={gcashNumber} onChange={(e) => setGcashNumber(e.target.value)}
                      placeholder="e.g. 0917-123-4567"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
                <p className="text-xs text-gray-400">These details are shown to attendees after registration.</p>
              </div>
            )}
          </section>

          {/* ── Ticket Tiers ───────────────────────────────────────────── */}
          <section className="bg-white shadow rounded-2xl p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Ticket Tiers{REQ}</h2>
                <p className="text-xs text-gray-400 mt-0.5">At least one tier is required.</p>
              </div>
              {!showAddTier && editingTierKey === null && (
                <button type="button" onClick={() => setShowAddTier(true)}
                  className="text-sm text-primary hover:underline font-medium">
                  + Add Tier
                </button>
              )}
            </div>

            {tiersSubmitAttempted && tiers.length === 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Please add at least one ticket tier before creating the event.
              </div>
            )}

            {tiers.length > 0 && (
              <div className="space-y-2">
                {tiers.map((tier) =>
                  editingTierKey === tier.key ? (
                    <TierForm key={tier.key} initial={tier}
                      onSave={saveEditTier}
                      onCancel={() => setEditingTierKey(null)} />
                  ) : (
                    <div key={tier.key} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{tier.name}</p>
                        <p className="text-xs text-gray-500">
                          ₱{parseFloat(tier.price || '0').toLocaleString()} · {tier.totalQuantity} total · max {tier.maxPerOrder}/order
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${tier.isVisible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {tier.isVisible ? 'visible' : 'hidden'}
                        </span>
                        <button type="button" onClick={() => setEditingTierKey(tier.key)}
                          className="text-primary hover:underline text-xs">Edit</button>
                        <button type="button" onClick={() => setTiers((prev) => prev.filter((t) => t.key !== tier.key))}
                          className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {showAddTier && (
              <TierForm
                initial={emptyTier(tierKey)}
                onSave={(t) => { addTier(t); }}
                onCancel={() => setShowAddTier(false)}
              />
            )}
          </section>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 pb-6">
            <button type="submit" disabled={loading} onClick={() => setTiersSubmitAttempted(true)}
              className="bg-primary text-white font-semibold px-6 py-2.5 rounded-xl text-sm hover:bg-primary-hover disabled:opacity-50 transition-colors">
              {loading ? 'Creating…' : 'Create Event'}
            </button>
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            {!canSubmit && tiersSubmitAttempted && (
              <p className="text-xs text-gray-400">
                {!requiredFilled
                  ? 'Fill in all required fields (*)'
                  : tiers.length === 0
                  ? 'Add at least one ticket tier'
                  : hasJsonErrors
                  ? 'Fix JSON errors above'
                  : endBeforeStart
                  ? 'Fix end date/time'
                  : ''}
              </p>
            )}
          </div>
        </form>
      </main>
    </>
  );
}

// ── Reusable tier inline form ──────────────────────────────────────────────────

function TierForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: LocalTier;
  onSave: (t: LocalTier) => void;
  onCancel: () => void;
}) {
  const [t, setT] = useState<LocalTier>(initial);
  const upd = (field: keyof LocalTier, value: string | boolean) =>
    setT((prev) => ({ ...prev, [field]: value }));
  const isValid =
    t.name.trim() &&
    t.price !== '' &&
    !isNaN(parseFloat(t.price)) &&
    parseFloat(t.price) >= 0 &&
    parseInt(t.totalQuantity, 10) > 0;

  return (
    <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
      <p className="font-medium text-sm text-gray-900">{initial.name ? 'Edit Tier' : 'New Tier'}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
          <input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. General Admission"
            value={t.name}
            onChange={(e) => upd('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Price (₱) <span className="text-red-500">*</span></label>
          <input type="number" min={0} step="0.01"
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. 500"
            value={t.price}
            onChange={(e) => upd('price', e.target.value)} />
          <p className="text-xs text-gray-400 mt-0.5">Enter amount in pesos</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Total Quantity <span className="text-red-500">*</span></label>
          <input type="number" min={1}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. 100"
            value={t.totalQuantity}
            onChange={(e) => upd('totalQuantity', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Per Order</label>
          <input type="number" min={1} max={20}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={t.maxPerOrder}
            onChange={(e) => upd('maxPerOrder', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="e.g. Includes lunch and materials"
          value={t.description}
          onChange={(e) => upd('description', e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={t.isVisible}
          onChange={(e) => upd('isVisible', e.target.checked)} className="accent-primary" />
        Visible on event page
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={!isValid} onClick={() => onSave(t)}
          className="bg-primary text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-primary-hover disabled:opacity-40">
          {initial.name ? 'Save Changes' : 'Add Tier'}
        </button>
        <button type="button" onClick={onCancel}
          className="border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
