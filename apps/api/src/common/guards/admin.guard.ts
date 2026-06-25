import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtPayload } from '@axon-tickets/types';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    if (request.user?.isAdmin) {
      return true;
    }

    const userId = request.user?.sub;
    if (!userId) throw new ForbiddenException('Admin or approved organizer access required');

    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId,
        organization: { approvalStatus: 'approved' },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('Admin or approved organizer access required');
    }

    return true;
  }
}
