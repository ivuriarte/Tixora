export type ReservationStatus = 'active' | 'expired' | 'converted' | 'released';

export interface Reservation {
  id: string;
  userId: string;
  tierId: string;
  tierName: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  quantity: number;
  unitPrice: number;
  total: number;
  expiresAt: string;
  status: ReservationStatus;
  createdAt: string;
}

export interface CreateReservationDto {
  tierId: string;
  quantity: number;
  idempotencyKey: string;
}
