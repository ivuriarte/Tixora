'use client';

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  BarChart3,
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Edit3,
  Loader2,
  PackageCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/components/Button';
import ConfirmModal from '@/components/ConfirmModal';
import { EmptyState, ErrorState, ScreenSkeleton } from '@/components/ScreenState';
import api from '@/lib/api';

type View = 'catalog' | 'inventory' | 'fulfillment' | 'reports';
type InclusionStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

interface EventTier {
  id: string;
  name: string;
}

interface EventContext {
  id: string;
  title: string;
  tiers: EventTier[];
  optionalInclusionsEnabled?: boolean;
  access?: { canManageEvent?: boolean; capabilities?: string[] };
}

interface InclusionVariant {
  id: string;
  name: string;
  sku: string | null;
  price: number | string;
  totalStock: number;
  reservedStock: number;
  soldStock: number;
  fulfilledStock?: number;
  isActive: boolean;
}

interface EventInclusion {
  id: string;
  name: string;
  description: string | null;
  status: InclusionStatus | Lowercase<InclusionStatus>;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  fulfillmentInstructions: string | null;
  fulfillmentMethod?: 'pickup' | 'delivery' | 'digital' | 'manual' | null;
  eligibleTierIds?: string[];
  tierEligibility?: Array<{ tierId: string; maxQuantityPerRegistration?: number | null }>;
  eligibleTiers?: Array<{
    tierId?: string;
    ticketTierId?: string;
    maxQuantityPerRegistration?: number | null;
    tier?: EventTier;
  }>;
  variants: InclusionVariant[];
}

interface InclusionFulfillment {
  id: string;
  registrationId?: string;
  lineItemId?: string;
  customerName?: string | null;
  attendeeName?: string | null;
  inclusionName: string;
  variantName: string;
  quantity: number;
  status: 'PENDING' | 'FULFILLED' | 'REVERSED' | 'CANCELLED' | string;
  fulfilledAt?: string | null;
  fulfilledBy?: { name?: string | null } | string | null;
}

interface InclusionReportRow {
  inclusionId?: string;
  inclusionName: string;
  variantName?: string | null;
  unitsSold: number;
  revenue: number | string;
  totalStock?: number;
  availableStock?: number;
  reservedStock?: number;
  fulfilledUnits?: number;
  unfulfilledUnits?: number;
  unitsFulfilled?: number;
  unitsUnfulfilled?: number;
  variantId?: string;
}

interface InclusionReport {
  summary: {
    inclusionRevenue: number | string;
    unitsSold: number;
    attachmentRate: number;
    unitsFulfilled: number;
    unitsUnfulfilled: number;
  };
  byInclusion?: InclusionReportRow[];
  byVariant?: InclusionReportRow[];
  inventory?: InclusionReportRow[];
}

interface InclusionFormState {
  name: string;
  description: string;
  status: InclusionStatus;
  saleStartsAt: string;
  saleEndsAt: string;
  fulfillmentInstructions: string;
  fulfillmentMethod: 'pickup' | 'delivery' | 'digital' | 'manual';
  eligibleTierIds: string[];
  tierLimits: Record<string, string>;
}

interface VariantFormState {
  name: string;
  sku: string;
  price: string;
  totalStock: string;
  isActive: boolean;
}

const EMPTY_INCLUSION: InclusionFormState = {
  name: '',
  description: '',
  status: 'DRAFT',
  saleStartsAt: '',
  saleEndsAt: '',
  fulfillmentInstructions: '',
  fulfillmentMethod: 'pickup',
  eligibleTierIds: [],
  tierLimits: {},
};

const EMPTY_VARIANT: VariantFormState = {
  name: '',
  sku: '',
  price: '',
  totalStock: '',
  isActive: true,
};

const VIEW_OPTIONS: Array<{ id: View; label: string; description: string; icon: typeof Box }> = [
  { id: 'catalog', label: 'Catalog', description: 'Products and eligibility', icon: Sparkles },
  { id: 'inventory', label: 'Inventory', description: 'Stock health and adjustments', icon: Box },
  {
    id: 'fulfillment',
    label: 'Fulfillment',
    description: 'Separate from admission check-in',
    icon: PackageCheck,
  },
  { id: 'reports', label: 'Reports', description: 'Revenue and attachment', icon: BarChart3 },
];

function money(value: number | string | null | undefined): string {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    Number.isFinite(number) ? number : 0,
  );
}

function dateTime(value: string | null | undefined): string {
  if (!value) return 'No schedule';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function inputDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function statusOf(value: EventInclusion['status']): InclusionStatus {
  return value.toUpperCase() as InclusionStatus;
}

function availableStock(variant: InclusionVariant): number {
  return Math.max(
    0,
    Number(variant.totalStock) - Number(variant.reservedStock) - Number(variant.soldStock),
  );
}

function eligibleIds(inclusion: EventInclusion): string[] {
  if (inclusion.eligibleTierIds) return inclusion.eligibleTierIds;
  return (inclusion.eligibleTiers ?? [])
    .map((entry) => entry.tierId ?? entry.ticketTierId ?? entry.tier?.id)
    .filter((id): id is string => Boolean(id));
}

function tierLimits(inclusion: EventInclusion): Record<string, string> {
  const entries =
    inclusion.tierEligibility ??
    (inclusion.eligibleTiers ?? []).map((entry) => ({
      tierId: entry.tierId ?? entry.ticketTierId ?? entry.tier?.id ?? '',
      maxQuantityPerRegistration: entry.maxQuantityPerRegistration,
    }));
  return Object.fromEntries(
    entries
      .filter((entry) => Boolean(entry.tierId) && entry.maxQuantityPerRegistration != null)
      .map((entry) => [entry.tierId, String(entry.maxQuantityPerRegistration)]),
  );
}

function unwrapCollection<T>(payload: T[] | { data?: T[]; items?: T[] } | undefined): T[] {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? payload?.items ?? [];
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-gray-600">
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
    </span>
  );
}

function StatusPill({ status }: { status: EventInclusion['status'] }) {
  const normalized = statusOf(status);
  const classes =
    normalized === 'ACTIVE'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : normalized === 'ARCHIVED'
        ? 'border-gray-200 bg-gray-100 text-gray-600'
        : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${classes}`}
    >
      {normalized}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Box;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div
        className="bg-primary-50 absolute -right-4 -top-4 h-20 w-20 rounded-full"
        aria-hidden="true"
      />
      <Icon className="text-primary relative mb-5 h-5 w-5" aria-hidden="true" />
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">{label}</p>
      <p className="text-ink mt-1 text-2xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

export default function OptionalInclusionsPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('catalog');
  const [editingInclusion, setEditingInclusion] = useState<EventInclusion | null | 'new'>(null);
  const [inclusionForm, setInclusionForm] = useState<InclusionFormState>(EMPTY_INCLUSION);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingVariant, setEditingVariant] = useState<{
    inclusionId: string;
    variant: InclusionVariant | null;
  } | null>(null);
  const [variantForm, setVariantForm] = useState<VariantFormState>(EMPTY_VARIANT);
  const [stockTarget, setStockTarget] = useState<{
    inclusion: EventInclusion;
    variant: InclusionVariant;
  } | null>(null);
  const [stockQuantity, setStockQuantity] = useState('');
  const [stockReason, setStockReason] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<EventInclusion | null>(null);
  const [fulfillmentSearch, setFulfillmentSearch] = useState('');
  const [fulfillmentStatus, setFulfillmentStatus] = useState('PENDING');
  const [reversalTarget, setReversalTarget] = useState<InclusionFulfillment | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  const eventQuery = useQuery<EventContext>({
    queryKey: ['admin-event', eventId],
    queryFn: () =>
      api
        .get<{ data: EventContext }>(`/admin/events/${eventId}`)
        .then((response) => response.data.data),
    enabled: Boolean(eventId),
  });
  const capabilities = eventQuery.data?.access?.capabilities;
  const legacyCanManage = eventQuery.data?.access?.canManageEvent !== false;
  const canCatalog = capabilities ? capabilities.includes('inclusions.manage') : legacyCanManage;
  const canInventory = capabilities
    ? capabilities.includes('inclusions.inventory.manage')
    : legacyCanManage;
  const canFulfill = capabilities ? capabilities.includes('inclusions.fulfill') : legacyCanManage;
  const canReport = capabilities
    ? capabilities.includes('inclusions.finance.read')
    : legacyCanManage;
  const salesEnabled = eventQuery.data?.optionalInclusionsEnabled === true;

  const inclusionsQuery = useQuery<EventInclusion[]>({
    queryKey: ['admin-event-inclusions', eventId],
    queryFn: () =>
      api
        .get<{ data: EventInclusion[] | { data?: EventInclusion[]; items?: EventInclusion[] } }>(
          `/admin/events/${eventId}/optional-inclusions`,
        )
        .then((response) => unwrapCollection(response.data.data)),
    enabled: Boolean(eventId),
  });

  const fulfillmentsQuery = useQuery<InclusionFulfillment[]>({
    queryKey: ['admin-event-inclusion-fulfillments', eventId, fulfillmentStatus],
    queryFn: () =>
      api
        .get<{
          data:
            | InclusionFulfillment[]
            | { data?: InclusionFulfillment[]; items?: InclusionFulfillment[] };
        }>(`/admin/events/${eventId}/optional-inclusions/fulfillments`, {
          params:
            fulfillmentStatus === 'ALL'
              ? { page: 1, limit: 100 }
              : { status: fulfillmentStatus.toLowerCase(), page: 1, limit: 100 },
        })
        .then((response) => unwrapCollection(response.data.data)),
    enabled: Boolean(eventId) && view === 'fulfillment',
  });

  const reportQuery = useQuery<InclusionReport>({
    queryKey: ['admin-event-inclusion-report', eventId],
    queryFn: () =>
      api
        .get<{ data: InclusionReport }>(`/admin/events/${eventId}/optional-inclusions/report`)
        .then((response) => response.data.data),
    enabled: Boolean(eventId) && view === 'reports' && canReport,
  });

  const refreshInclusions = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-event-inclusions', eventId] });
  const refreshFulfillment = () => {
    void queryClient.invalidateQueries({
      queryKey: ['admin-event-inclusion-fulfillments', eventId],
    });
    void queryClient.invalidateQueries({ queryKey: ['admin-event-inclusion-report', eventId] });
  };

  const saveInclusion = useMutation({
    mutationFn: async () => {
      const payload = {
        name: inclusionForm.name.trim(),
        description: inclusionForm.description.trim() || null,
        status: inclusionForm.status.toLowerCase(),
        saleStartsAt: inclusionForm.saleStartsAt
          ? new Date(inclusionForm.saleStartsAt).toISOString()
          : null,
        saleEndsAt: inclusionForm.saleEndsAt
          ? new Date(inclusionForm.saleEndsAt).toISOString()
          : null,
        fulfillmentInstructions: inclusionForm.fulfillmentInstructions.trim() || null,
        fulfillmentMethod: inclusionForm.fulfillmentMethod,
        tierEligibility: inclusionForm.eligibleTierIds.map((tierId) => ({
          tierId,
          ...(inclusionForm.tierLimits[tierId]
            ? { maxQuantityPerRegistration: Number(inclusionForm.tierLimits[tierId]) }
            : {}),
        })),
      };
      if (editingInclusion === 'new')
        return api.post(`/admin/events/${eventId}/optional-inclusions`, payload);
      if (!editingInclusion) throw new Error('No inclusion selected');
      return api.patch(
        `/admin/events/${eventId}/optional-inclusions/${editingInclusion.id}`,
        payload,
      );
    },
    onSuccess: async () => {
      await refreshInclusions();
      toast.success(
        editingInclusion === 'new' ? 'Optional inclusion created.' : 'Optional inclusion updated.',
      );
      setEditingInclusion(null);
    },
    onError: () =>
      toast.error('The optional inclusion could not be saved. Review the details and try again.'),
  });

  const saveVariant = useMutation({
    mutationFn: async () => {
      if (!editingVariant) throw new Error('No variant selected');
      const payload = {
        name: variantForm.name.trim(),
        sku: variantForm.sku.trim() || null,
        price: Number(variantForm.price),
        totalStock: Number(variantForm.totalStock),
        isActive: variantForm.isActive,
      };
      const base = `/admin/events/${eventId}/optional-inclusions/${editingVariant.inclusionId}/variants`;
      if (editingVariant.variant) {
        const updatePayload = {
          name: payload.name,
          sku: payload.sku,
          price: payload.price,
          isActive: payload.isActive,
        };
        return api.patch(`${base}/${editingVariant.variant.id}`, updatePayload);
      }
      return api.post(base, payload);
    },
    onSuccess: async () => {
      await refreshInclusions();
      toast.success(editingVariant?.variant ? 'Variant updated.' : 'Variant added.');
      setEditingVariant(null);
    },
    onError: () => toast.error('The variant could not be saved.'),
  });

  const adjustStock = useMutation({
    mutationFn: async () => {
      if (!stockTarget) throw new Error('No variant selected');
      return api.post(
        `/admin/events/${eventId}/optional-inclusions/${stockTarget.inclusion.id}/variants/${stockTarget.variant.id}/stock-adjustments`,
        { quantityDelta: Number(stockQuantity), reason: stockReason.trim() },
      );
    },
    onSuccess: async () => {
      await refreshInclusions();
      toast.success('Stock adjustment recorded.');
      setStockTarget(null);
      setStockQuantity('');
      setStockReason('');
    },
    onError: () =>
      toast.error('Stock could not be adjusted. Check the quantity and available inventory.'),
  });

  const archiveInclusion = useMutation({
    mutationFn: () => {
      if (!archiveTarget) throw new Error('No inclusion selected');
      return api.patch(`/admin/events/${eventId}/optional-inclusions/${archiveTarget.id}`, {
        status: 'archived',
      });
    },
    onSuccess: async () => {
      await refreshInclusions();
      toast.success('Optional inclusion archived. Existing purchases were preserved.');
      setArchiveTarget(null);
    },
    onError: () => toast.error('The optional inclusion could not be archived.'),
  });

  const fulfillItem = useMutation({
    mutationFn: (fulfillment: InclusionFulfillment) =>
      api.post(
        `/admin/events/${eventId}/optional-inclusions/fulfillments/${fulfillment.lineItemId ?? fulfillment.id}`,
        { quantity: fulfillment.quantity },
      ),
    onSuccess: () => {
      refreshFulfillment();
      toast.success('Inclusion fulfilled. Admission check-in was not changed.');
    },
    onError: () => toast.error('This inclusion could not be fulfilled.'),
  });

  const reverseFulfillment = useMutation({
    mutationFn: () => {
      if (!reversalTarget) throw new Error('No fulfillment selected');
      return api.post(
        `/admin/events/${eventId}/optional-inclusions/fulfillments/${reversalTarget.id}/reverse`,
        { reason: reversalReason.trim() },
      );
    },
    onSuccess: () => {
      refreshFulfillment();
      toast.success('Fulfillment reversed and recorded in the audit trail.');
      setReversalTarget(null);
      setReversalReason('');
    },
    onError: () => toast.error('The fulfillment could not be reversed.'),
  });

  const setSalesEnabled = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch(`/admin/events/${eventId}/optional-inclusions/settings`, { enabled }),
    onSuccess: async (_response, enabled) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-event', eventId] });
      toast.success(
        enabled
          ? 'Customer add-on sales enabled.'
          : 'New customer add-on sales paused. Existing fulfillment remains available.',
      );
    },
    onError: () => toast.error('The customer add-on sales setting could not be changed.'),
  });

  const inclusions = inclusionsQuery.data ?? [];
  const activeInclusions = inclusions.filter((item) => statusOf(item.status) === 'ACTIVE');
  const allVariants = inclusions.flatMap((inclusion) =>
    inclusion.variants.map((variant) => ({ inclusion, variant })),
  );
  const totalAvailable = allVariants.reduce((sum, { variant }) => sum + availableStock(variant), 0);
  const totalReserved = allVariants.reduce(
    (sum, { variant }) => sum + Number(variant.reservedStock),
    0,
  );
  const lowStock = allVariants.filter(
    ({ variant }) =>
      variant.isActive &&
      availableStock(variant) <= Math.max(3, Math.ceil(variant.totalStock * 0.1)),
  );

  const visibleFulfillments = useMemo(() => {
    const search = fulfillmentSearch.trim().toLowerCase();
    if (!search) return fulfillmentsQuery.data ?? [];
    return (fulfillmentsQuery.data ?? []).filter((item) =>
      [
        item.customerName,
        item.attendeeName,
        item.inclusionName,
        item.variantName,
        item.registrationId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [fulfillmentSearch, fulfillmentsQuery.data]);

  function openNewInclusion() {
    setInclusionForm({ ...EMPTY_INCLUSION });
    setEditingInclusion('new');
  }

  function openEditInclusion(inclusion: EventInclusion) {
    setInclusionForm({
      name: inclusion.name,
      description: inclusion.description ?? '',
      status: statusOf(inclusion.status),
      saleStartsAt: inputDateTime(inclusion.saleStartsAt),
      saleEndsAt: inputDateTime(inclusion.saleEndsAt),
      fulfillmentInstructions: inclusion.fulfillmentInstructions ?? '',
      fulfillmentMethod: inclusion.fulfillmentMethod ?? 'pickup',
      eligibleTierIds: eligibleIds(inclusion),
      tierLimits: tierLimits(inclusion),
    });
    setEditingInclusion(inclusion);
  }

  function openVariant(inclusionId: string, variant: InclusionVariant | null) {
    setVariantForm(
      variant
        ? {
            name: variant.name,
            sku: variant.sku ?? '',
            price: String(variant.price),
            totalStock: String(variant.totalStock),
            isActive: variant.isActive,
          }
        : { ...EMPTY_VARIANT },
    );
    setEditingVariant({ inclusionId, variant });
  }

  const inclusionFormValid =
    inclusionForm.name.trim().length >= 2 &&
    (!inclusionForm.saleStartsAt ||
      !inclusionForm.saleEndsAt ||
      inclusionForm.saleEndsAt > inclusionForm.saleStartsAt) &&
    inclusionForm.eligibleTierIds.every((tierId) => {
      const limit = inclusionForm.tierLimits[tierId];
      return (
        !limit || (Number.isInteger(Number(limit)) && Number(limit) >= 1 && Number(limit) <= 100)
      );
    });
  const variantFormValid =
    variantForm.name.trim().length >= 1 &&
    Number(variantForm.price) >= 0 &&
    Number.isInteger(Number(variantForm.totalStock)) &&
    Number(variantForm.totalStock) >= 0;

  return (
    <main className="min-h-screen bg-[#f8f5ff] pb-20">
      <section className="bg-ink relative overflow-hidden border-b border-[#352050] text-white">
        <div
          className="absolute inset-0 opacity-30"
          aria-hidden="true"
          style={{
            backgroundImage:
              'radial-gradient(circle at 80% 20%, #7c3aed 0, transparent 35%), linear-gradient(115deg, transparent 0 60%, rgba(168,85,247,.25) 60% 61%, transparent 61%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="text-primary-200 mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em]">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Event commerce
              </div>
              <h1 className="axon-page-title text-3xl text-white sm:text-4xl">
                Optional Inclusions
              </h1>
              <p className="text-primary-100 mt-3 max-w-2xl text-sm leading-6 sm:text-base">
                Sell and fulfill add-ons without changing admission capacity or ticket QR behavior.
                Included benefits remain managed with each ticket tier.
              </p>
              {eventQuery.data?.title && (
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/55">
                  {eventQuery.data.title}
                </p>
              )}
            </div>
            {canCatalog && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={setSalesEnabled.isPending}
                  onClick={() => setSalesEnabled.mutate(!salesEnabled)}
                  className={`min-h-11 rounded-full border px-4 text-xs font-bold uppercase tracking-[0.06em] transition-colors disabled:opacity-50 ${salesEnabled ? 'border-amber-300/60 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20' : 'border-emerald-300/60 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20'}`}
                >
                  {salesEnabled ? 'Pause new add-on sales' : 'Enable customer add-ons'}
                </button>
                <Button
                  onClick={openNewInclusion}
                  className="shrink-0 border border-white/20 shadow-xl shadow-black/20"
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New inclusion
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <nav
          className="-mt-px grid grid-cols-2 border-x border-b border-gray-200 bg-white shadow-sm md:grid-cols-4"
          aria-label="Optional inclusion workspace"
        >
          {VIEW_OPTIONS.filter((option) => option.id !== 'reports' || canReport).map((option) => {
            const Icon = option.icon;
            const active = option.id === view;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                aria-current={active ? 'page' : undefined}
                className={`focus-visible:ring-primary group min-h-[76px] border-b-2 px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${active ? 'border-primary bg-primary-50/70' : 'border-transparent hover:bg-gray-50'}`}
              >
                <span className="text-ink flex items-center gap-2 text-sm font-bold">
                  <Icon
                    className={`h-4 w-4 ${active ? 'text-primary' : 'text-gray-400'}`}
                    aria-hidden="true"
                  />
                  {option.label}
                </span>
                <span className="mt-1 hidden text-xs text-gray-500 sm:block">
                  {option.description}
                </span>
              </button>
            );
          })}
        </nav>

        {(eventQuery.isLoading || inclusionsQuery.isLoading) && <ScreenSkeleton rows={4} />}
        {(eventQuery.isError || inclusionsQuery.isError) && (
          <div className="py-10">
            <ErrorState
              title="Optional inclusions are unavailable"
              message="We could not load the event catalog. No changes were made."
              action={
                <button
                  type="button"
                  onClick={() => {
                    void eventQuery.refetch();
                    void inclusionsQuery.refetch();
                  }}
                  className="axon-pill bg-primary text-xs text-white"
                >
                  Try again
                </button>
              }
            />
          </div>
        )}

        {!eventQuery.isLoading &&
          !inclusionsQuery.isLoading &&
          !eventQuery.isError &&
          !inclusionsQuery.isError && (
            <div className="py-8">
              {view === 'catalog' && (
                <section aria-labelledby="catalog-heading">
                  <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div>
                      <p className="text-primary text-xs font-bold uppercase tracking-[0.12em]">
                        Product setup
                      </p>
                      <h2 id="catalog-heading" className="axon-section-title mt-1 text-2xl">
                        Inclusion catalog
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Create the product first, then add purchasable variants with their own price
                        and inventory.
                      </p>
                    </div>
                    <div className="flex gap-2 text-xs font-semibold text-gray-600">
                      <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                        {activeInclusions.length} active
                      </span>
                      <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                        {allVariants.length} variants
                      </span>
                    </div>
                  </div>

                  {inclusions.length === 0 ? (
                    <EmptyState
                      title="Build your first optional inclusion"
                      message="Offer items such as shirts, meals, parking, or workshops. These are sold separately and never treated as admission benefits."
                      action={
                        canCatalog ? (
                          <Button onClick={openNewInclusion}>
                            <Plus className="mr-2 h-4 w-4" />
                            Create inclusion
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <div className="space-y-4">
                      {inclusions.map((inclusion) => {
                        const isExpanded = expandedId === inclusion.id;
                        const ids = eligibleIds(inclusion);
                        const eligibleNames =
                          eventQuery.data?.tiers
                            .filter((tier) => ids.includes(tier.id))
                            .map((tier) => tier.name) ?? [];
                        return (
                          <article
                            key={inclusion.id}
                            className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                          >
                            <div className="p-5 sm:p-6">
                              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="axon-section-title text-xl">{inclusion.name}</h3>
                                    <StatusPill status={inclusion.status} />
                                  </div>
                                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                                    {inclusion.description || 'No customer-facing description yet.'}
                                  </p>
                                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Clock3 className="h-3.5 w-3.5" />
                                      {inclusion.saleStartsAt || inclusion.saleEndsAt
                                        ? `${dateTime(inclusion.saleStartsAt)} — ${dateTime(inclusion.saleEndsAt)}`
                                        : 'Available with event sales'}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                      <ShieldCheck className="h-3.5 w-3.5" />
                                      {eligibleNames.length
                                        ? eligibleNames.join(', ')
                                        : 'All ticket tiers'}
                                    </span>
                                  </div>
                                </div>
                                {canCatalog && (
                                  <div className="flex shrink-0 flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openEditInclusion(inclusion)}
                                      className="hover:border-primary hover:text-primary inline-flex min-h-10 items-center gap-2 rounded-full border border-gray-200 px-4 text-xs font-bold uppercase tracking-[0.06em] text-gray-700"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                      Edit
                                    </button>
                                    {statusOf(inclusion.status) !== 'ARCHIVED' && (
                                      <button
                                        type="button"
                                        onClick={() => setArchiveTarget(inclusion)}
                                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-gray-200 px-4 text-xs font-bold uppercase tracking-[0.06em] text-gray-700 hover:border-red-300 hover:text-red-600"
                                      >
                                        <Archive className="h-3.5 w-3.5" />
                                        Archive
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="border-t border-gray-100 bg-gray-50/70">
                              <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : inclusion.id)}
                                aria-expanded={isExpanded}
                                className="flex min-h-12 w-full items-center justify-between px-5 text-left text-sm font-bold text-gray-700 sm:px-6"
                              >
                                <span>
                                  {inclusion.variants.length} purchasable variant
                                  {inclusion.variants.length === 1 ? '' : 's'}
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </button>
                              {isExpanded && (
                                <div className="border-t border-gray-200 bg-white px-5 py-5 sm:px-6">
                                  <div className="mb-4 flex items-center justify-between gap-3">
                                    <p className="text-xs text-gray-500">
                                      Each variant has independent price and stock.
                                    </p>
                                    {canCatalog && (
                                      <button
                                        type="button"
                                        onClick={() => openVariant(inclusion.id, null)}
                                        className="bg-ink hover:bg-secondary inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-xs font-bold uppercase tracking-[0.06em] text-white"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                        Add variant
                                      </button>
                                    )}
                                  </div>
                                  {inclusion.variants.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-gray-300 px-5 py-8 text-center text-sm text-gray-500">
                                      No variants yet. Add at least one before activating this
                                      inclusion.
                                    </div>
                                  ) : (
                                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                                      <table className="w-full min-w-[680px] text-left text-sm">
                                        <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500">
                                          <tr>
                                            <th className="px-4 py-3">Variant</th>
                                            <th className="px-4 py-3">Price</th>
                                            <th className="px-4 py-3">Available</th>
                                            <th className="px-4 py-3">Reserved</th>
                                            <th className="px-4 py-3">Sold</th>
                                            <th className="px-4 py-3 text-right">Action</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                          {inclusion.variants.map((variant) => (
                                            <tr key={variant.id} className="text-gray-700">
                                              <td className="px-4 py-3">
                                                <p className="text-ink font-bold">{variant.name}</p>
                                                <p className="text-xs text-gray-500">
                                                  {variant.sku || 'No SKU'}
                                                  {!variant.isActive && ' · Inactive'}
                                                </p>
                                              </td>
                                              <td className="px-4 py-3 font-semibold">
                                                {money(variant.price)}
                                              </td>
                                              <td className="px-4 py-3 font-semibold">
                                                {availableStock(variant)}
                                              </td>
                                              <td className="px-4 py-3">{variant.reservedStock}</td>
                                              <td className="px-4 py-3">{variant.soldStock}</td>
                                              <td className="px-4 py-3 text-right">
                                                <button
                                                  type="button"
                                                  disabled={!canCatalog}
                                                  onClick={() => openVariant(inclusion.id, variant)}
                                                  className="text-primary hover:bg-primary-50 min-h-10 rounded-full px-3 text-xs font-bold disabled:opacity-50"
                                                >
                                                  Edit
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {view === 'inventory' && (
                <section aria-labelledby="inventory-heading">
                  <div className="mb-6">
                    <p className="text-primary text-xs font-bold uppercase tracking-[0.12em]">
                      Operational stock
                    </p>
                    <h2 id="inventory-heading" className="axon-section-title mt-1 text-2xl">
                      Inventory health
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Available stock excludes both reserved and confirmed sales. Every adjustment
                      requires a reason.
                    </p>
                  </div>
                  <div className="mb-6 grid gap-4 sm:grid-cols-3">
                    <MetricCard
                      label="Available"
                      value={String(totalAvailable)}
                      detail="Ready to sell"
                      icon={PackageOpen}
                    />
                    <MetricCard
                      label="Reserved"
                      value={String(totalReserved)}
                      detail="Awaiting payment or review"
                      icon={Clock3}
                    />
                    <MetricCard
                      label="Low stock"
                      value={String(lowStock.length)}
                      detail="Variants needing attention"
                      icon={SlidersHorizontal}
                    />
                  </div>
                  {allVariants.length === 0 ? (
                    <EmptyState
                      title="No inventory yet"
                      message="Add a variant to an optional inclusion to begin tracking stock."
                    />
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                      <table className="w-full min-w-[860px] text-left text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500">
                          <tr>
                            <th className="px-5 py-4">Inclusion / variant</th>
                            <th className="px-4 py-4">Total</th>
                            <th className="px-4 py-4">Available</th>
                            <th className="px-4 py-4">Reserved</th>
                            <th className="px-4 py-4">Sold</th>
                            <th className="px-4 py-4">Status</th>
                            <th className="px-5 py-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {allVariants.map(({ inclusion, variant }) => {
                            const available = availableStock(variant);
                            const isLow =
                              variant.isActive &&
                              available <= Math.max(3, Math.ceil(variant.totalStock * 0.1));
                            return (
                              <tr key={variant.id}>
                                <td className="px-5 py-4">
                                  <p className="text-ink font-bold">{variant.name}</p>
                                  <p className="text-xs text-gray-500">
                                    {inclusion.name} · {variant.sku || 'No SKU'}
                                  </p>
                                </td>
                                <td className="px-4 py-4">{variant.totalStock}</td>
                                <td className="text-ink px-4 py-4 font-black">{available}</td>
                                <td className="px-4 py-4">{variant.reservedStock}</td>
                                <td className="px-4 py-4">{variant.soldStock}</td>
                                <td className="px-4 py-4">
                                  {isLow ? (
                                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                                      Low stock
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                      Healthy
                                    </span>
                                  )}
                                </td>
                                <td className="px-5 py-4 text-right">
                                  <button
                                    type="button"
                                    disabled={!canInventory}
                                    onClick={() => {
                                      setStockTarget({ inclusion, variant });
                                      setStockQuantity('');
                                      setStockReason('');
                                    }}
                                    className="hover:border-primary hover:text-primary min-h-10 rounded-full border border-gray-200 px-4 text-xs font-bold uppercase tracking-[0.06em] text-gray-700 disabled:opacity-50"
                                  >
                                    Adjust
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {view === 'fulfillment' && (
                <section aria-labelledby="fulfillment-heading">
                  <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                    <div>
                      <p className="text-primary text-xs font-bold uppercase tracking-[0.12em]">
                        At the booth
                      </p>
                      <h2 id="fulfillment-heading" className="axon-section-title mt-1 text-2xl">
                        Fulfillment queue
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Handing over an inclusion is recorded separately and never checks an
                        attendee into the event.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label className="relative">
                        <span className="sr-only">Search fulfillment queue</span>
                        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <input
                          value={fulfillmentSearch}
                          onChange={(event) => setFulfillmentSearch(event.target.value)}
                          placeholder="Customer, attendee, item…"
                          className="focus:border-primary focus:ring-primary/20 min-h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 sm:w-64"
                        />
                      </label>
                      <label>
                        <span className="sr-only">Fulfillment status</span>
                        <select
                          value={fulfillmentStatus}
                          onChange={(event) => setFulfillmentStatus(event.target.value)}
                          className="focus:border-primary focus:ring-primary/20 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2"
                        >
                          <option value="PENDING">Pending</option>
                          <option value="FULFILLED">Fulfilled</option>
                          <option value="REVERSED">Reversed</option>
                          <option value="ALL">All statuses</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  {fulfillmentsQuery.isLoading && <ScreenSkeleton rows={5} compact />}
                  {fulfillmentsQuery.isError && (
                    <ErrorState
                      message="The fulfillment queue could not be loaded. No fulfillment records were changed."
                      action={
                        <button
                          type="button"
                          onClick={() => void fulfillmentsQuery.refetch()}
                          className="axon-pill bg-primary text-xs text-white"
                        >
                          Try again
                        </button>
                      }
                    />
                  )}
                  {!fulfillmentsQuery.isLoading &&
                    !fulfillmentsQuery.isError &&
                    visibleFulfillments.length === 0 && (
                      <EmptyState
                        title="No matching fulfillment items"
                        message={
                          fulfillmentStatus === 'PENDING'
                            ? 'There are no optional inclusions waiting to be handed over.'
                            : 'Change the status or search to review other records.'
                        }
                      />
                    )}
                  {!fulfillmentsQuery.isLoading && visibleFulfillments.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                      <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500">
                          <tr>
                            <th className="px-5 py-4">Customer / attendee</th>
                            <th className="px-4 py-4">Inclusion</th>
                            <th className="px-4 py-4">Qty</th>
                            <th className="px-4 py-4">Status</th>
                            <th className="px-4 py-4">Recorded</th>
                            <th className="px-5 py-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {visibleFulfillments.map((item) => {
                            const normalizedStatus = item.status.toUpperCase();
                            return (
                              <tr key={item.id}>
                                <td className="px-5 py-4">
                                  <p className="text-ink font-bold">
                                    {item.attendeeName || item.customerName || 'Customer'}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {item.registrationId
                                      ? `Registration ${item.registrationId.slice(0, 8)}`
                                      : 'Registration item'}
                                  </p>
                                </td>
                                <td className="px-4 py-4">
                                  <p className="font-semibold text-gray-800">
                                    {item.inclusionName}
                                  </p>
                                  <p className="text-xs text-gray-500">{item.variantName}</p>
                                </td>
                                <td className="px-4 py-4 font-bold">{item.quantity}</td>
                                <td className="px-4 py-4">
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${normalizedStatus === 'FULFILLED' ? 'bg-emerald-100 text-emerald-700' : normalizedStatus === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}
                                  >
                                    {item.status.toLowerCase().replaceAll('_', ' ')}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-xs text-gray-500">
                                  {item.fulfilledAt
                                    ? dateTime(item.fulfilledAt)
                                    : 'Not yet fulfilled'}
                                </td>
                                <td className="px-5 py-4 text-right">
                                  {normalizedStatus === 'PENDING' ? (
                                    <button
                                      type="button"
                                      disabled={!canFulfill || fulfillItem.isPending}
                                      onClick={() => fulfillItem.mutate(item)}
                                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-bold uppercase tracking-[0.06em] text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                      Fulfill
                                    </button>
                                  ) : normalizedStatus === 'FULFILLED' ? (
                                    <button
                                      type="button"
                                      disabled={!canFulfill}
                                      onClick={() => {
                                        setReversalTarget(item);
                                        setReversalReason('');
                                      }}
                                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-xs font-bold uppercase tracking-[0.06em] text-gray-700 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                      Reverse
                                    </button>
                                  ) : (
                                    <span className="text-xs text-gray-400">No action</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {view === 'reports' && (
                <section aria-labelledby="reports-heading">
                  <div className="mb-6 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-primary text-xs font-bold uppercase tracking-[0.12em]">
                        Commercial performance
                      </p>
                      <h2 id="reports-heading" className="axon-section-title mt-1 text-2xl">
                        Inclusion report
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Admission and inclusion revenue remain distinct; inclusion units never count
                        as tickets.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void reportQuery.refetch()}
                      className="hover:border-primary hover:text-primary inline-flex min-h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-xs font-bold uppercase tracking-[0.06em] text-gray-700"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${reportQuery.isFetching ? 'animate-spin' : ''}`}
                      />
                      Refresh
                    </button>
                  </div>
                  {reportQuery.isLoading && <ScreenSkeleton rows={4} />}
                  {reportQuery.isError && (
                    <ErrorState
                      message="The inclusion report could not be loaded."
                      action={
                        <button
                          type="button"
                          onClick={() => void reportQuery.refetch()}
                          className="axon-pill bg-primary text-xs text-white"
                        >
                          Try again
                        </button>
                      }
                    />
                  )}
                  {reportQuery.data &&
                    (() => {
                      const report = reportQuery.data;
                      const inventoryByVariant = new Map(
                        (report.inventory ?? []).map((row) => [row.variantId, row]),
                      );
                      const rows = (report.byVariant ?? report.byInclusion ?? []).map((row) => ({
                        ...row,
                        ...(row.variantId ? inventoryByVariant.get(row.variantId) : undefined),
                        unfulfilledUnits: row.unitsUnfulfilled ?? row.unfulfilledUnits,
                      }));
                      const summary = report.summary;
                      const attachment = Number(summary.attachmentRate ?? 0);
                      return (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <MetricCard
                              label="Inclusion revenue"
                              value={money(summary.inclusionRevenue)}
                              detail="Separate from admission"
                              icon={CircleDollarSign}
                            />
                            <MetricCard
                              label="Units sold"
                              value={String(summary.unitsSold)}
                              detail="Optional inclusion units"
                              icon={Box}
                            />
                            <MetricCard
                              label="Attachment rate"
                              value={`${attachment.toFixed(1)}%`}
                              detail="Registrations with add-ons"
                              icon={BarChart3}
                            />
                            <MetricCard
                              label="Awaiting fulfillment"
                              value={String(summary.unitsUnfulfilled ?? 0)}
                              detail={`${summary.unitsFulfilled ?? 0} fulfilled`}
                              icon={ClipboardCheck}
                            />
                          </div>
                          <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                            <table className="w-full min-w-[760px] text-left text-sm">
                              <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500">
                                <tr>
                                  <th className="px-5 py-4">Inclusion</th>
                                  <th className="px-4 py-4">Units sold</th>
                                  <th className="px-4 py-4">Revenue</th>
                                  <th className="px-4 py-4">Available</th>
                                  <th className="px-4 py-4">Reserved</th>
                                  <th className="px-5 py-4">Unfulfilled</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {rows.length ? (
                                  rows.map((row, index) => (
                                    <tr
                                      key={`${row.inclusionId ?? row.inclusionName}-${row.variantName ?? index}`}
                                    >
                                      <td className="px-5 py-4">
                                        <p className="text-ink font-bold">{row.inclusionName}</p>
                                        {row.variantName && (
                                          <p className="text-xs text-gray-500">{row.variantName}</p>
                                        )}
                                      </td>
                                      <td className="px-4 py-4">{row.unitsSold}</td>
                                      <td className="px-4 py-4 font-bold">{money(row.revenue)}</td>
                                      <td className="px-4 py-4">{row.availableStock ?? '—'}</td>
                                      <td className="px-4 py-4">{row.reservedStock ?? '—'}</td>
                                      <td className="px-5 py-4">{row.unfulfilledUnits ?? '—'}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td
                                      colSpan={6}
                                      className="px-5 py-12 text-center text-sm text-gray-500"
                                    >
                                      No inclusion sales have been recorded yet.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
                </section>
              )}
            </div>
          )}
      </div>

      <Dialog
        open={editingInclusion !== null}
        onClose={() => !saveInclusion.isPending && setEditingInclusion(null)}
        className="relative z-50"
      >
        <div className="bg-ink/60 fixed inset-0 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6">
          <div className="flex min-h-full items-center justify-center">
            <DialogPanel className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-gray-200 px-5 py-5 sm:px-7">
                <div>
                  <p className="text-primary text-xs font-bold uppercase tracking-[0.12em]">
                    Catalog item
                  </p>
                  <DialogTitle className="axon-section-title mt-1 text-xl">
                    {editingInclusion === 'new'
                      ? 'Create optional inclusion'
                      : 'Edit optional inclusion'}
                  </DialogTitle>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingInclusion(null)}
                  className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (inclusionFormValid) saveInclusion.mutate();
                }}
                className="space-y-5 px-5 py-6 sm:px-7"
              >
                <label className="block">
                  <FieldLabel required>Name</FieldLabel>
                  <input
                    autoFocus
                    value={inclusionForm.name}
                    onChange={(event) =>
                      setInclusionForm((form) => ({ ...form, name: event.target.value }))
                    }
                    maxLength={120}
                    placeholder="e.g. Event shirt"
                    className="focus:border-primary focus:ring-primary/20 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2"
                  />
                </label>
                <label className="block">
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={inclusionForm.description}
                    onChange={(event) =>
                      setInclusionForm((form) => ({ ...form, description: event.target.value }))
                    }
                    maxLength={500}
                    rows={3}
                    placeholder="What customers receive and why they might want it"
                    className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <FieldLabel>Sale starts</FieldLabel>
                    <input
                      type="datetime-local"
                      value={inclusionForm.saleStartsAt}
                      onChange={(event) =>
                        setInclusionForm((form) => ({ ...form, saleStartsAt: event.target.value }))
                      }
                      className="focus:border-primary focus:ring-primary/20 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2"
                    />
                  </label>
                  <label>
                    <FieldLabel>Sale ends</FieldLabel>
                    <input
                      type="datetime-local"
                      value={inclusionForm.saleEndsAt}
                      min={inclusionForm.saleStartsAt || undefined}
                      onChange={(event) =>
                        setInclusionForm((form) => ({ ...form, saleEndsAt: event.target.value }))
                      }
                      className="focus:border-primary focus:ring-primary/20 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2"
                    />
                  </label>
                </div>
                <fieldset className="block">
                  <legend>
                    <FieldLabel>Eligible ticket tiers and limits</FieldLabel>
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {eventQuery.data?.tiers.map((tier) => {
                      const selected = inclusionForm.eligibleTierIds.includes(tier.id);
                      return (
                        <div
                          key={tier.id}
                          className={`rounded-lg border px-3 py-2.5 ${selected ? 'border-primary-300 bg-primary-50/40' : 'border-gray-200'}`}
                        >
                          <label className="flex min-h-8 cursor-pointer items-center gap-3 text-sm font-semibold text-gray-700">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) =>
                                setInclusionForm((form) => ({
                                  ...form,
                                  eligibleTierIds: event.target.checked
                                    ? [...form.eligibleTierIds, tier.id]
                                    : form.eligibleTierIds.filter((id) => id !== tier.id),
                                  tierLimits: event.target.checked
                                    ? form.tierLimits
                                    : Object.fromEntries(
                                        Object.entries(form.tierLimits).filter(
                                          ([id]) => id !== tier.id,
                                        ),
                                      ),
                                }))
                              }
                              className="accent-primary h-4 w-4"
                            />
                            {tier.name}
                          </label>
                          {selected && (
                            <label className="mt-2 block">
                              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-gray-500">
                                Max units per registration
                              </span>
                              <input
                                type="number"
                                min="1"
                                max="100"
                                step="1"
                                value={inclusionForm.tierLimits[tier.id] ?? ''}
                                onChange={(event) =>
                                  setInclusionForm((form) => ({
                                    ...form,
                                    tierLimits: {
                                      ...form.tierLimits,
                                      [tier.id]: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="No limit"
                                className="focus:border-primary focus:ring-primary/20 mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2"
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Leave every tier unchecked to make the inclusion available to all ticket tiers.
                    Limits apply to the combined quantity across all attendees in one registration.
                  </p>
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                  <label>
                    <FieldLabel required>Fulfillment method</FieldLabel>
                    <select
                      value={inclusionForm.fulfillmentMethod}
                      onChange={(event) =>
                        setInclusionForm((form) => ({
                          ...form,
                          fulfillmentMethod: event.target
                            .value as InclusionFormState['fulfillmentMethod'],
                        }))
                      }
                      className="focus:border-primary focus:ring-primary/20 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2"
                    >
                      <option value="pickup">Pickup</option>
                      <option value="delivery">Delivery</option>
                      <option value="digital">Digital</option>
                      <option value="manual">Manual</option>
                    </select>
                  </label>
                  <label className="block">
                    <FieldLabel>Fulfillment instructions</FieldLabel>
                    <textarea
                      value={inclusionForm.fulfillmentInstructions}
                      onChange={(event) =>
                        setInclusionForm((form) => ({
                          ...form,
                          fulfillmentInstructions: event.target.value,
                        }))
                      }
                      maxLength={500}
                      rows={3}
                      placeholder="e.g. Claim at the merchandise booth with your registration details. Admission QR is not a claim voucher."
                      className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    />
                  </label>
                </div>
                <label className="block">
                  <FieldLabel>Status</FieldLabel>
                  <select
                    value={inclusionForm.status}
                    onChange={(event) =>
                      setInclusionForm((form) => ({
                        ...form,
                        status: event.target.value as InclusionStatus,
                      }))
                    }
                    className="focus:border-primary focus:ring-primary/20 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2"
                  >
                    <option value="DRAFT">Draft — hidden from customers</option>
                    {editingInclusion !== 'new' && (
                      <option value="ACTIVE">Active — available within sale window</option>
                    )}
                    {editingInclusion !== 'new' && (
                      <option value="ARCHIVED">Archived — unavailable for new sales</option>
                    )}
                  </select>
                  {editingInclusion === 'new' && (
                    <p className="mt-2 text-xs text-gray-500">
                      New inclusions start as drafts. Add an active variant before publishing.
                    </p>
                  )}
                </label>
                {inclusionForm.saleStartsAt &&
                  inclusionForm.saleEndsAt &&
                  inclusionForm.saleEndsAt <= inclusionForm.saleStartsAt && (
                    <p className="text-sm font-semibold text-red-600" role="alert">
                      Sale end must be later than sale start.
                    </p>
                  )}
                <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setEditingInclusion(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={saveInclusion.isPending}
                    disabled={!inclusionFormValid}
                  >
                    {editingInclusion === 'new' ? 'Create inclusion' : 'Save changes'}
                  </Button>
                </div>
              </form>
            </DialogPanel>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={editingVariant !== null}
        onClose={() => !saveVariant.isPending && setEditingVariant(null)}
        className="relative z-50"
      >
        <div className="bg-ink/60 fixed inset-0 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 overflow-y-auto p-4">
          <div className="flex min-h-full items-center justify-center">
            <DialogPanel className="w-full max-w-lg rounded-lg border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
                <div>
                  <p className="text-primary text-xs font-bold uppercase tracking-[0.12em]">
                    Purchasable option
                  </p>
                  <DialogTitle className="axon-section-title mt-1 text-xl">
                    {editingVariant?.variant ? 'Edit variant' : 'Add variant'}
                  </DialogTitle>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingVariant(null)}
                  className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (variantFormValid) saveVariant.mutate();
                }}
                className="space-y-5 px-6 py-6"
              >
                <label className="block">
                  <FieldLabel required>Variant name</FieldLabel>
                  <input
                    autoFocus
                    value={variantForm.name}
                    onChange={(event) =>
                      setVariantForm((form) => ({ ...form, name: event.target.value }))
                    }
                    maxLength={100}
                    placeholder="e.g. Medium"
                    className="focus:border-primary focus:ring-primary/20 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2"
                  />
                </label>
                <label className="block">
                  <FieldLabel>SKU</FieldLabel>
                  <input
                    value={variantForm.sku}
                    onChange={(event) =>
                      setVariantForm((form) => ({ ...form, sku: event.target.value }))
                    }
                    maxLength={64}
                    placeholder="e.g. SHIRT-BLK-M"
                    className="focus:border-primary focus:ring-primary/20 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm uppercase focus:outline-none focus:ring-2"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <FieldLabel required>Price (PHP)</FieldLabel>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={variantForm.price}
                      onChange={(event) =>
                        setVariantForm((form) => ({ ...form, price: event.target.value }))
                      }
                      className="focus:border-primary focus:ring-primary/20 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2"
                    />
                  </label>
                  <label>
                    <FieldLabel required>Total stock</FieldLabel>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={variantForm.totalStock}
                      disabled={Boolean(editingVariant?.variant)}
                      onChange={(event) =>
                        setVariantForm((form) => ({ ...form, totalStock: event.target.value }))
                      }
                      className="focus:border-primary focus:ring-primary/20 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    {editingVariant?.variant && (
                      <p className="mt-1 text-[11px] text-gray-500">
                        Use Inventory → Adjust to change stock with an audit reason.
                      </p>
                    )}
                  </label>
                </div>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={variantForm.isActive}
                    onChange={(event) =>
                      setVariantForm((form) => ({ ...form, isActive: event.target.checked }))
                    }
                    className="accent-primary h-4 w-4"
                  />
                  Available for new selections
                </label>
                <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setEditingVariant(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={saveVariant.isPending}
                    disabled={!variantFormValid}
                  >
                    Save variant
                  </Button>
                </div>
              </form>
            </DialogPanel>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={stockTarget !== null}
        onClose={() => !adjustStock.isPending && setStockTarget(null)}
        className="relative z-50"
      >
        <div className="bg-ink/60 fixed inset-0 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 overflow-y-auto p-4">
          <div className="flex min-h-full items-center justify-center">
            <DialogPanel className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-2xl">
              <DialogTitle className="axon-section-title text-xl">Adjust inventory</DialogTitle>
              <p className="mt-2 text-sm text-gray-500">
                {stockTarget?.inclusion.name} · {stockTarget?.variant.name}. Use a negative quantity
                to reduce stock.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    Number.isInteger(Number(stockQuantity)) &&
                    Number(stockQuantity) !== 0 &&
                    stockReason.trim().length >= 5
                  )
                    adjustStock.mutate();
                }}
                className="mt-6 space-y-4"
              >
                <label className="block">
                  <FieldLabel required>Adjustment quantity</FieldLabel>
                  <input
                    autoFocus
                    type="number"
                    step="1"
                    value={stockQuantity}
                    onChange={(event) => setStockQuantity(event.target.value)}
                    placeholder="e.g. 10 or -2"
                    className="focus:border-primary focus:ring-primary/20 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2"
                  />
                </label>
                <label className="block">
                  <FieldLabel required>Reason</FieldLabel>
                  <textarea
                    value={stockReason}
                    onChange={(event) => setStockReason(event.target.value)}
                    maxLength={240}
                    rows={3}
                    placeholder="Delivery received, damaged stock, reconciliation…"
                    className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  />
                </label>
                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setStockTarget(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={adjustStock.isPending}
                    disabled={
                      !Number.isInteger(Number(stockQuantity)) ||
                      Number(stockQuantity) === 0 ||
                      stockReason.trim().length < 5
                    }
                  >
                    Record adjustment
                  </Button>
                </div>
              </form>
            </DialogPanel>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={reversalTarget !== null}
        onClose={() => !reverseFulfillment.isPending && setReversalTarget(null)}
        className="relative z-50"
      >
        <div className="bg-ink/60 fixed inset-0 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 overflow-y-auto p-4">
          <div className="flex min-h-full items-center justify-center">
            <DialogPanel className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-2xl">
              <DialogTitle className="axon-section-title text-xl">Reverse fulfillment</DialogTitle>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                This corrects the fulfillment record only. It does not change admission check-in or
                refund the customer.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (reversalReason.trim().length >= 5) reverseFulfillment.mutate();
                }}
                className="mt-6 space-y-4"
              >
                <label className="block">
                  <FieldLabel required>Reason</FieldLabel>
                  <textarea
                    autoFocus
                    value={reversalReason}
                    onChange={(event) => setReversalReason(event.target.value)}
                    maxLength={240}
                    rows={3}
                    placeholder="Why is this fulfillment being reversed?"
                    className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  />
                </label>
                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setReversalTarget(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="danger"
                    loading={reverseFulfillment.isPending}
                    disabled={reversalReason.trim().length < 5}
                  >
                    Reverse fulfillment
                  </Button>
                </div>
              </form>
            </DialogPanel>
          </div>
        </div>
      </Dialog>

      <ConfirmModal
        open={archiveTarget !== null}
        title="Archive optional inclusion?"
        message={`“${archiveTarget?.name ?? ''}” will no longer be available for new purchases. Existing line items, inventory history, and fulfillment records will be preserved.`}
        confirmLabel="Archive inclusion"
        variant="warning"
        loading={archiveInclusion.isPending}
        onConfirm={() => archiveInclusion.mutate()}
        onCancel={() => setArchiveTarget(null)}
      />
    </main>
  );
}
