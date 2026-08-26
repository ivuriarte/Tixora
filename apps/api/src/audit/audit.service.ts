import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private data(params: {
    action: string;
    entityType: string;
    entityId: string;
    registrationId?: string;
    performedById?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }): Prisma.AuditLogUncheckedCreateInput {
    return params as Prisma.AuditLogUncheckedCreateInput;
  }

  async log(params: {
    action: string;
    entityType: string;
    entityId: string;
    registrationId?: string;
    performedById?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({ data: this.data(params) });
  }

  /** Writes the audit record on the caller's transaction boundary. */
  async logWith(
    tx: Pick<Prisma.TransactionClient, 'auditLog'>,
    params: {
      action: string;
      entityType: string;
      entityId: string;
      registrationId?: string;
      performedById?: string;
      metadata?: Record<string, unknown>;
      ipAddress?: string;
    },
  ): Promise<void> {
    await tx.auditLog.create({ data: this.data(params) });
  }
}
