export type TicketStatus = 'valid' | 'used' | 'cancelled' | 'refunded';

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
