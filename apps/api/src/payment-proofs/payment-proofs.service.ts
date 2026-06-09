import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { AuditService } from '../audit/audit.service';
import { FunnelService } from '../funnel/funnel.service';

@Injectable()
export class PaymentProofsService {
  private readonly logger = new Logger(PaymentProofsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
    private readonly audit: AuditService,
    private readonly funnel: FunnelService,
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

    const { imageUrl, cloudinaryPublicId } =
      await this.upload.uploadPaymentProof(registrationId, buffer, mimeType);

    const proof = await this.prisma.$transaction(async (tx) => {
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
      return created;
    });

    await this.audit.log({
      action: 'PROOF_SUBMITTED',
      entityType: 'PaymentProof',
      entityId: proof.id,
      registrationId,
      performedById: userId,
      ipAddress: ip,
      metadata: { imageUrl },
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
