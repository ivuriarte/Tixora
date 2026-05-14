import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtPayload } from '@tixora/types';
import { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    if (!request.user?.isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
