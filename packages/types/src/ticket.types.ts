import type { RegistrationLineItem } from './inclusion.types';

export type TicketStatus = 'valid' | 'used' | 'cancelled' | 'refunded';

export type AccountTicketStatus = TicketStatus | 'revoked' | 'pending_qr';

/** Customer account ticket returned by the combined legacy-order/registration feed. */
export interface AccountTicketSummary {
  id: string;
  source: 'order' | 'registration';
  eventTitle: string;
  eventSlug: string;
  eventStartsAt: string;
  eventVenue: string;
  eventImageUrl?: string | null;
  tierName: string;
  attendeeName?: string;
  qrToken: string;
  status: AccountTicketStatus;
  checkedInAt: string | null;
  createdAt: string;
  inclusionCount?: number;
  inclusionSubtotal?: number;
}

export interface AccountTicketDetail extends AccountTicketSummary {
  lineItems?: RegistrationLineItem[];
}

export interface Ticket {
  id: string;
  orderId: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventStartsAt: string;
  eventVenue: string;
  eventImageUrl: string | null;
  tierName: string;
  qrToken: string;
  status: TicketStatus;
  checkedInAt: string | null;
  createdAt: string;
}

export interface CheckinResult {
  valid: boolean;
  attendeeName: string;
  tierName: string;
  eventTitle: string;
  checkedInAt: string;
}
