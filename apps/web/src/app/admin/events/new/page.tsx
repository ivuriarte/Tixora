'use client';

import { useRef, useState } from 'react';
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

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

const REQ = <span className="text-red-500 ml-0.5">*</span>;

// ── TimeSelect ─────────────────────────────────────────────────────────────────
function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const SELECT_CLS =
    'rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white';

  const parse = (v: string) => {
    if (!v) return { h12: 8, min: 0, period: 'AM' as 'AM' | 'PM' };
    const [hh, mm] = v.split(':').map(Number);
    const period: 'AM' | 'PM' = hh < 12 ? 'AM' : 'PM';
    const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    return { h12, min: mm ?? 0, period };
  };

  const emit = (h12: number, min: number, period: 'AM' | 'PM') => {
    let h24 = h12 === 12 ? 0 : h12;
    if (period === 'PM') h24 += 12;
    if (h12 === 12 && period === 'PM') h24 = 12;
    onChange(`${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  };

  const { h12, min, period } = parse(value);

  return (
    <div className="flex items-center gap-1.5">
      <select value={h12} onChange={(e) => emit(+e.target.value, min, period)}
        className={SELECT_CLS}>
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-gray-400 font-bold text-sm select-none">:</span>
      <select value={min} onChange={(e) => emit(h12, +e.target.value, period)}
        className={SELECT_CLS}>
        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
        ))}
      </select>
      <select value={period} onChange={(e) => emit(h12, min, e.target.value as 'AM' | 'PM')}
        className={SELECT_CLS}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

// ── PaymentMethod types ───────────────────────────────────────────────────────
interface LocalPaymentMethod {
  key: number;
  type: 'bank' | 'ewallet';
  name: string;
  accountName: string;
  accountNumber: string;
  qrFile: File | null;
  qrPreview: string;
  qrImageUrl: string;
}

function emptyPM(key: number): LocalPaymentMethod {
  return { key, type: 'bank', name: '', accountName: '', accountNumber: '', qrFile: null, qrPreview: '', qrImageUrl: '' };
}

// ── PaymentMethodForm ─────────────────────────────────────────────────────────
function PaymentMethodForm({
  initial, onSave, onCancel,
}: {
  initial: LocalPaymentMethod;
  onSave: (pm: LocalPaymentMethod) => void;
  onCancel: () => void;
}) {
  const [pm, setPm] = useState<LocalPaymentMethod>(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const upd = (field: keyof LocalPaymentMethod, value: string) =>
    setPm((prev) => ({ ...prev, [field]: value }));

  const hasValue = pm.name.trim() || pm.accountName.trim() || pm.accountNumber.trim() || pm.qrFile;
  const isNew = !initial.name && !initial.accountName && !initial.accountNumber;

  function handleQrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Only JPG and PNG files are allowed');
      e.target.value = '';
      return;
    }
    const preview = URL.createObjectURL(file);
    setPm((prev) => ({ ...prev, qrFile: file, qrPreview: preview }));
  }

  const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
      <p className="font-medium text-sm text-gray-900">{isNew ? 'New Payment Method' : 'Edit Payment Method'}</p>
      <div className="flex gap-3">
        {(['bank', 'ewallet'] as const).map((t) => (
          <button key={t} type="button"
            onClick={() => setPm((prev) => ({ ...prev, type: t }))}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
              pm.type === t ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
            }`}>
            {t === 'bank' ? '🏦 Bank Transfer' : '📱 E-Wallet'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {pm.type === 'bank' ? 'Bank Name' : 'E-Wallet Name'}
          </label>
          <input className={INP}
            placeholder={pm.type === 'bank' ? 'e.g. BPI, BDO' : 'e.g. GCash, Maya'}
            value={pm.name} onChange={(e) => upd('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Name</label>
          <input className={INP} placeholder="e.g. Juan Dela Cruz"
            value={pm.accountName} onChange={(e) => upd('accountName', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {pm.type === 'bank' ? 'Account Number' : 'Mobile / Account Number'}
          </label>
          <input className={INP}
            placeholder={pm.type === 'bank' ? 'e.g. 1234-5678-90' : 'e.g. 0917-123-4567'}
            value={pm.accountNumber} onChange={(e) => upd('accountNumber', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          QR Code <span className="text-gray-400">(optional · JPG or PNG only)</span>
        </label>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleQrFile} />
        {pm.qrPreview ? (
          <div className="flex items-center gap-3">
            <img src={pm.qrPreview} alt="QR preview" className="h-16 w-16 object-contain rounded border border-gray-200 bg-white" />
            <button type="button"
              onClick={() => { setPm((prev) => ({ ...prev, qrFile: null, qrPreview: '' })); if (fileRef.current) fileRef.current.value = ''; }}
              className="text-xs text-red-500 hover:text-red-700">Remove</button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 text-sm text-primary border border-dashed border-primary/40 rounded-lg px-3 py-2 hover:bg-primary/5 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Upload QR Code
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!hasValue} onClick={() => onSave(pm)}
          className="bg-primary text-white font-semibold px-4 py-1.5 rounded-lg text-sm hover:bg-primary-hover disabled:opacity-40">
          {isNew ? 'Add' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}
          className="border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}

// ── LocalTier + TierForm ──────────────────────────────────────────────────────
interface LocalTier {
  key: number;
  name: string;
  description: string;
  price: string;
  totalQuantity: string;
  maxPerOrder: string;
  isVisible: boolean;
}

function emptyTier(key: number): LocalTier {
  return { key, name: '', description: '', price: '', totalQuantity: '', maxPerOrder: '', isVisible: true };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminNewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    venue: '',
    address: '',
    landmark: '',
    city: '',
    maxCapacity: '',
    startDate: '',
    startTime: '08:00',
    endDate: '',
    endTime: '17:00',
  });

  const [speakerName, setSpeakerName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [sponsors, setSponsors] = useState<SponsorItem[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<LocalPaymentMethod[]>([]);
  const [pmKey, setPmKey] = useState(0);
  const [showAddPM, setShowAddPM] = useState(false);
  const [editingPmKey, setEditingPmKey] = useState<number | null>(null);

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
    parseInt(form.maxCapacity, 10) > 0 &&
    startsAtISO;

  const hasJsonErrors = false;
  const canSubmit = requiredFilled && tiers.length > 0 && !hasJsonErrors && !endBeforeStart;

  function addPaymentMethod(pm: LocalPaymentMethod) {
    setPaymentMethods((prev) => [...prev, pm]);
    setPmKey((k) => k + 1);
    setShowAddPM(false);
  }

  function validateJson(_raw: string, _key: string) { /* no-op */ }
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
      // Upload any QR code files first
      const resolvedPMs = await Promise.all(
        paymentMethods.map(async (pm) => {
          if (!pm.qrFile) return pm;
          const fd = new FormData();
          fd.append('image', pm.qrFile);
          const res = await api.post<{ data: { url: string } }>('/upload/payment-qr', fd);
          return { ...pm, qrImageUrl: res.data.data.url };
        }),
      );

      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        venue: form.venue.trim(),
        address: form.address.trim() || undefined,
        landmark: form.landmark.trim() || undefined,
        city: form.city.trim(),
        maxCapacity: parseInt(form.maxCapacity, 10),
        startsAt: startsAtISO,
        endsAt: endsAtISO ?? undefined,
        speakerName: speakerName.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        allowManualPayment: resolvedPMs.length > 0,
        paymentMethods:
          resolvedPMs.length > 0
            ? resolvedPMs.map((pm) => ({
                type: pm.type,
                name: pm.name.trim() || undefined,
                accountName: pm.accountName.trim() || undefined,
                accountNumber: pm.accountNumber.trim() || undefined,
                qrImageUrl: pm.qrImageUrl || undefined,
              }))
            : undefined,
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue{REQ}</label>
              <input name="venue" value={form.venue} onChange={update}
                placeholder="e.g. SMX Convention Center"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address{REQ}</label>
              <input name="address" value={form.address} onChange={update}
                placeholder="e.g. JP Laurel Ave, Davao City 8000"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Landmark <span className="text-gray-400 font-normal text-xs">(optional)</span>
              </label>
              <input name="landmark" value={form.landmark} onChange={update}
                placeholder="e.g. Near SM Lanang Premier, beside BDO"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City{REQ}</label>
              <input name="city" value={form.city} onChange={update}
                placeholder="e.g. Davao City"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Capacity{REQ}</label>
              <input name="maxCapacity" type="number" min="1" value={form.maxCapacity} onChange={update}
                placeholder="e.g. 500"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <p className="text-xs text-gray-400 mt-1">Total number of attendees allowed. Event will auto-switch to sold out when reached.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starts At{REQ}</label>
              <div className="flex flex-wrap items-center gap-3">
                <input name="startDate" type="date" min={todayStr()} value={form.startDate} onChange={update}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <TimeSelect value={form.startTime}
                  onChange={(v) => setForm((f) => ({ ...f, startTime: v }))} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ends At <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input name="endDate" type="date" min={form.startDate || todayStr()} value={form.endDate} onChange={update}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <TimeSelect value={form.endTime}
                  onChange={(v) => setForm((f) => ({ ...f, endTime: v }))} />
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
          <section className="bg-white shadow rounded-2xl p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">
                  Payment Options <span className="text-gray-400 text-sm font-normal">(optional)</span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Add bank or e-wallet payment methods for attendees.</p>
              </div>
              {!showAddPM && editingPmKey === null && (
                <button type="button" onClick={() => setShowAddPM(true)}
                  className="flex items-center gap-1.5 text-sm text-white bg-primary hover:bg-primary-hover px-3 py-1.5 rounded-lg font-medium transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Payment
                </button>
              )}
            </div>

            {paymentMethods.length > 0 && (
              <div className="space-y-2">
                {paymentMethods.map((pm) =>
                  editingPmKey === pm.key ? (
                    <PaymentMethodForm key={pm.key} initial={pm}
                      onSave={(updated) => {
                        setPaymentMethods((prev) => prev.map((p) => (p.key === updated.key ? updated : p)));
                        setEditingPmKey(null);
                      }}
                      onCancel={() => setEditingPmKey(null)} />
                  ) : (
                    <div key={pm.key} className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          pm.type === 'bank' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {pm.type === 'bank' ? 'Bank' : 'E-Wallet'}
                        </span>
                        <div>
                          <p className="font-medium text-sm text-gray-800">{pm.name || '(no name)'}</p>
                          {pm.accountNumber && <p className="text-xs text-gray-500">{pm.accountNumber}</p>}
                        </div>
                        {pm.qrPreview && (
                          <img src={pm.qrPreview} alt="QR" className="h-8 w-8 object-contain rounded border border-gray-100" />
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setEditingPmKey(pm.key)}
                          className="text-primary hover:underline text-xs">Edit</button>
                        <button type="button" onClick={() => setPaymentMethods((prev) => prev.filter((p) => p.key !== pm.key))}
                          className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {showAddPM && (
              <PaymentMethodForm initial={emptyPM(pmKey)}
                onSave={(pm) => addPaymentMethod(pm)}
                onCancel={() => setShowAddPM(false)} />
            )}

            {paymentMethods.length === 0 && !showAddPM && (
              <p className="text-sm text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-xl">
                No payment methods added yet. Click <strong>Add Payment</strong> to get started.
              </p>
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
    parseInt(t.totalQuantity, 10) > 0 &&
    parseInt(t.maxPerOrder, 10) > 0;

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
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Per Order <span className="text-red-500">*</span></label>
          <input type="number" min={1} max={20}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. 4"
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
