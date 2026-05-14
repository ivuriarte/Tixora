export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded' | 'failed';

export interface OrderItem {
  id: string;
  tierId: string;
  tierName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  userId: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventStartsAt: string;
  eventVenue: string;
  status: OrderStatus;
  subtotal: number;
  fees: number;
  total: number;
  currency: string;
  paymentMethod: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderDto {
  reservationId: string;
  paymentMethod: 'gcash' | 'maya' | 'card' | 'free';
  idempotencyKey: string;
}

export interface PaymentIntentResponse {
  orderId: string;
  paymentUrl: string;
  provider: string;
  amount: number;
  currency: string;
}
