import type { SponsorItem, FaqItem, AgendaItem } from '@/components/ConferenceFields';

export interface LocalTier {
  key: number;
  serverId?: string; // present when the tier already exists on the server
  name: string;
  description: string;
  price: string;
  totalQuantity: string;
  maxPerOrder: string;
  isVisible: boolean;
  soldQuantity?: number;
  /** Position in the list. Persisted to API as `sortOrder` so the tier order survives reloads. */
  sortOrder?: number;
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
}

export interface EventDraftLocation {
  venue: string;
  address: string;
  landmark: string;
  city: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

export interface EventDraftCapacity {
  maxCapacity: string;
}

export interface EventDraft
  extends EventDraftBasics,
    EventDraftLocation,
    EventDraftCapacity {
  agenda: AgendaItem[];
  sponsors: SponsorItem[];
  faqs: FaqItem[];
}

export interface StepMeta {
  readonly id:
    | 'basics'
    | 'location'
    | 'capacity'
    | 'conference'
    | 'payment'
    | 'review';
  readonly label: string;
  readonly short: string;
  readonly optional?: boolean;
}

export const STEPS: readonly StepMeta[] = [
  { id: 'basics', label: 'Basics', short: '1' },
  { id: 'location', label: 'Location & Schedule', short: '2' },
  { id: 'capacity', label: 'Capacity & Tiers', short: '3' },
  { id: 'conference', label: 'Conference', short: '4', optional: true },
  { id: 'payment', label: 'Payment', short: '5', optional: true },
  { id: 'review', label: 'Review', short: '6' },
];

export type StepId = StepMeta['id'];

export function emptyTier(key: number): LocalTier {
  return { key, name: '', description: '', price: '', totalQuantity: '', maxPerOrder: '', isVisible: true, sortOrder: 0 };
}

export function emptyPM(key: number): LocalPaymentMethod {
  return { key, type: 'bank', name: '', accountName: '', accountNumber: '', qrFile: null, qrPreview: '', qrImageUrl: '' };
}

export function emptyDraft(): EventDraft {
  return {
    title: '',
    description: '',
    imageUrl: '',
    speakerName: '',
    venue: '',
    address: '',
    landmark: '',
    city: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    maxCapacity: '',
    agenda: [],
    sponsors: [],
    faqs: [],
  };
}

export function combineDatetime(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  return new Date(`${date}T${time}`).toISOString();
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

// Per-step validation -------------------------------------------------------

export function validateBasics(d: EventDraft): string | null {
  if (!d.title.trim()) return 'Title is required';
  if (!d.description.trim()) return 'Description is required';
  return null;
}

export function validateLocation(d: EventDraft): string | null {
  if (!d.venue.trim()) return 'Venue is required';
  if (!d.address.trim()) return 'Address is required';
  if (!d.city.trim()) return 'City is required';
  if (!d.startDate || !d.startTime) return 'Start date and time are required';
  const start = combineDatetime(d.startDate, d.startTime);
  const end = combineDatetime(d.endDate, d.endTime);
  if (start && end && new Date(end) <= new Date(start)) return 'End must be after start';
  return null;
}

export function validateCapacity(d: EventDraft, tiers: LocalTier[]): string | null {
  const cap = parseInt(d.maxCapacity, 10) || 0;
  if (cap <= 0) return 'Maximum capacity must be greater than zero';
  if (tiers.length === 0) return 'Add at least one ticket tier';
  const total = tiers.reduce((s, t) => s + (parseInt(t.totalQuantity, 10) || 0), 0);
  if (total !== cap) {
    const diff = total - cap;
    return `Tier quantity total (${total.toLocaleString()}) must equal capacity (${cap.toLocaleString()}). Difference: ${diff > 0 ? '+' : ''}${diff.toLocaleString()}.`;
  }
  return null;
}

export function validateStep(
  step: StepId,
  draft: EventDraft,
  tiers: LocalTier[],
): string | null {
  switch (step) {
    case 'basics': return validateBasics(draft);
    case 'location': return validateLocation(draft);
    case 'capacity': return validateCapacity(draft, tiers);
    case 'conference':
    case 'payment':
    case 'review':
      return null;
  }
}
