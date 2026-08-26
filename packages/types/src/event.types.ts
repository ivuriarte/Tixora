import type { EventOptionalInclusion } from './inclusion.types';

export type EventStatus =
  | 'draft'
  | 'published'
  | 'on_sale'
  | 'sold_out'
  | 'cancelled'
  | 'completed';

export interface EventTier {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  totalQuantity: number;
  soldQuantity: number;
  availableQuantity: number;
  maxPerOrder: number;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  isVisible: boolean;
  sortOrder: number;
  isSoldOut: boolean;
  /** Descriptive benefits bundled with admission; never a separately paid item. */
  inclusions?: Array<{
    id?: string;
    label: string;
    stubEnabled?: boolean;
    sortOrder?: number;
  }>;
}

export interface Event {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  venue: string;
  city: string;
  startsAt: string;
  endsAt: string | null;
  imageUrl: string | null;
  status: EventStatus;
  maxPerUser: number;
  platformFee: number;
  tiers: EventTier[];
  optionalInclusionsEnabled?: boolean;
  optionalInclusions?: EventOptionalInclusion[];
  createdAt: string;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  venue: string;
  city: string;
  startsAt: string;
  imageUrl: string | null;
  status: EventStatus;
  lowestPrice: number | null;
  totalAvailable: number;
}

export interface CreateEventDto {
  title: string;
  description?: string;
  venue: string;
  city?: string;
  startsAt: string;
  endsAt?: string;
  maxPerUser?: number;
}

export interface UpdateEventDto extends Partial<CreateEventDto> {
  status?: EventStatus;
  imageUrl?: string;
}

export interface CreateTierDto {
  name: string;
  description?: string;
  price: number;
  totalQuantity: number;
  maxPerOrder?: number;
  saleStartsAt?: string;
  saleEndsAt?: string;
  isVisible?: boolean;
  sortOrder?: number;
}

export interface UpdateTierDto extends Partial<CreateTierDto> {}
