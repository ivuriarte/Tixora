import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    action: string;
    entityType: string;
    entityId: string;
    registrationId?: string;
    performedById?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: params as Prisma.AuditLogUncheckedCreateInput,
    });
  }
}
