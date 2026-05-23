'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import ConfirmModal from '@/components/ConfirmModal';
import toast from 'react-hot-toast';
import {
  type SponsorItem,
  type FaqItem,
  type AgendaItem,
} from '@/components/ConferenceFields';
import WizardShell from '@/components/event-wizard/WizardShell';
import BasicsStep from '@/components/event-wizard/steps/BasicsStep';
import LocationStep from '@/components/event-wizard/steps/LocationStep';
import CapacityTiersStep from '@/components/event-wizard/steps/CapacityTiersStep';
import ConferenceStep from '@/components/event-wizard/steps/ConferenceStep';
import PaymentStep from '@/components/event-wizard/steps/PaymentStep';
import ReviewStep from '@/components/event-wizard/steps/ReviewStep';
import {
  emptyDraft,
  combineDatetime,
  type EventDraft,
  type LocalTier,
  type LocalPaymentMethod,
} from '@/components/event-wizard/types';

// ─── Types from API ─────────────────────────────────────────────────────────

interface ApiTier {
  id: string;
  name: string;
  description: string | null;
  price: number; // centavos
  totalQuantity: number;
  soldQuantity: number;
  maxPerOrder: number;
  isVisible: boolean;
  sortOrder?: number;
}

interface ApiPaymentMethod {
  type: 'bank' | 'ewallet';
  name?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  qrImageUrl?: string | null;
}

interface ApiEvent {
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
  platformFee?: number | null;
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
  paymentMethods?: ApiPaymentMethod[] | null;
  landmark?: string | null;
  tiers: ApiTier[];
}

const STATUS_OPTIONS = ['draft', 'on_sale', 'sold_out', 'cancelled'];

function toLocalParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function apiTierToLocal(t: ApiTier, key: number): LocalTier {
  return {
    key,
    serverId: t.id,
    name: t.name,
    description: t.description ?? '',
    price: String(t.price / 100),
    totalQuantity: String(t.totalQuantity),
    maxPerOrder: String(t.maxPerOrder),
    isVisible: t.isVisible,
    soldQuantity: t.soldQuantity,
    sortOrder: t.sortOrder ?? 0,
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminEventEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: event, isLoading } = useQuery<ApiEvent>({
    queryKey: ['admin-event', id],
    queryFn: () => api.get<{ data: ApiEvent }>(`/admin/events/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const [draft, setDraft] = useState<EventDraft>(emptyDraft());
  const [tiers, setTiers] = useState<LocalTier[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<LocalPaymentMethod[]>([]);
  const nextPMKey = useRef(1);

  const [status, setStatus] = useState('draft');

  const initialised = useRef(false);
  useEffect(() => {
    if (!event || initialised.current) return;
    initialised.current = true;
    const start = toLocalParts(event.startsAt);
    const end = toLocalParts(event.endsAt);
    setDraft({
      title: event.title ?? '',
      description: event.description ?? '',
      imageUrl: event.imageUrl ?? '',
      speakerName: event.speakerName ?? '',
      venue: event.venue ?? '',
      address: event.address ?? '',
      landmark: event.landmark ?? '',
      city: event.city ?? '',
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      maxCapacity: event.maxCapacity != null ? String(event.maxCapacity) : '',
      platformFee: event.platformFee != null ? String(event.platformFee) : '50',
      // Defensive filters: drop any blank/incomplete rows so the editor
      // doesn't render empty placeholder cards left over from a bad save.
      agenda: Array.isArray(event.agenda)
        ? event.agenda
            .filter((a) => a && a.time && a.title)
            .map<AgendaItem>((a) => ({
              time: a.time,
              title: a.title,
              ...(a.description ? { description: a.description } : {}),
            }))
        : [],
      sponsors: Array.isArray(event.sponsors)
        ? event.sponsors
            .filter((s) => s && s.name)
            .map<SponsorItem>((s) => ({
              name: s.name,
              logoUrl: s.logoUrl ?? '',
              tier: s.tier ?? '',
            }))
        : [],
      faqs: Array.isArray(event.faqs)
        ? event.faqs
            .filter((f) => f && f.question && f.answer)
            .map<FaqItem>((f) => ({ question: f.question, answer: f.answer }))
        : [],
    });
    setStatus(event.status ?? 'draft');

    // Hydrate paymentMethods. Prefer the new array; if absent but legacy
    // single-bank / GCash fields exist, synthesize entries so existing events
    // are editable in the new UI without data loss.
    const fromArray = Array.isArray(event.paymentMethods)
      ? event.paymentMethods
          .filter((pm) => pm && (pm.name || pm.accountNumber || pm.qrImageUrl))
          .map<LocalPaymentMethod>((pm) => ({
            key: nextPMKey.current++,
            type: pm.type === 'ewallet' ? 'ewallet' : 'bank',
            name: pm.name ?? '',
            accountName: pm.accountName ?? '',
            accountNumber: pm.accountNumber ?? '',
            qrFile: null,
            qrPreview: pm.qrImageUrl ?? '',
            qrImageUrl: pm.qrImageUrl ?? '',
          }))
      : [];
    if (fromArray.length > 0) {
      setPaymentMethods(fromArray);
    } else {
      const migrated: LocalPaymentMethod[] = [];
      if (event.bankName || event.bankAccountNumber || event.bankAccountName) {
        migrated.push({
          key: nextPMKey.current++,
          type: 'bank',
          name: event.bankName ?? '',
          accountName: event.bankAccountName ?? '',
          accountNumber: event.bankAccountNumber ?? '',
          qrFile: null,
          qrPreview: '',
          qrImageUrl: '',
        });
      }
      if (event.gcashNumber) {
        migrated.push({
          key: nextPMKey.current++,
          type: 'ewallet',
          name: 'GCash',
          accountName: '',
          accountNumber: event.gcashNumber,
          qrFile: null,
          qrPreview: '',
          qrImageUrl: '',
        });
      }
      setPaymentMethods(migrated);
    }
  }, [event]);

  // Keep local tier state in sync with server tiers (preserves key across refresh)
  const tierKeysByServerId = useRef<Record<string, number>>({});
  const nextKey = useRef(1);
  useEffect(() => {
    if (!event?.tiers) return;
    setTiers(
      event.tiers.map((t) => {
        let key = tierKeysByServerId.current[t.id];
        if (!key) {
          key = nextKey.current++;
          tierKeysByServerId.current[t.id] = key;
        }
        return apiTierToLocal(t, key);
      }),
    );
  }, [event?.tiers]);

  const update = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // ─── Mutations ────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/admin/events/${id}`, data),
    onSuccess: () => {
      toast.success('Event updated');
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
    onError: () => toast.error('Failed to update event'),
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => api.put(`/admin/events/${id}`, { status: newStatus }),
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  const addTierMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post(`/admin/events/${id}/tiers`, data),
    onSuccess: () => {
      toast.success('Tier added');
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    },
    onError: () => toast.error('Failed to add tier'),
  });

  const updateTierMutation = useMutation({
    mutationFn: ({ tierId, data }: { tierId: string; data: Record<string, unknown> }) =>
      api.put(`/admin/tiers/${tierId}`, data),
    onSuccess: () => {
      toast.success('Tier updated');
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

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/events/${id}`),
    onSuccess: () => {
      toast.success('Event deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      router.push('/admin');
    },
    onError: () => toast.error('Failed to delete event'),
  });

  // ─── Tier handlers (wired to mutations) ───────────────────────────────────
  function handleAddTier(t: LocalTier) {
    addTierMutation.mutate({
      name: t.name.trim(),
      description: t.description.trim() || undefined,
      price: Math.round(parseFloat(t.price) * 100),
      totalQuantity: parseInt(t.totalQuantity, 10),
      maxPerOrder: parseInt(t.maxPerOrder, 10),
      isVisible: t.isVisible,
      sortOrder: tiers.length,
    });
  }
  function handleEditTier(t: LocalTier) {
    if (!t.serverId) return;
    updateTierMutation.mutate({
      tierId: t.serverId,
      data: {
        name: t.name.trim(),
        description: t.description.trim() || null,
        price: Math.round(parseFloat(t.price) * 100),
        totalQuantity: parseInt(t.totalQuantity, 10),
        maxPerOrder: parseInt(t.maxPerOrder, 10),
        isVisible: t.isVisible,
      },
    });
  }
  function handleRemoveTier(key: number) {
    const target = tiers.find((x) => x.key === key);
    if (!target?.serverId) return;
    deleteTierMutation.mutate(target.serverId);
  }
  /**
   * Persist the new tier order: optimistically update local state, then
   * PUT each tier whose sortOrder changed. We avoid a full refetch so the
   * user sees the change immediately; the query invalidates after success.
   */
  async function handleReorderTiers(next: LocalTier[]) {
    setTiers(next);
    const changed = next
      .map((t, idx) => ({ t, idx }))
      .filter(({ t, idx }) => t.serverId && t.sortOrder !== idx);
    if (changed.length === 0) return;
    try {
      await Promise.all(
        changed.map(({ t, idx }) =>
          api.put(`/admin/tiers/${t.serverId}`, { sortOrder: idx }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    } catch {
      toast.error('Failed to save tier order');
    }
  }

  // ─── Payment-method handlers (local; persisted with the event save) ──────
  function addPM(pm: LocalPaymentMethod) {
    setPaymentMethods((prev) => [...prev, { ...pm, key: nextPMKey.current++ }]);
  }
  function editPM(pm: LocalPaymentMethod) {
    setPaymentMethods((prev) => prev.map((x) => (x.key === pm.key ? pm : x)));
  }
  function removePM(key: number) {
    setPaymentMethods((prev) => prev.filter((x) => x.key !== key));
  }

  // ─── Save (whole-event update) ────────────────────────────────────────────
  async function handleSubmit() {
    const startsAtISO = combineDatetime(draft.startDate, draft.startTime);
    const endsAtISO = combineDatetime(draft.endDate, draft.endTime);

    // Upload any newly-attached QR images before sending the event payload.
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
      title: draft.title.trim(),
      description: draft.description.trim(),
      venue: draft.venue.trim(),
      address: draft.address.trim() || null,
      city: draft.city.trim(),
      startsAt: startsAtISO,
      endsAt: endsAtISO ?? null,
      maxCapacity: draft.maxCapacity.trim() === '' ? null : parseInt(draft.maxCapacity, 10),
      platformFee: parseFloat(draft.platformFee) || 50,
      status,
      speakerName: draft.speakerName.trim() || null,
      imageUrl: draft.imageUrl.trim() || null,
      allowManualPayment: resolvedPMs.length > 0,
      paymentMethods: resolvedPMs.length > 0
        ? resolvedPMs.map((pm) => ({
            type: pm.type,
            name: pm.name.trim() || undefined,
            accountName: pm.accountName.trim() || undefined,
            accountNumber: pm.accountNumber.trim() || undefined,
            qrImageUrl: pm.qrImageUrl || undefined,
          }))
        : null,
      agenda: draft.agenda.length > 0 ? draft.agenda : null,
      sponsors:
        draft.sponsors.length > 0
          ? draft.sponsors.map((s) => ({
              name: s.name,
              ...(s.logoUrl && { logoUrl: s.logoUrl }),
              ...(s.tier && { tier: s.tier }),
            }))
          : null,
      faqs: draft.faqs.length > 0 ? draft.faqs : null,
    };
    await updateMutation.mutateAsync(payload);
  }

  // ─── Confirm dialog ───────────────────────────────────────────────────────
  type ConfirmState = {
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'warning';
    onConfirm: () => void;
  } | null;
  const [dialog, setDialog] = useState<ConfirmState>(null);

  // ─── Top banner: status + cancel + delete ─────────────────────────────────
  const topBanner = event ? (
    <div className="mb-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Status:</label>
        {event.status === 'completed' ? (
          <span className="px-3 py-1 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
            completed <span className="text-xs text-gray-400 ml-1">(auto)</span>
          </span>
        ) : (
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={status}
            onChange={(e) => {
              const newStatus = e.target.value;
              if (newStatus === 'cancelled') {
                setDialog({
                  title: `Cancel "${event.title}"?`,
                  message: "This will mark the event as cancelled. Customers won't be able to purchase new tickets.",
                  confirmLabel: 'Yes, cancel event',
                  variant: 'warning',
                  onConfirm: () => {
                    setStatus('cancelled');
                    statusMutation.mutate('cancelled');
                  },
                });
                return;
              }
              setStatus(newStatus);
              statusMutation.mutate(newStatus);
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        )}
        {statusMutation.isPending && <span className="text-xs text-primary">Saving…</span>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            setDialog({
              title: `Cancel "${event.title}"?`,
              message: "This will mark the event as cancelled. Customers won't be able to purchase new tickets.",
              confirmLabel: 'Yes, cancel event',
              variant: 'warning',
              onConfirm: () => statusMutation.mutate('cancelled'),
            })
          }
          disabled={statusMutation.isPending || event.status === 'cancelled'}
          className="text-amber-600 hover:text-amber-800 text-sm font-medium disabled:opacity-40"
        >
          {event.status === 'cancelled' ? 'Already Cancelled' : 'Cancel Event'}
        </button>
        <button
          type="button"
          onClick={() =>
            setDialog({
              title: `Delete "${event.title}"?`,
              message: 'This permanently removes the event and all its data. This cannot be undone.',
              confirmLabel: 'Delete event',
              variant: 'danger',
              onConfirm: () => deleteMutation.mutate(),
            })
          }
          disabled={deleteMutation.isPending}
          className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-40"
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Delete Event'}
        </button>
      </div>
    </div>
  ) : null;

  // ─── Inline Edit-mode Payment step removed: the wizard now uses the
  // multi-method PaymentStep directly (see render switch below).

  if (isLoading || !event) {
    return (
      <>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-gray-400">Loading…</p>
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
        onConfirm={() => {
          dialog?.onConfirm();
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />
      <Navbar />
      <WizardShell
        title="Edit Event"
        draft={draft}
        tiers={tiers}
        submitLabel={updateMutation.isPending ? 'Saving…' : 'Save Changes'}
        submitting={updateMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/admin')}
        topBanner={topBanner}
        renderStep={(step, jump) => {
          switch (step) {
            case 'basics': return <BasicsStep draft={draft} update={update} />;
            case 'location': return <LocationStep draft={draft} update={update} />;
            case 'capacity':
              return (
                <CapacityTiersStep
                  draft={draft}
                  update={update}
                  tiers={tiers}
                  onAddTier={handleAddTier}
                  onEditTier={handleEditTier}
                  onRemoveTier={handleRemoveTier}
                  onReorderTiers={handleReorderTiers}
                />
              );
            case 'conference': return <ConferenceStep draft={draft} update={update} />;
            case 'payment':
              return (
                <PaymentStep
                  paymentMethods={paymentMethods}
                  onAdd={addPM}
                  onEdit={editPM}
                  onRemove={removePM}
                  onReorder={setPaymentMethods}
                />
              );
            case 'review':
              return (
                <ReviewStep
                  draft={draft}
                  tiers={tiers}
                  paymentMethods={paymentMethods}
                  onJump={jump}
                />
              );
          }
        }}
      />
    </>
  );
}
