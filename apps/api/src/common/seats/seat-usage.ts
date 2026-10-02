/**
 * The one definition of "seats in use" for a ticket tier.
 *
 * Seats are the `attendeeCount` of registrations in an active status, plus issued tickets
 * (`valid`/`used`). Public availability, the registration capacity check, the admin
 * breakdown and the capacity guard all use these constants, so they cannot drift apart.
 *
 * Admin labels: confirmed = "Sold", awaitingReview = "Awaiting review",
 * held = "Pending payment". reserved = their sum (what public availability uses).
 */
export const ACTIVE_REGISTRATION_STATUSES = [
  'pending_payment',
  'proof_submitted',
  'pending_approval',
  'verified',
] as const;

export const VALID_TICKET_STATUSES = ['valid', 'used'] as const;

const AWAITING_REVIEW_STATUSES: ReadonlyArray<string> = ['proof_submitted', 'pending_approval'];

export interface SeatBreakdown {
  confirmed: number;
  awaitingReview: number;
  held: number;
}

export const emptySeatBreakdown = (): SeatBreakdown => ({ confirmed: 0, awaitingReview: 0, held: 0 });

export const reservedSeats = (b: SeatBreakdown): number => b.confirmed + b.awaitingReview + b.held;

export interface RegistrationSeatRow {
  tierId: string | null;
  status: string;
  seats: number;
}

export interface TicketSeatRow {
  tierId: string | null;
  count: number;
}

/** Pure: turns grouped rows into one breakdown per tier id. Unknown/inactive statuses count nowhere. */
export function buildSeatBreakdowns(
  tierIds: string[],
  registrations: RegistrationSeatRow[],
  tickets: TicketSeatRow[],
): Map<string, SeatBreakdown> {
  const result = new Map<string, SeatBreakdown>();
  for (const id of tierIds) result.set(id, emptySeatBreakdown());

  for (const row of registrations) {
    if (!row.tierId) continue;
    const entry = result.get(row.tierId);
    if (!entry) continue;
    if (row.status === 'verified') entry.confirmed += row.seats;
    else if (AWAITING_REVIEW_STATUSES.includes(row.status)) entry.awaitingReview += row.seats;
    else if (row.status === 'pending_payment') entry.held += row.seats;
  }
  for (const row of tickets) {
    if (!row.tierId) continue;
    const entry = result.get(row.tierId);
    if (entry) entry.confirmed += row.count;
  }
  return result;
}

/**
 * The slice of the Prisma client (or a transaction client) the query needs. Typed loosely on
 * purpose: PrismaService and Prisma.TransactionClient both satisfy it structurally, and the
 * result rows are read through explicit field access below.
 */
export interface SeatQueryClient {
  registration: { groupBy: (args: any) => Promise<any[]> };
  ticket: { groupBy: (args: any) => Promise<any[]> };
}

/**
 * ONE registration groupBy and ONE ticket groupBy for all tier ids, however many tiers.
 * Admin/organizer use only: never call this from a public code path.
 */
export async function querySeatBreakdowns(
  client: SeatQueryClient,
  tierIds: string[],
): Promise<Map<string, SeatBreakdown>> {
  if (tierIds.length === 0) return new Map();
  const [registrations, tickets] = await Promise.all([
    client.registration.groupBy({
      by: ['tierId', 'status'],
      where: { tierId: { in: tierIds }, status: { in: [...ACTIVE_REGISTRATION_STATUSES] } },
      _sum: { attendeeCount: true },
    }),
    client.ticket.groupBy({
      by: ['ticketTierId'],
      where: { ticketTierId: { in: tierIds }, status: { in: [...VALID_TICKET_STATUSES] } },
      _count: { id: true },
    }),
  ]);
  return buildSeatBreakdowns(
    tierIds,
    registrations.map((r) => ({ tierId: r.tierId, status: r.status, seats: Number(r._sum?.attendeeCount ?? 0) })),
    tickets.map((t) => ({ tierId: t.ticketTierId, count: typeof t._count === 'object' ? (t._count.id ?? 0) : 0 })),
  );
}
