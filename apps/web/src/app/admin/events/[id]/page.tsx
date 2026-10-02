'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
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
import ReferralCodesPanel from '@/components/event-wizard/ReferralCodesPanel';
import { ErrorState, ScreenSkeleton } from '@/components/ScreenState';
import { apiErrorList, apiErrorMessage } from '@/lib/api-error';
import {
  emptyDraft,
  combineDatetime,
  toManilaParts,
  publishIssues,
  STEPS,
  type EventDraft,
  type LocalTier,
  type LocalPaymentMethod,
  type StepId,
} from '@/components/event-wizard/types';

// ─── Types from API ─────────────────────────────────────────────────────────

interface ApiTier {
  id: string;
  name: string;
  description: string | null;
  price: number; // pesos
  totalQuantity: number;
  soldQuantity: number;
  maxPerOrder: number;
  isVisible: boolean;
  sortOrder?: number;
  inclusions?: Array<{ id: string; label: string; stubEnabled: boolean; sortOrder: number }>;
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
  latitude: number | null;
  longitude: number | null;
  startsAt: string;
  endsAt: string | null;
  maxPerUser: number;
  maxCapacity: number | null;
  isFree?: boolean;
  platformFee?: number | null;
  status: string;
  imageUrl?: string | null;
  speakerName?: string | null;
  agenda?: Array<{ id?: string; time: string; title: string; description?: string; isSubEvent?: boolean }> | null;
  sponsors?: Array<{ name: string; logoUrl?: string; tier?: string; websiteUrl?: string; description?: string; isVisible?: boolean }> | null;
  faqs?: Array<{ question: string; answer: string }> | null;
  allowManualPayment?: boolean;
  onsiteRegistrationEnabled?: boolean;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  gcashNumber?: string | null;
  paymentMethods?: ApiPaymentMethod[] | null;
  landmark?: string | null;
  tiers: ApiTier[];
  tagline?: string | null;
  customSections?: Array<{ title: string; description: string; imageUrl?: string; imageAlt?: string; isVisible?: boolean }> | null;
  category?: EventDraft['category'];
  eventType?: EventDraft['eventType'];
  isOnline?: boolean;
  runningConfig?: EventDraft['runningConfig'] | null;
  access: { role: 'platform_admin' | 'owner' | 'co_owner' | 'manager' | 'member'; canManageEvent: boolean; capabilities: string[] };
  updatedAt?: string;
}

interface WorkspaceSummary {
  workspaceId: string;
  readiness: {
    score: number;
    scorableTotal: number;
    done: number;
    notStarted: number;
    inProgress: number;
    blocked: number;
    notApplicable: number;
    hasCriticalBlockers: boolean;
    blockedCount: number;
    unownedCount: number;
    overdueCount: number;
    dueTodayCount: number;
    dueSoonCount: number;
  };
  criticalBlockers: Array<{ id: string; title: string; status: string }>;
  blockedItems: Array<{ id: string; title: string; category: string }>;
}

const STATUS_OPTIONS = ['draft', 'on_sale', 'sold_out', 'cancelled'];

// ─── Unsaved-change tracking ──────────────────────────────────────────────
// Tiers save immediately through their own endpoints, so only event fields and
// payment methods can be unsaved.

type DraftFields = Omit<EventDraft, 'savedStartsAt' | 'savedEndsAt'>;

const STEP_OF_FIELD: Record<keyof DraftFields, StepId> = {
  title: 'basics', description: 'basics', imageUrl: 'basics', tagline: 'basics',
  category: 'basics', eventType: 'basics', isOnline: 'basics',
  venue: 'location', address: 'location', landmark: 'location', city: 'location',
  latitude: 'location', longitude: 'location',
  startDate: 'location', startTime: 'location', endDate: 'location', endTime: 'location',
  maxCapacity: 'capacity', isFree: 'capacity', platformFee: 'capacity',
  speakerName: 'details', agenda: 'details', sponsors: 'details', faqs: 'details',
  customSections: 'details', runningConfig: 'details',
};

interface SavedState {
  fields: DraftFields;
  paymentMethods: string;
}

function editableFields(d: EventDraft): DraftFields {
  const { savedStartsAt: _start, savedEndsAt: _end, ...fields } = d;
  return fields;
}

function paymentMethodsKey(pms: LocalPaymentMethod[]): string {
  return JSON.stringify(
    pms.map((pm) => ({
      type: pm.type,
      name: pm.name,
      accountName: pm.accountName,
      accountNumber: pm.accountNumber,
      qrImageUrl: pm.qrImageUrl,
      newQr: Boolean(pm.qrFile),
    })),
  );
}

function savedStateOf(d: EventDraft, pms: LocalPaymentMethod[]): SavedState {
  return { fields: editableFields(d), paymentMethods: paymentMethodsKey(pms) };
}

/** Unsaved edits kept in this browser until the server confirms the save. */
interface EditBackup {
  changes: Partial<DraftFields>;
  paymentMethods?: Array<Omit<LocalPaymentMethod, 'key' | 'qrFile'>>;
  baseUpdatedAt?: string;
  savedAt: number;
}

const backupKey = (eventId: string) => `tixora:event-edit:${eventId}:v1`;

function readBackup(eventId: string): EditBackup | null {
  try {
    const raw = localStorage.getItem(backupKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditBackup;
    return parsed && typeof parsed.savedAt === 'number' && parsed.changes ? parsed : null;
  } catch {
    return null;
  }
}

function writeBackup(eventId: string, backup: EditBackup) {
  try {
    localStorage.setItem(backupKey(eventId), JSON.stringify(backup));
  } catch {
    /* storage full or blocked: the in-page copy is still intact */
  }
}

function clearBackup(eventId: string) {
  try {
    localStorage.removeItem(backupKey(eventId));
  } catch {
    /* ignore */
  }
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).replace(/, (\d{1,2}:\d{2})/, ' · $1');
}

function apiTierToLocal(t: ApiTier, key: number): LocalTier {
  return {
    key,
    serverId: t.id,
    name: t.name,
    description: t.description ?? '',
    price: String(Number(t.price)),
    totalQuantity: String(t.totalQuantity),
    maxPerOrder: String(t.maxPerOrder),
    isVisible: t.isVisible,
    inclusions: (t.inclusions ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      stubEnabled: item.stubEnabled,
      sortOrder: item.sortOrder,
    })),
    soldQuantity: t.soldQuantity,
    sortOrder: t.sortOrder ?? 0,
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminEventEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = Boolean(user?.isAdmin);

  const { data: event, isLoading, isError, refetch } = useQuery<ApiEvent>({
    queryKey: ['admin-event', id],
    queryFn: () => api.get<{ data: ApiEvent }>(`/admin/events/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
  const canManageEvent = event?.access?.canManageEvent ?? false;

  const [draft, setDraft] = useState<EventDraft>(emptyDraft());
  const [tiers, setTiers] = useState<LocalTier[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<LocalPaymentMethod[]>([]);
  const [onsiteRegistrationEnabled, setOnsiteRegistrationEnabled] = useState(false);
  const nextPMKey = useRef(1);

  const [status, setStatus] = useState('draft');

  // What the server last confirmed; anything different is an unsaved change.
  const [saved, setSaved] = useState<SavedState | null>(null);
  const [captureSaved, setCaptureSaved] = useState(false);
  const [restoreOffer, setRestoreOffer] = useState<EditBackup | null>(null);
  const [backupReady, setBackupReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishAttempt, setPublishAttempt] = useState(0);
  const [serverIssues, setServerIssues] = useState<string[]>([]);

  const initialised = useRef(false);
  useEffect(() => {
    if (!event || initialised.current) return;
    initialised.current = true;
    setCaptureSaved(true);
    setRestoreOffer(readBackup(event.id));
    setBackupReady(true);
    const start = toManilaParts(event.startsAt);
    const end = toManilaParts(event.endsAt);
    setDraft({
      title: event.title ?? '',
      description: event.description ?? '',
      imageUrl: event.imageUrl ?? '',
      speakerName: event.speakerName ?? '',
      category: event.category ?? 'business',
      eventType: event.eventType ?? 'standard',
      isOnline: event.isOnline === true,
      venue: event.venue ?? '',
      address: event.address ?? '',
      landmark: event.landmark ?? '',
      city: event.city ?? '',
      latitude: event.latitude != null ? String(event.latitude) : '',
      longitude: event.longitude != null ? String(event.longitude) : '',
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      savedStartsAt: event.startsAt,
      savedEndsAt: event.endsAt ?? null,
      maxCapacity: event.maxCapacity != null ? String(event.maxCapacity) : '',
      isFree: event.isFree === true,
      platformFee: event.platformFee != null ? String(event.platformFee) : '50',
      // Defensive filters: drop any blank/incomplete rows so the editor
      // doesn't render empty placeholder cards left over from a bad save.
      agenda: Array.isArray(event.agenda)
        ? event.agenda
            .filter((a) => a && a.time && a.title)
            .map<AgendaItem>((a) => ({
              ...(a.id ? { id: a.id } : {}),
              time: a.time,
              title: a.title,
              ...(a.description ? { description: a.description } : {}),
              ...(a.isSubEvent ? { isSubEvent: true } : {}),
            }))
        : [],
      sponsors: Array.isArray(event.sponsors)
        ? event.sponsors
            .filter((s) => s && s.name)
            .map<SponsorItem>((s) => ({
              name: s.name,
              logoUrl: s.logoUrl ?? '',
              tier: s.tier ?? '',
              websiteUrl: s.websiteUrl ?? '',
              description: s.description ?? '',
              isVisible: s.isVisible !== false,
            }))
        : [],
      faqs: Array.isArray(event.faqs)
        ? event.faqs
            .filter((f) => f && f.question && f.answer)
            .map<FaqItem>((f) => ({ question: f.question, answer: f.answer }))
        : [],
      tagline: event.tagline ?? '',
      customSections: Array.isArray(event.customSections) ? event.customSections.map((section) => ({ title: section.title, description: section.description, imageUrl: section.imageUrl ?? '', imageAlt: section.imageAlt ?? '', isVisible: section.isVisible !== false })) : [],
      runningConfig: event.runningConfig ?? emptyDraft().runningConfig,
    });
    setStatus(event.status ?? 'draft');
    setOnsiteRegistrationEnabled(event.onsiteRegistrationEnabled === true);

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

  // Runs on the render after initialisation, when draft and payment methods hold the loaded values.
  useEffect(() => {
    if (!captureSaved) return;
    setCaptureSaved(false);
    setSaved(savedStateOf(draft, paymentMethods));
  }, [captureSaved, draft, paymentMethods]);

  const changedFields = useMemo(() => {
    if (!saved) return [] as Array<keyof DraftFields>;
    const current = editableFields(draft);
    return (Object.keys(current) as Array<keyof DraftFields>).filter(
      (field) => JSON.stringify(current[field]) !== JSON.stringify(saved.fields[field]),
    );
  }, [draft, saved]);
  const paymentMethodsChanged = saved !== null && paymentMethodsKey(paymentMethods) !== saved.paymentMethods;
  const isDirty = changedFields.length > 0 || paymentMethodsChanged;
  const editedSteps = useMemo(() => {
    const steps = new Set<StepId>(changedFields.map((field) => STEP_OF_FIELD[field]));
    if (paymentMethodsChanged) steps.add('payment');
    return steps;
  }, [changedFields, paymentMethodsChanged]);

  // Keep unsaved edits in this browser so a closed tab or ended session loses nothing.
  // Written on every change (small, synchronous) so nothing is lost when the page unmounts.
  useEffect(() => {
    if (!event || !backupReady || !canManageEvent) return;
    if (!isDirty && !restoreOffer) {
      clearBackup(event.id);
      return;
    }
    if (!isDirty) return;
    const current = editableFields(draft);
    const changes = Object.fromEntries(changedFields.map((field) => [field, current[field]])) as Partial<DraftFields>;
    // While an older backup is still being offered, keep it and layer the new edits on top.
    writeBackup(event.id, {
      changes: { ...(restoreOffer?.changes ?? {}), ...changes },
      ...(paymentMethodsChanged
        ? { paymentMethods: paymentMethods.map(({ key: _key, qrFile: _file, ...rest }) => rest) }
        : restoreOffer?.paymentMethods
        ? { paymentMethods: restoreOffer.paymentMethods }
        : {}),
      baseUpdatedAt: restoreOffer?.baseUpdatedAt ?? event.updatedAt,
      savedAt: Date.now(),
    });
  }, [event, backupReady, canManageEvent, restoreOffer, isDirty, draft, changedFields, paymentMethods, paymentMethodsChanged]);

  // A backup that matches what the server already has (saved just before the tab closed) is not worth offering.
  useEffect(() => {
    if (!restoreOffer || !saved) return;
    const sameFields = (Object.keys(restoreOffer.changes) as Array<keyof DraftFields>).every(
      (field) => JSON.stringify(restoreOffer.changes[field]) === JSON.stringify(saved.fields[field]),
    );
    const samePayments =
      !restoreOffer.paymentMethods ||
      paymentMethodsKey(restoreOffer.paymentMethods.map((pm) => ({ ...pm, key: 0, qrFile: null }))) === saved.paymentMethods;
    if (sameFields && samePayments) {
      if (event) clearBackup(event.id);
      setRestoreOffer(null);
    }
  }, [restoreOffer, saved, event]);

  function restoreBackup() {
    if (!restoreOffer) return;
    // Re-apply only the fields that were changed, on top of the latest saved version.
    // Fields edited since this page opened win over the older backup.
    const editedNow = new Set<string>(changedFields);
    const restorable = Object.fromEntries(
      Object.entries(restoreOffer.changes).filter(([field]) => !editedNow.has(field)),
    ) as Partial<DraftFields>;
    setDraft((d) => ({ ...d, ...restorable }));
    if (restoreOffer.paymentMethods && !paymentMethodsChanged) {
      setPaymentMethods(restoreOffer.paymentMethods.map((pm) => ({ ...pm, key: nextPMKey.current++, qrFile: null })));
    }
    setRestoreOffer(null);
    toast.success('Your unsaved changes are back. Save to keep them.');
  }

  function discardBackup() {
    if (event) clearBackup(event.id);
    setRestoreOffer(null);
  }

  // Closing the tab or reloading: browsers only allow their own generic prompt.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  // Links inside the admin (sidebar, breadcrumbs) ask first when there are unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const intercept = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTarget(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, [isDirty]);

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
        return apiTierToLocal(event.isFree ? { ...t, price: 0 } : t, key);
      }),
    );
  }, [event?.isFree, event?.tiers]);

  const update = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // ─── Mutations ────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/admin/events/${id}`, data),
    onSuccess: (_, data) => {
      // Keep the saved schedule in sync so later edits validate against what the server now holds.
      if (typeof data.startsAt === 'string') {
        setDraft((d) => ({
          ...d,
          savedStartsAt: data.startsAt as string,
          savedEndsAt: typeof data.endsAt === 'string' ? data.endsAt : null,
        }));
      }
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
  });

  const feeMutation = useMutation({
    mutationFn: (fee: number) => api.put(`/admin/events/${id}`, { platformFee: fee }),
    onSuccess: () => {
      toast.success('Service fee updated.');
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    },
    onError: () => toast.error('Could not update service fee. Please try again.'),
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => api.put(`/admin/events/${id}`, { status: newStatus }),
    onSuccess: (_, newStatus) => {
      const labels: Record<string, string> = {
        draft: 'Draft',
        on_sale: 'On Sale',
        sold_out: 'Sold Out',
        cancelled: 'Cancelled',
      };
      toast.success(`Status changed to “${labels[newStatus] ?? newStatus}”.`);
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
    onError: (error) => {
      if (event) setStatus(event.status);
      toast.error(apiErrorMessage(error, 'Status could not be updated. Please try again.'));
    },
  });

  const { data: workspaceSummary } = useQuery({
    queryKey: ['workspace-summary', id],
    queryFn: () =>
      api
        .get<{ data: WorkspaceSummary | null }>(`/admin/events/${id}/workspace`)
        .then((r) => r.data.data),
    enabled: !!id,
    staleTime: 30_000,
  });

  const addTierMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post(`/admin/events/${id}/tiers`, data),
    onSuccess: () => {
      toast.success('Ticket tier added.');
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    },
    onError: () => toast.error('Could not add the ticket tier. Please try again.'),
  });

  const updateTierMutation = useMutation({
    mutationFn: ({ tierId, data }: { tierId: string; data: Record<string, unknown> }) =>
      api.put(`/admin/tiers/${tierId}`, data),
    onSuccess: () => {
      toast.success('Ticket tier updated.');
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    },
    onError: () => toast.error('Tier changes could not be saved. Please try again.'),
  });

  const deleteTierMutation = useMutation({
    mutationFn: (tierId: string) => api.delete(`/admin/tiers/${tierId}`),
    onSuccess: () => {
      toast.success('Ticket tier removed.');
      queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    },
    onError: () => toast.error('Cannot delete a tier that has sold tickets.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/events/${id}`),
    onSuccess: () => {
      toast.success('Event deleted.');
      clearBackup(id);
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      router.push('/admin');
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Event could not be deleted. Please try again.')),
  });

  // ─── Tier handlers (wired to mutations) ───────────────────────────────────
  function handleAddTier(t: LocalTier) {
    addTierMutation.mutate({
      name: t.name.trim(),
      description: t.description.trim() || undefined,
      price: Math.round(parseFloat(t.price)),
      totalQuantity: parseInt(t.totalQuantity, 10),
      maxPerOrder: parseInt(t.maxPerOrder, 10),
      isVisible: t.isVisible,
      sortOrder: tiers.length,
      inclusions: t.inclusions.map((item, idx) => ({
        label: item.label.trim(),
        stubEnabled: item.stubEnabled,
        sortOrder: idx,
      })),
    });
  }
  function handleEditTier(t: LocalTier) {
    if (!t.serverId) return;
    updateTierMutation.mutate({
      tierId: t.serverId,
      data: {
        name: t.name.trim(),
        description: t.description.trim() || null,
        price: parseFloat(t.price),
        totalQuantity: parseInt(t.totalQuantity, 10),
        maxPerOrder: parseInt(t.maxPerOrder, 10),
        isVisible: t.isVisible,
        inclusions: t.inclusions.map((item, idx) => ({
          label: item.label.trim(),
          stubEnabled: item.stubEnabled,
          sortOrder: idx,
        })),
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
      toast.error('Tier order could not be saved. Please try again.');
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
  /** Saves every event field. Returns whether the server accepted it. */
  async function save(options: { publish?: boolean } = {}): Promise<boolean> {
    const savedDraft = draft;
    const startsAtISO = combineDatetime(draft.startDate, draft.startTime);
    const endsAtISO = combineDatetime(draft.endDate, draft.endTime);

    try {
      // Upload any newly-attached QR images before sending the event payload.
      const resolvedPMs = await Promise.all(
        paymentMethods.map(async (pm) => {
          if (!pm.qrFile) return pm;
          const fd = new FormData();
          fd.append('image', pm.qrFile);
          const res = await api.post<{ data: { url: string } }>('/upload/payment-qr', fd);
          return { ...pm, qrImageUrl: res.data.data.url, qrPreview: res.data.data.url, qrFile: null };
        }),
      );

      const payload: Record<string, unknown> = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        category: draft.category,
        eventType: draft.eventType,
        isOnline: draft.isOnline,
        runningConfig: draft.eventType === 'running' ? draft.runningConfig : undefined,
        venue: draft.venue.trim(),
        address: draft.address.trim() || null,
        city: draft.city.trim(),
        latitude: draft.latitude.trim() ? parseFloat(draft.latitude) : null,
        longitude: draft.longitude.trim() ? parseFloat(draft.longitude) : null,
        startsAt: startsAtISO,
        endsAt: endsAtISO ?? null,
        maxCapacity: draft.maxCapacity.trim() === '' ? null : parseInt(draft.maxCapacity, 10),
        isFree: draft.isFree,
        platformFee: draft.isFree ? 0 : Number(draft.platformFee || 50),
        // Status changes go through the status control; a normal save never resends it,
        // so events that auto-completed stay editable.
        ...(options.publish ? { status: 'on_sale' } : {}),
        speakerName: draft.speakerName.trim() || null,
        imageUrl: draft.imageUrl.trim() || null,
        allowManualPayment: resolvedPMs.length > 0,
        onsiteRegistrationEnabled,
        paymentMethods: resolvedPMs.length > 0
          ? resolvedPMs.map((pm) => ({
              type: pm.type,
              name: pm.name.trim() || undefined,
              accountName: pm.accountName.trim() || undefined,
              accountNumber: pm.accountNumber.trim() || undefined,
              qrImageUrl: pm.qrImageUrl || undefined,
            }))
          : null,
        agenda: draft.agenda.length > 0
          ? draft.agenda.map((a) => ({
              ...(a.id ? { id: a.id } : {}),
              time: a.time.trim(),
              title: a.title.trim(),
              ...(a.description?.trim() ? { description: a.description.trim() } : {}),
              ...(a.isSubEvent ? { isSubEvent: true } : {}),
            }))
          : null,
        sponsors:
          draft.sponsors.length > 0
            ? draft.sponsors.map((s) => ({
                name: s.name,
                ...(s.logoUrl && { logoUrl: s.logoUrl }),
                ...(s.tier && { tier: s.tier }),
                ...(s.websiteUrl?.trim() && { websiteUrl: s.websiteUrl.trim() }),
                ...(s.description?.trim() && { description: s.description.trim() }),
                isVisible: s.isVisible,
              }))
            : null,
        faqs: draft.faqs.length > 0 ? draft.faqs : null,
        tagline: draft.tagline.trim() || null,
        customSections:
          draft.customSections.length > 0
            ? draft.customSections.map((section) => ({
                title: section.title.trim(),
                description: section.description.trim(),
                ...(section.imageUrl?.trim() && { imageUrl: section.imageUrl.trim() }),
                ...(section.imageUrl?.trim() && section.imageAlt?.trim() && { imageAlt: section.imageAlt.trim() }),
                isVisible: section.isVisible,
              }))
            : null,
      };
      await updateMutation.mutateAsync(payload);
      // Only fill in uploaded QR URLs; edits made while the request was in flight stay.
      const uploadedByKey = new Map(
        resolvedPMs
          .map((pm, i) => ({ pm, file: paymentMethods[i]?.qrFile ?? null }))
          .filter(({ file }) => file !== null)
          .map(({ pm, file }) => [pm.key, { url: pm.qrImageUrl, file }] as const),
      );
      setPaymentMethods((current) =>
        current.map((pm) => {
          const uploaded = uploadedByKey.get(pm.key);
          return uploaded && pm.qrFile === uploaded.file
            ? { ...pm, qrFile: null, qrImageUrl: uploaded.url, qrPreview: uploaded.url }
            : pm;
        }),
      );
      setSaved(savedStateOf(savedDraft, resolvedPMs));
      if (event) clearBackup(event.id);
      setRestoreOffer(null);
      setLastSavedAt(Date.now());
      setServerIssues([]);
      if (options.publish) setStatus('on_sale');
      toast.success(options.publish ? 'Event published.' : 'Changes saved.');
      return true;
    } catch (error) {
      if (options.publish) setServerIssues(apiErrorList(error));
      toast.error(
        apiErrorMessage(
          error,
          options.publish
            ? "This event couldn't be published. Your changes are kept on this device. Try again."
            : "Couldn't save. Your changes are kept on this device. Try again.",
        ),
      );
      return false;
    }
  }

  function handlePublishClick() {
    const steps = draft.isFree ? STEPS.filter((s) => s.id !== 'payment') : STEPS;
    if (publishIssues(steps, draft, tiers, paymentMethods).length > 0) {
      setPublishAttempt((n) => n + 1);
      return;
    }
    setPublishConfirmOpen(true);
  }

  async function saveAndLeave() {
    const target = leaveTarget;
    setLeaveTarget(null);
    if (target && (await save())) {
      if (event) clearBackup(event.id);
      router.push(target);
    }
  }

  function leaveWithoutSaving() {
    const target = leaveTarget;
    setLeaveTarget(null);
    if (event) clearBackup(event.id);
    setSaved(savedStateOf(draft, paymentMethods));
    if (target) router.push(target);
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
  const onsiteQrPdfUrl = event
    ? `${process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1'}/events/${event.slug}/onsite-registration/qr.pdf?eventId=${event.id}`
    : '';

  // ─── Top banner: status + cancel + delete ─────────────────────────────────
  const topBanner = event ? (
    <div className="space-y-3 mb-4">
      {restoreOffer && canManageEvent && (
        <div className="rounded-2xl border border-[#ddd6fe] bg-[#f5f3ff] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm text-[#4c1d95]">
          <div className="min-w-0">
            <p className="font-semibold">You have unsaved changes from {formatDateTime(restoreOffer.savedAt)}.</p>
            <p>
              They were kept on this device.
              {restoreOffer.baseUpdatedAt && event.updatedAt && restoreOffer.baseUpdatedAt !== event.updatedAt
                ? ' This event was saved since then; restoring re-applies only the fields you changed.'
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={restoreBackup} className="axon-pill bg-primary text-xs text-white hover:bg-primary-hover">
              Restore my changes
            </button>
            <button type="button" onClick={discardBackup} className="axon-pill border border-[#d3c8e8] text-xs text-[#4f416c] hover:border-primary hover:text-primary">
              Discard
            </button>
          </div>
        </div>
      )}
      {!canManageEvent && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"><span className="font-semibold">View-only event access.</span> Your role does not have permission to change event details, ticket configuration, publication status, or delete this event.</div>}
      {/* ── Status / Cancel / Delete row ──────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Status:</label>
        {!canManageEvent || event.status === 'completed' ? (
          <span className="px-3 py-1 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
            {event.status.replace('_', ' ')}{event.status === 'completed' && <span className="text-xs text-gray-400 ml-1">(auto)</span>}
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
      {canManageEvent && <div className="flex items-center gap-3">
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
              message: "This permanently removes the event and its ticket tiers. Events with registrations or orders can't be deleted; cancel them instead.",
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
      </div>}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">On-site registration QR</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Attendees scan this QR to self-register once, then future scans only record daily attendance.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={onsiteRegistrationEnabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                setOnsiteRegistrationEnabled(enabled);
                updateMutation.mutate(
                  { onsiteRegistrationEnabled: enabled },
                  {
                    onSuccess: () => toast.success(enabled ? 'On-site registration turned on.' : 'On-site registration turned off.'),
                    onError: (error) => {
                      setOnsiteRegistrationEnabled(!enabled);
                      toast.error(apiErrorMessage(error, 'On-site registration could not be changed. Please try again.'));
                    },
                  },
                );
              }}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              disabled={!canManageEvent}
            />
            Enabled
          </label>
        </div>
        {onsiteRegistrationEnabled && (
          <div className="flex flex-col gap-3 rounded-xl bg-gray-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">QR poster is ready</p>
              <p className="mt-1 text-xs text-gray-500">
                Download the PDF and print it for on-site registration.
              </p>
            </div>
            <a
              href={onsiteQrPdfUrl}
              className="min-h-10 rounded-lg bg-gray-900 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-gray-800"
            >
              Download QR
            </a>
          </div>
        )}
      </div>

      {/* ── Workspace readiness banner ───────────────────────────────────── */}
      {workspaceSummary ? (
        <div
          className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-4 ${
            workspaceSummary.readiness.hasCriticalBlockers
              ? 'border-red-200 bg-red-50/50'
              : workspaceSummary.readiness.score >= 80
              ? 'border-green-200 bg-green-50/40'
              : 'border-amber-200 bg-amber-50/40'
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">Event Readiness</p>
              {workspaceSummary.readiness.hasCriticalBlockers && (
                <span className="text-xs font-medium bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">
                  {workspaceSummary.criticalBlockers.length} blocker{workspaceSummary.criticalBlockers.length !== 1 ? 's' : ''}
                </span>
              )}
              {workspaceSummary.readiness.overdueCount > 0 && <span className="rounded border border-red-200 bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">{workspaceSummary.readiness.overdueCount} overdue</span>}
              {workspaceSummary.readiness.dueTodayCount > 0 && <span className="rounded border border-orange-200 bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">{workspaceSummary.readiness.dueTodayCount} due today</span>}
              {workspaceSummary.readiness.dueSoonCount > 0 && <span className="rounded border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">{workspaceSummary.readiness.dueSoonCount} due soon</span>}
              {workspaceSummary.readiness.unownedCount > 0 && <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs font-medium text-gray-600">{workspaceSummary.readiness.unownedCount} unassigned</span>}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex-1 max-w-[120px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    workspaceSummary.readiness.score >= 80 ? 'bg-green-500' : workspaceSummary.readiness.score >= 50 ? 'bg-amber-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${workspaceSummary.readiness.score}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 tabular-nums">
                {workspaceSummary.readiness.done}/{workspaceSummary.readiness.scorableTotal} done
              </span>
            </div>
          </div>
          <Link
            href={`/admin/events/${id}/workspace`}
            className="shrink-0 text-sm font-medium text-violet-700 hover:text-violet-900 transition-colors"
          >
            Open Workspace →
          </Link>
        </div>
      ) : workspaceSummary === null ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-700">Event Workspace</p>
            <p className="text-xs text-gray-500 mt-0.5">Enable readiness tracking and operational checklists for this event.</p>
          </div>
          <Link
            href={`/admin/events/${id}/workspace`}
            className="shrink-0 text-sm font-medium text-violet-700 hover:text-violet-900 transition-colors"
          >
            Enable Workspace →
          </Link>
        </div>
      ) : null}
    </div>
  ) : null;

  // ─── Inline Edit-mode Payment step removed: the wizard now uses the
  // multi-method PaymentStep directly (see render switch below).

  if (isLoading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <ScreenSkeleton rows={6} />
      </main>
    );
  }

  if (!event) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <ErrorState
          title={isError ? 'Unable to load event' : 'Event not found'}
          message={isError ? 'The event editor could not load. Check your connection and try again.' : 'This event may have been removed or the link is incorrect.'}
          action={isError ? <button type="button" onClick={() => refetch()} className="axon-pill bg-primary text-xs text-white">Try again</button> : <Link href="/admin/events" className="axon-pill bg-primary text-xs text-white">Back to events</Link>}
        />
      </main>
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
      <ConfirmModal
        open={leaveTarget !== null}
        title="Save your changes?"
        message="You have unsaved changes to this event. They'll be lost if you leave without saving."
        confirmLabel="Save and leave"
        secondaryLabel="Leave without saving"
        onSecondary={leaveWithoutSaving}
        cancelLabel="Stay on this page"
        variant="primary"
        loading={updateMutation.isPending}
        onConfirm={saveAndLeave}
        onCancel={() => setLeaveTarget(null)}
      />
      <ConfirmModal
        open={publishConfirmOpen}
        title="Publish this event?"
        message="Attendees can find it and register as soon as it's published."
        confirmLabel="Publish event"
        cancelLabel="Keep as draft"
        variant="primary"
        loading={updateMutation.isPending}
        onConfirm={async () => {
          const published = await save({ publish: true });
          setPublishConfirmOpen(false);
          if (!published) setPublishAttempt((n) => n + 1);
        }}
        onCancel={() => setPublishConfirmOpen(false)}
      />
      <WizardShell
        title={canManageEvent ? 'Edit Event' : 'Event Details'}
        draft={draft}
        tiers={tiers}
        paymentMethods={paymentMethods}
        submitLabel={updateMutation.isPending ? 'Saving…' : 'Save changes'}
        submitting={updateMutation.isPending}
        onStepChange={(next) => {
          if (next !== 'review') setPublishAttempt(0);
        }}
        onSubmit={() => void save()}
        onCancel={() => (isDirty ? setLeaveTarget('/admin') : router.push('/admin'))}
        statusIndicator={
          canManageEvent ? (
            <span aria-live="polite" className="text-xs">
              {isDirty ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-800">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5l4 4L8 20H4v-4L16.5 3.5z" />
                  </svg>
                  Unsaved changes
                </span>
              ) : lastSavedAt ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 font-semibold text-green-800">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  All changes saved
                </span>
              ) : null}
            </span>
          ) : undefined
        }
        topBanner={topBanner}
        readOnly={!canManageEvent}
        submitOnEveryStep
        requireCompleteToSubmit={status !== 'draft'}
        editedSteps={editedSteps}
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
            case 'details': return <ConferenceStep draft={draft} update={update} />;
            case 'payment':
              return (<>
                <PaymentStep
                  paymentMethods={paymentMethods}
                  onAdd={addPM}
                  onEdit={editPM}
                  onRemove={removePM}
                  onReorder={setPaymentMethods}
                  platformFee={event.platformFee != null ? Number(event.platformFee) : 50}
                  onSaveFee={(fee) => feeMutation.mutate(fee)}
                  feeSaving={feeMutation.isPending}
                  isAdmin={isAdmin}
                  isFree={draft.isFree}
                />
                <ReferralCodesPanel eventId={id} tiers={tiers} />
              </>);
            case 'review':
              return (
                <ReviewStep
                  draft={draft}
                  tiers={tiers}
                  paymentMethods={paymentMethods}
                  onJump={jump}
                  heading={status === 'draft' ? 'Ready to publish?' : 'Still needed:'}
                  publishBlocked={publishAttempt > 0}
                  key={publishAttempt}
                  serverIssues={serverIssues}
                  action={
                    canManageEvent && status === 'draft' ? (
                      <button
                        type="button"
                        onClick={handlePublishClick}
                        className="axon-pill bg-primary text-xs text-white hover:bg-primary-hover"
                      >
                        Publish event
                      </button>
                    ) : undefined
                  }
                />
              );
          }
        }}
      />

    </>
  );
}
