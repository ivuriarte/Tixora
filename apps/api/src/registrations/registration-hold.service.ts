import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OptionalInclusionsService } from '../optional-inclusions/optional-inclusions.service';
import { GuestHoldService } from './guest-hold.service';

export type HoldAuditAction =
  | 'REGISTRATION_AUTO_CANCELLED'
  | 'REGISTRATION_CANCELLED'
  | 'REGISTRATION_HOLD_RELEASED';

export interface ReleaseHoldOptions {
  /** Text recorded in the audit metadata and passed to the add-on release. */
  reason: string;
  auditAction: HoldAuditAction;
  /** Add-on stock movement type: 'expire' for automatic paths, 'release' for people. */
  inclusionMovement?: 'release' | 'expire';
  actorUserId?: string;
  /** Only release a guest checkout (userId IS NULL). Used by the guest-facing cancel. */
  guestOnly?: boolean;
  /** Extra audit metadata. Never put emails, tokens or secrets here. */
  metadata?: Record<string, unknown>;
}

export type ReleaseHoldResult =
  | { released: true }
  | { released: false; why: 'not_found' | 'not_pending' | 'has_proof' | 'not_guest' };

/**
 * The one place that turns an unpaid `pending_payment` registration into `cancelled`
 * and gives its seats back. Used by the cleanup job (both rules), the early-bird
 * cancel, the guest cancel and the admin "release hold" so they cannot drift apart.
 *
 * Inside one transaction it: locks the registration row, re-checks that it is still
 * an unpaid hold with no payment proof, releases add-on stock, cancels it, clears the
 * unverified resume email, returns admission capacity, and writes the audit row.
 * Lock order is registration, then ticket tier (same as the rest of the codebase).
 */
@Injectable()
export class RegistrationHoldService {
  private readonly logger = new Logger(RegistrationHoldService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly guestHold: GuestHoldService,
    @Optional() private readonly optionalInclusions?: OptionalInclusionsService,
  ) {}

  async releasePendingHold(
    registrationId: string,
    options: ReleaseHoldOptions,
  ): Promise<ReleaseHoldResult> {
    const result = await this.prisma.$transaction(async (tx): Promise<ReleaseHoldResult> => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM registrations WHERE id = ${registrationId} FOR UPDATE`,
      );
      const current = await tx.registration.findUnique({
        where: { id: registrationId },
        select: { status: true, userId: true, tierId: true, attendeeCount: true },
      });
      if (!current) return { released: false, why: 'not_found' };
      if (current.status !== 'pending_payment') return { released: false, why: 'not_pending' };
      if (options.guestOnly && current.userId !== null) return { released: false, why: 'not_guest' };
      const proofs = await tx.paymentProof.count({ where: { registrationId } });
      if (proofs > 0) return { released: false, why: 'has_proof' };

      await this.optionalInclusions?.releaseRegistrationReservationsTx(
        tx,
        registrationId,
        options.reason,
        options.inclusionMovement ?? 'release',
        options.actorUserId,
      );
      await tx.registration.update({
        where: { id: registrationId },
        data: { status: 'cancelled', guestResumeEmail: null },
      });

      if (current.tierId) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM ticket_tiers WHERE id = ${current.tierId} FOR UPDATE`,
        );
        const tier = await tx.ticketTier.findUnique({
          where: { id: current.tierId },
          select: { soldQuantity: true },
        });
        if (tier) {
          await tx.ticketTier.update({
            where: { id: current.tierId },
            data: { soldQuantity: Math.max(0, tier.soldQuantity - current.attendeeCount) },
          });
        }
      }

      await this.audit.logWith(tx, {
        action: options.auditAction,
        entityType: 'Registration',
        entityId: registrationId,
        registrationId,
        performedById: options.actorUserId,
        metadata: { reason: options.reason, ...(options.metadata ?? {}) },
      });
      return { released: true };
    });

    if (result.released) {
      // Outside the transaction and best effort: never fails a release.
      await this.guestHold.releaseSlot(registrationId);
      this.logger.log({ msg: 'Pending hold released', registrationId, action: options.auditAction });
    }
    return result;
  }
}
