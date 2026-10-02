import type { SponsorItem, FaqItem, AgendaItem } from '@/components/ConferenceFields';

export interface CustomSectionItem {
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  isVisible: boolean;
}

export interface LocalTier {
  key: number;
  serverId?: string; // present when the tier already exists on the server
  name: string;
  description: string;
  price: string;
  totalQuantity: string;
  maxPerOrder: string;
  isVisible: boolean;
  inclusions: LocalTierInclusion[];
  soldQuantity?: number;
  /** Position in the list. Persisted to API as `sortOrder` so the tier order survives reloads. */
  sortOrder?: number;
}

export interface LocalTierInclusion {
  id?: string;
  label: string;
  stubEnabled: boolean;
  sortOrder: number;
}

export interface LocalPaymentMethod {
  key: number;
  type: 'bank' | 'ewallet';
  name: string;
  accountName: string;
  accountNumber: string;
  qrFile: File | null;
  qrPreview: string;
  qrImageUrl: string;
}

export interface EventDraftBasics {
  title: string;
  description: string;
  imageUrl: string;
  speakerName: string;
  tagline: string;
  category: 'sports' | 'business' | 'workshops' | 'music' | 'theater' | 'parties';
  eventType: 'standard' | 'running';
  isOnline: boolean;
}

export interface RunningEventConfig {
  distances: Array<{ name: string; code: string }>;
  ageGroups: Array<{ name: string; minAge: number; maxAge: number }>;
  raceDivisions: string[];
  genderIdentityOptions: string[];
  merchandiseSizes: string[];
  claimMethods: Array<'self_claim' | 'delivery'>;
}

export interface EventDraftLocation {
  venue: string;
  address: string;
  landmark: string;
  city: string;
  latitude: string; // Form input (number as string)
  longitude: string; // Form input (number as string)
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  /** ISO start already saved on the server (edit only); an unchanged past start stays valid. */
  savedStartsAt?: string;
  /** ISO end already saved on the server (edit only); null for events created before ends were required. */
  savedEndsAt?: string | null;
}

export interface EventDraftCapacity {
  maxCapacity: string;
  /** Free events collect no ticket amount and no platform fee. */
  isFree: boolean;
  /** Flat processing fee per transaction in pesos (string for form input). Default '50'. */
  platformFee: string;
}

export interface EventDraft extends EventDraftBasics, EventDraftLocation, EventDraftCapacity {
  agenda: AgendaItem[];
  sponsors: SponsorItem[];
  faqs: FaqItem[];
  customSections: CustomSectionItem[];
  runningConfig: RunningEventConfig;
}

export interface StepMeta {
  readonly id: 'basics' | 'location' | 'capacity' | 'details' | 'payment' | 'review';
  readonly label: string;
  readonly short: string;
  readonly optional?: boolean;
}

export const STEPS: readonly StepMeta[] = [
  { id: 'basics', label: 'Basics', short: '1' },
  { id: 'location', label: 'Location & Schedule', short: '2' },
  { id: 'capacity', label: 'Capacity & Tiers', short: '3' },
  { id: 'details', label: 'Event Program & Details', short: '4', optional: true },
  { id: 'payment', label: 'Payment', short: '5' },
  { id: 'review', label: 'Review', short: '6' },
];

export type StepId = StepMeta['id'];

/** Steps shown for this event: free events have no Payment step. */
export function activeStepsFor(draft: Pick<EventDraft, 'isFree'>): readonly StepMeta[] {
  return draft.isFree ? STEPS.filter((s) => s.id !== 'payment') : STEPS;
}

export function emptyTier(key: number): LocalTier {
  return {
    key,
    name: '',
    description: '',
    price: '',
    totalQuantity: '',
    maxPerOrder: '',
    isVisible: true,
    inclusions: [],
    sortOrder: 0,
  };
}

export function emptyPM(key: number): LocalPaymentMethod {
  return {
    key,
    type: 'bank',
    name: '',
    accountName: '',
    accountNumber: '',
    qrFile: null,
    qrPreview: '',
    qrImageUrl: '',
  };
}

export function emptyDraft(): EventDraft {
  return {
    title: '',
    description: '',
    imageUrl: '',
    speakerName: '',
    tagline: '',
    category: 'business',
    eventType: 'standard',
    isOnline: false,
    venue: '',
    address: '',
    landmark: '',
    city: '',
    latitude: '',
    longitude: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    maxCapacity: '',
    isFree: false,
    platformFee: '50',
    agenda: [],
    sponsors: [],
    faqs: [],
    customSections: [],
    runningConfig: {
      distances: [{ name: '5K', code: '5K' }],
      ageGroups: [{ name: 'Open', minAge: 0, maxAge: 120 }],
      raceDivisions: ["Women's", "Men's", 'Non-binary', 'Open'],
      genderIdentityOptions: ['Woman', 'Man', 'Non-binary', 'Self-described', 'Prefer not to say'],
      merchandiseSizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
      claimMethods: ['self_claim', 'delivery'],
    },
  };
}

export function combineDatetime(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  // Append +08:00 (Asia/Manila) so the string is parsed as local time
  // regardless of whether this runs on a UTC server (SSR) or the browser.
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}

export function todayStr(): string {
  // Asia/Manila date (UTC+8). 'en-CA' formats as YYYY-MM-DD natively.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Default length used to pre-fill the end time from the start time. */
export const DEFAULT_EVENT_HOURS = 3;

/** Splits an ISO timestamp into Asia/Manila date (YYYY-MM-DD) and time (HH:mm) form values. */
export function toManilaParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** Start date/time plus `hours`, as Manila form values; empty when the start is incomplete. */
export function addHoursToParts(date: string, time: string, hours: number): { date: string; time: string } {
  const start = combineDatetime(date, time);
  if (!start) return { date: '', time: '' };
  return toManilaParts(new Date(new Date(start).getTime() + hours * 3_600_000).toISOString());
}

/**
 * End time is required for new events and for events that already have one.
 * Only events saved before ends were required (savedEndsAt === null) may leave it blank;
 * those are auto-completed 24 hours after they start.
 */
export function isEndTimeRequired(d: EventDraft): boolean {
  return d.savedEndsAt !== null;
}

// Per-step validation -------------------------------------------------------
// Each collector lists every unmet publish requirement for its step, in the order the
// form shows the fields. `validateStep` returns the first one.

function basicsIssues(d: EventDraft): string[] {
  const issues: string[] = [];
  if (!d.title.trim()) issues.push('Title is required');
  if (!d.description.trim()) issues.push('Description is required');
  if (!d.imageUrl.trim()) issues.push('A cover image is required before this event can be published');
  return issues;
}

function locationIssues(d: EventDraft): string[] {
  const issues: string[] = [];
  if (!d.venue.trim()) issues.push('Venue is required');
  if (!d.address.trim()) issues.push('Address is required');
  if (!d.city.trim()) issues.push('City is required');
  if (!d.startDate || !d.startTime) issues.push('Start date and time are required');
  const start = combineDatetime(d.startDate, d.startTime);
  const end = combineDatetime(d.endDate, d.endTime);
  const startUnchanged =
    !!start && !!d.savedStartsAt && Math.abs(new Date(start).getTime() - new Date(d.savedStartsAt).getTime()) < 60_000;
  if (start && !startUnchanged && new Date(start).getTime() < Date.now()) {
    issues.push('Start date and time cannot be in the past');
  }
  if (isEndTimeRequired(d) && !end) issues.push('End date and time are required');
  if (start && end && new Date(end) <= new Date(start)) issues.push('End must be after start');
  return issues;
}

function capacityIssues(d: EventDraft, tiers: LocalTier[]): string[] {
  const issues: string[] = [];
  const cap = parseInt(d.maxCapacity, 10) || 0;
  if (cap <= 0) issues.push('Maximum capacity must be greater than zero');
  if (tiers.length === 0) issues.push('Add at least one ticket tier');
  if (cap > 0 && tiers.length > 0) {
    const total = tiers.reduce((s, t) => s + (parseInt(t.totalQuantity, 10) || 0), 0);
    if (total !== cap) {
      const diff = total - cap;
      issues.push(
        `Tier quantity total (${total.toLocaleString()}) must equal capacity (${cap.toLocaleString()}). Difference: ${diff > 0 ? '+' : ''}${diff.toLocaleString()}.`,
      );
    }
  }
  return issues;
}

function detailsIssues(d: EventDraft): string[] {
  if (d.eventType !== 'running') return [];
  const issues: string[] = [];
  const config = d.runningConfig;
  if (config.distances.length === 0) issues.push('Add at least one race distance');
  if (config.ageGroups.length === 0) {
    issues.push('Add at least one age group');
  } else {
    const sorted = [...config.ageGroups].sort((a, b) => a.minAge - b.minAge);
    if (sorted.some((group) => group.minAge > group.maxAge)) {
      issues.push('Every age group needs a valid age range');
    } else if (sorted.some((group, index) => index > 0 && group.minAge <= sorted[index - 1].maxAge)) {
      issues.push('Age groups cannot overlap');
    } else if (sorted.some((group, index) => index > 0 && group.minAge !== sorted[index - 1].maxAge + 1)) {
      issues.push('Age groups must be continuous');
    }
  }
  if (config.raceDivisions.length === 0) issues.push('Add at least one Race Division');
  if (config.merchandiseSizes.length === 0) issues.push('Add at least one merchandise size');
  return issues;
}

function paymentIssues(d: EventDraft, paymentMethods: LocalPaymentMethod[]): string[] {
  if (d.isFree) return [];
  if (paymentMethods.length === 0) return ['Add at least one payment method for this paid event'];
  return paymentMethods
    .filter((method) => !method.name.trim() || !method.accountName.trim() || !method.accountNumber.trim())
    .map((method) => `Complete every required payment account field for ${method.name.trim() || 'the payment method'}`);
}

export function stepIssues(
  step: StepId,
  draft: EventDraft,
  tiers: LocalTier[],
  paymentMethods: LocalPaymentMethod[] = [],
): string[] {
  switch (step) {
    case 'basics':
      return basicsIssues(draft);
    case 'location':
      return locationIssues(draft);
    case 'capacity':
      return capacityIssues(draft, tiers);
    case 'details':
      return detailsIssues(draft);
    case 'payment':
      return paymentIssues(draft, paymentMethods);
    case 'review':
      return [];
  }
}

export function validateStep(
  step: StepId,
  draft: EventDraft,
  tiers: LocalTier[],
  paymentMethods: LocalPaymentMethod[] = [],
): string | null {
  return stepIssues(step, draft, tiers, paymentMethods)[0] ?? null;
}

// Step status ---------------------------------------------------------------

export type StepStatus = 'done' | 'needs_info' | 'not_started' | 'optional';

/** Whether the organizer has entered anything on this step yet. */
export function stepHasInput(
  step: StepId,
  d: EventDraft,
  tiers: LocalTier[],
  paymentMethods: LocalPaymentMethod[],
): boolean {
  switch (step) {
    case 'basics':
      return Boolean(d.title.trim() || d.description.trim() || d.imageUrl.trim());
    case 'location':
      return Boolean(d.venue.trim() || d.address.trim() || d.city.trim() || d.startDate || d.endDate);
    case 'capacity':
      return Boolean(d.maxCapacity.trim()) || tiers.length > 0;
    case 'details':
      return (
        d.eventType === 'running' ||
        Boolean(d.speakerName.trim()) ||
        d.agenda.length > 0 ||
        d.sponsors.length > 0 ||
        d.faqs.length > 0 ||
        d.customSections.length > 0
      );
    case 'payment':
      return paymentMethods.length > 0;
    case 'review':
      return false;
  }
}

/** Status shown for a step chip. Review is summarized separately by its issue count. */
export function stepStatus(
  step: StepId,
  d: EventDraft,
  tiers: LocalTier[],
  paymentMethods: LocalPaymentMethod[],
): StepStatus {
  const optional = STEPS.find((s) => s.id === step)?.optional === true;
  const hasInput = stepHasInput(step, d, tiers, paymentMethods);
  if (optional && !hasInput) return 'optional';
  if (stepIssues(step, d, tiers, paymentMethods).length === 0) return 'done';
  return hasInput ? 'needs_info' : 'not_started';
}

export interface PublishIssue {
  step: StepId;
  message: string;
}

/** Every unmet publish requirement across the steps shown for this event, in step order. */
export function publishIssues(
  steps: readonly StepMeta[],
  d: EventDraft,
  tiers: LocalTier[],
  paymentMethods: LocalPaymentMethod[],
): PublishIssue[] {
  return steps.flatMap((s) => stepIssues(s.id, d, tiers, paymentMethods).map((message) => ({ step: s.id, message })));
}
