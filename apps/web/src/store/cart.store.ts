import { create } from 'zustand';

interface CartStore {
  reservationId: string | null;
  tierId: string | null;
  tierName: string | null;
  quantity: number;
  unitPrice: number;
  eventSlug: string | null;
  expiresAt: Date | null;

  setReservation: (
    reservationId: string,
    tierId: string,
    tierName: string,
    quantity: number,
    unitPrice: number,
    eventSlug: string,
    expiresAt: Date,
  ) => void;

  clearCart: () => void;
}

export const useCartStore = create<CartStore>((set) => ({
  reservationId: null,
  tierId: null,
  tierName: null,
  quantity: 0,
  unitPrice: 0,
  eventSlug: null,
  expiresAt: null,

  setReservation: (reservationId, tierId, tierName, quantity, unitPrice, eventSlug, expiresAt) =>
    set({ reservationId, tierId, tierName, quantity, unitPrice, eventSlug, expiresAt }),

  clearCart: () =>
    set({
      reservationId: null,
      tierId: null,
      tierName: null,
      quantity: 0,
      unitPrice: 0,
      eventSlug: null,
      expiresAt: null,
    }),
}));
