/**
 * Which events take one of the homepage's featured slots.
 *
 * This must match the server rule, `visibleFeaturedWhere()` in
 * `apps/api/src/events/events.service.ts`: the event is flagged, its status is one the public
 * carousel shows (`on_sale` or `sold_out`), and `featuredUntil` is empty or still in the future.
 * An event that is flagged but completed, cancelled or draft keeps its flag but does not count
 * against the limit of three, because the homepage would not show it either.
 */
const HOMEPAGE_VISIBLE_STATUSES = ['on_sale', 'sold_out'];

export interface FeaturedSlotEvent {
  isFeatured?: boolean;
  status: string;
  featuredUntil?: string | null;
}

export function takesFeaturedSlot(event: FeaturedSlotEvent, now: Date = new Date()): boolean {
  if (!event.isFeatured) return false;
  if (!HOMEPAGE_VISIBLE_STATUSES.includes(event.status)) return false;
  return !event.featuredUntil || new Date(event.featuredUntil) > now;
}
