import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    // Use real IP if behind proxy (Railway sets X-Forwarded-For)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0].trim();
    }
    return req.ip ?? 'unknown';
  }

  protected getRequestResponse(context: ExecutionContext) {
    const http = context.switchToHttp();
    return { req: http.getRequest<Request>(), res: http.getResponse() };
  }
}
