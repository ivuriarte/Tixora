export type InclusionFulfillmentMethod = 'pickup' | 'delivery' | 'digital' | 'manual';

export type InclusionFulfillmentStatus =
  | 'pending'
  | 'fulfilled'
  | 'reversed'
  | 'cancelled';

export interface EventInclusionVariant {
  id: string;
  name: string;
  sku?: string | null;
  price: number;
  currency?: string;
  availableQuantity: number;
  maxPerRegistration?: number | null;
  isSoldOut?: boolean;
  isActive?: boolean;
}

/** A separately selectable event add-on. This is not a ticket-tier included benefit. */
export interface EventOptionalInclusion {
  id: string;
  name: string;
  description?: string | null;
  fulfillmentMethod?: InclusionFulfillmentMethod | null;
  fulfillmentInstructions?: string | null;
  eligibleTierIds?: string[];
  tierEligibility?: Array<{
    tierId: string;
    maxQuantityPerRegistration?: number | null;
  }>;
  maxPerRegistration?: number | null;
  variants: EventInclusionVariant[];
}

export interface InclusionSelection {
  inclusionId: string;
  variantId: string;
  quantity: number;
  /** Zero-based index in the registration attendee array. */
  attendeeIndex?: number;
}

export type RegistrationLineItemKind = 'admission' | 'inclusion' | 'fee' | 'discount';

export interface RegistrationLineItem {
  id?: string;
  kind: RegistrationLineItemKind;
  name: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  currency?: string;
  attendeeIndex?: number | null;
  attendeeId?: string | null;
  attendeeName?: string | null;
  fulfillmentMethod?: InclusionFulfillmentMethod | null;
  fulfillmentStatus?: InclusionFulfillmentStatus | null;
  fulfillmentInstructions?: string | null;
}

export interface InclusionQuote {
  token: string;
  expiresAt: string;
  lineItems: RegistrationLineItem[];
  admissionSubtotal: number;
  inclusionSubtotal: number;
  discount: number;
  fees: number;
  total: number;
  currency: string;
}

export interface CreateInclusionQuoteDto {
  tierId: string;
  attendeeCount: number;
  selections: InclusionSelection[];
  referralCode?: string;
}
