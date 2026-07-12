'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import WizardShell from '@/components/event-wizard/WizardShell';
import BasicsStep from '@/components/event-wizard/steps/BasicsStep';
import LocationStep from '@/components/event-wizard/steps/LocationStep';
import CapacityTiersStep from '@/components/event-wizard/steps/CapacityTiersStep';
import ConferenceStep from '@/components/event-wizard/steps/ConferenceStep';
import PaymentStep from '@/components/event-wizard/steps/PaymentStep';
import ReviewStep from '@/components/event-wizard/steps/ReviewStep';
import ReferralCodesPanel, { type ReferralDraft } from '@/components/event-wizard/ReferralCodesPanel';
import {
  emptyDraft,
  combineDatetime,
  type EventDraft,
  type LocalTier,
  type LocalPaymentMethod,
} from '@/components/event-wizard/types';
import { loadDraft, clearDraft, useAutosaveDraft } from '@/components/event-wizard/useEventDraft';

/** Retry once on network/timeout errors (cold-start protection). Does not retry on 4xx/5xx. */
async function postWithRetry(url: string, body: object): Promise<{ data: unknown }> {
  try {
    return await api.post(url, body);
  } catch (err) {
    if ((err as { response?: unknown }).response) throw err;
    return api.post(url, body);
  }
}

export default function AdminNewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [platformFee, setPlatformFee] = useState<number | null>(null);

  const [draft, setDraft] = useState<EventDraft>(emptyDraft());
  const [tiers, setTiers] = useState<LocalTier[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<LocalPaymentMethod[]>([]);
  const [referralCodes, setReferralCodes] = useState<ReferralDraft[]>([]);

  useEffect(() => {
    api.get<{ data: { serviceFee: number } }>('/admin/settings/platform')
      .then((res) => setPlatformFee(res.data.data.serviceFee))
      .catch(() => setPlatformFee(50));
  }, []);

  // ── Draft restoration banner ───────────────────────────────────────────
  const [restorePrompt, setRestorePrompt] = useState<null | {
    draft: EventDraft;
    tiers: LocalTier[];
    paymentMethods: LocalPaymentMethod[];
    savedAt: number;
  }>(null);

  useEffect(() => {
    const saved = loadDraft();
    if (!saved) return;
    setRestorePrompt({
      draft: saved.draft,
      tiers: saved.tiers,
      paymentMethods: saved.paymentMethods.map((pm) => ({ ...pm, qrFile: null })) as LocalPaymentMethod[],
      savedAt: saved.savedAt,
    });
  }, []);

  function acceptRestore() {
    if (!restorePrompt) return;
    setDraft(restorePrompt.draft);
    setTiers(restorePrompt.tiers);
    setPaymentMethods(restorePrompt.paymentMethods);
    setRestorePrompt(null);
    toast.success('Draft restored. Continue editing and save when ready.');
  }

  function discardRestore() {
    clearDraft();
    setRestorePrompt(null);
  }

  // ── Autosave (disabled while restore prompt is showing) ────────────────
  const savedAt = useAutosaveDraft(draft, tiers, paymentMethods, restorePrompt === null);

  const update = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // ── Tier mutations (local-only in create mode) ─────────────────────────
  function addTier(t: LocalTier) {
    setTiers((prev) => [...prev, t]);
  }
  function editTier(t: LocalTier) {
    setTiers((prev) => prev.map((x) => (x.key === t.key ? t : x)));
  }
  function removeTier(key: number) {
    setTiers((prev) => prev.filter((x) => x.key !== key));
  }

  // ── Payment mutations (local-only) ─────────────────────────────────────
  function addPM(pm: LocalPaymentMethod) {
    setPaymentMethods((prev) => [...prev, pm]);
  }
  function editPM(pm: LocalPaymentMethod) {
    setPaymentMethods((prev) => prev.map((x) => (x.key === pm.key ? pm : x)));
  }
  function removePM(key: number) {
    setPaymentMethods((prev) => prev.filter((x) => x.key !== key));
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setLoading(true);
    try {
      const startsAtISO = combineDatetime(draft.startDate, draft.startTime);
      const endsAtISO = combineDatetime(draft.endDate, draft.endTime);

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
        address: draft.address.trim() || undefined,
        landmark: draft.landmark.trim() || undefined,
        city: draft.city.trim(),
        latitude: draft.latitude.trim() ? parseFloat(draft.latitude) : undefined,
        longitude: draft.longitude.trim() ? parseFloat(draft.longitude) : undefined,
        maxCapacity: draft.maxCapacity.trim() === '' ? undefined : parseInt(draft.maxCapacity, 10),
        startsAt: startsAtISO,
        endsAt: endsAtISO ?? undefined,
        speakerName: draft.speakerName.trim() || undefined,
        imageUrl: draft.imageUrl.trim() || undefined,
        allowManualPayment: resolvedPMs.length > 0,
        paymentMethods: resolvedPMs.length > 0
          ? resolvedPMs.map((pm) => ({
              type: pm.type,
              name: pm.name.trim() || undefined,
              accountName: pm.accountName.trim() || undefined,
              accountNumber: pm.accountNumber.trim() || undefined,
              qrImageUrl: pm.qrImageUrl || undefined,
            }))
          : undefined,
        tagline: draft.tagline.trim() || undefined,
      };
      if (draft.agenda.length > 0) {
        const cleaned = draft.agenda
          .filter((a) => a && typeof a === 'object' && !Array.isArray(a))
          .map((a) => ({
            time: (a.time ?? '').trim(),
            title: (a.title ?? '').trim(),
            ...(a.description?.trim() && { description: a.description.trim() }),
          }))
          .filter((a) => a.title.length > 0);
        if (cleaned.length > 0) payload.agenda = cleaned;
      }
      if (draft.sponsors.length > 0) {
        const cleaned = draft.sponsors
          .filter((s) => s && typeof s === 'object' && !Array.isArray(s))
          .map((s) => ({
            name: (s.name ?? '').trim(),
            ...(s.logoUrl && { logoUrl: s.logoUrl }),
            ...(s.tier && { tier: s.tier }),
            ...(s.websiteUrl?.trim() && { websiteUrl: s.websiteUrl.trim() }),
            ...(s.description?.trim() && { description: s.description.trim() }),
            isVisible: s.isVisible,
          }))
          .filter((s) => s.name.length > 0);
        if (cleaned.length > 0) payload.sponsors = cleaned;
      }
      if (draft.customSections.length > 0) payload.customSections = draft.customSections;
      if (draft.faqs.length > 0) {
        const cleaned = draft.faqs
          .filter((f) => f && typeof f === 'object' && !Array.isArray(f))
          .map((f) => ({
            question: (f.question ?? '').trim(),
            answer: (f.answer ?? '').trim(),
          }))
          .filter((f) => f.question.length > 0 && f.answer.length > 0);
        if (cleaned.length > 0) payload.faqs = cleaned;
      }

      const { data: eventData } = await api.post<{ data: { id: string } }>('/admin/events', payload);
      const eventId = eventData.data.id;

      let createdTierIds = new Map<number, string>();
      try {
        const tierResults = await Promise.all(
          tiers.map((t, idx) =>
            postWithRetry(`/admin/events/${eventId}/tiers`, {
              name: t.name.trim(),
              description: t.description.trim() || undefined,
              price: parseFloat(t.price),
              totalQuantity: parseInt(t.totalQuantity, 10),
              maxPerOrder: parseInt(t.maxPerOrder, 10),
              isVisible: t.isVisible,
              sortOrder: idx,
            }),
          ),
        );
        createdTierIds = new Map(tierResults.map((result, index) => {
          const body = result.data as { data?: { id?: string }; id?: string };
          return [tiers[index].key, body.data?.id ?? body.id ?? ''] as [number, string];
        }).filter((entry) => Boolean(entry[1])));
      } catch (tierErr) {
        // Roll back the orphaned event so the user can safely retry from scratch
        try { await api.delete(`/admin/events/${eventId}`); } catch { /* best-effort */ }
        throw tierErr;
      }

      if (referralCodes.length > 0) {
        try {
          await Promise.all(referralCodes.map((code) => api.post(`/admin/events/${eventId}/referral-codes`, {
            name: code.name.trim(), code: code.code.trim().toUpperCase(), discountType: code.discountType,
            discountValue: Number(code.discountValue), ...(code.maxUses && { maxUses: Number(code.maxUses) }),
            ...(code.validFrom && { validFrom: new Date(code.validFrom).toISOString() }),
            ...(code.validUntil && { validUntil: new Date(code.validUntil).toISOString() }),
            ...(code.applicableTierIds.length > 0 && { applicableTierIds: code.applicableTierIds.map((tierId) => tierId.startsWith('local:') ? createdTierIds.get(Number(tierId.slice(6))) : tierId).filter(Boolean) }),
          })));
        } catch (referralError) {
          try { await api.delete(`/admin/events/${eventId}`); } catch { /* best-effort rollback */ }
          throw referralError;
        }
      }

      clearDraft();
      toast.success('Event created! You can now add ticket tiers and publish it for sale.');
      router.push('/admin');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create event';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  // ── Status indicator (autosave) ────────────────────────────────────────
  const statusIndicator = useMemo(() => {
    if (!savedAt) return null;
    const seconds = Math.max(1, Math.floor((Date.now() - savedAt) / 1000));
    return (
      <span className="text-xs text-gray-500 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Draft saved {seconds < 5 ? 'just now' : `${seconds}s ago`}
      </span>
    );
  }, [savedAt]);

  const restoreBanner = restorePrompt ? (
    <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-gray-800">
        <strong>You have an unsaved draft</strong> from{' '}
        {new Date(restorePrompt.savedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.{' '}
        Would you like to continue where you left off?
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={acceptRestore}
          className="bg-primary text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-primary-hover"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={discardRestore}
          className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1.5"
        >
          Discard
        </button>
      </div>
    </div>
  ) : null;

  return (
    <WizardShell
        title="New Event"
        draft={draft}
        tiers={tiers}
        submitLabel={loading ? 'Creating…' : 'Create Event'}
        submitting={loading}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/admin')}
        statusIndicator={statusIndicator}
        topBanner={restoreBanner}
        renderStep={(step, jump) => {
          switch (step) {
            case 'basics': return <BasicsStep draft={draft} update={update} />;
            case 'location': return <LocationStep draft={draft} update={update} />;
            case 'capacity':
              return (
                <CapacityTiersStep
                  draft={draft} update={update}
                  tiers={tiers}
                  onAddTier={addTier} onEditTier={editTier} onRemoveTier={removeTier}
                  onReorderTiers={setTiers}
                />
              );
            case 'details': return <ConferenceStep draft={draft} update={update} />;
            case 'payment':
              return (<>
                <PaymentStep
                  paymentMethods={paymentMethods}
                  onAdd={addPM} onEdit={editPM} onRemove={removePM}
                  onReorder={setPaymentMethods}
                  platformFee={platformFee}
                />
                <ReferralCodesPanel tiers={tiers} pending={referralCodes} onPendingChange={setReferralCodes} />
              </>);
            case 'review':
              return (
                <ReviewStep
                  draft={draft} tiers={tiers} paymentMethods={paymentMethods} onJump={jump}
                />
              );
          }
        }}
      />
  );
}
