import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { AuditService } from '../audit/audit.service';
import { FunnelService } from '../funnel/funnel.service';
import { OptionalInclusionsService } from '../optional-inclusions/optional-inclusions.service';

@Injectable()
export class PaymentProofsService {
  private readonly logger = new Logger(PaymentProofsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
    private readonly audit: AuditService,
    private readonly funnel: FunnelService,
    private readonly optionalInclusions: OptionalInclusionsService,
  ) {}

  async create(
    registrationId: string,
    userId: string,
    buffer: Buffer,
    mimeType: string,
    ip?: string,
    userAgent?: string,
    referrer?: string,
  ) {
    this.logger.log({ msg: 'Payment proof submission requested', registrationId, userId });

    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, userId: true, status: true, eventId: true, total: true, attendeeCount: true },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.userId !== userId) {
      throw new ForbiddenException('You do not own this registration');
    }
    if (!['pending_payment', 'rejected'].includes(reg.status)) {
      throw new BadRequestException(
        `Cannot upload proof for a ${reg.status} registration`,
      );
    }
    if (reg.status === 'rejected') {
      await this.optionalInclusions.assertReservationsCanResubmit(registrationId);
    }

    const { imageUrl, cloudinaryPublicId } =
      await this.upload.uploadPaymentProof(registrationId, buffer, mimeType);

    const proof = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM registrations WHERE id = ${registrationId} FOR UPDATE`);
      const current = await tx.registration.findUnique({
        where: { id: registrationId },
        select: { status: true },
      });
      if (!current || !['pending_payment', 'rejected'].includes(current.status)) {
        throw new BadRequestException('Registration is no longer accepting payment proof');
      }
      if (current.status === 'rejected') {
        await this.optionalInclusions.assertReservationsCanResubmitTx(tx, registrationId);
      }
      const created = await tx.paymentProof.create({
        data: {
          registrationId,
          imageUrl,
          cloudinaryPublicId,
          status: 'pending',
        },
      });
      await tx.registration.update({
        where: { id: registrationId },
        data: { status: 'proof_submitted', rejectionReason: null },
      });
      await this.optionalInclusions.markProofSubmittedReviewTx(tx, registrationId);
      await this.audit.logWith(tx, {
        action: 'PROOF_SUBMITTED',
        entityType: 'PaymentProof',
        entityId: created.id,
        registrationId,
        performedById: userId,
        ipAddress: ip,
        metadata: { imageUrl },
      });
      return created;
    });

    await this.funnel.track(
      {
        eventId: reg.eventId,
        userId,
        step: 'payment_submitted',
        status: 'success',
        metadata: {
          registrationId,
          amount: Number(reg.total),
          attendeeCount: reg.attendeeCount,
        },
      },
      { userAgent, referrer },
    );

    await this.funnel.track(
      {
        eventId: reg.eventId,
        userId,
        step: 'registration_submitted_for_review',
        status: 'success',
        metadata: {
          registrationId,
          amount: Number(reg.total),
        },
      },
      { userAgent, referrer },
    );

    this.logger.log({
      msg: 'Payment proof submitted',
      proofId: proof.id,
      registrationId,
    });

    return {
      id: proof.id,
      registrationId: proof.registrationId,
      imageUrl: proof.imageUrl,
      status: proof.status,
      uploadedAt: proof.createdAt.toISOString(),
    };
  }
}
