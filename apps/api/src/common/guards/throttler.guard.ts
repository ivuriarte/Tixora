import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    // x-real-ip is set by Vercel's edge network and cannot be spoofed by clients.
    // Prefer it over x-forwarded-for to prevent rate-limit bypass via IP rotation.
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim();
    }
    // Fallback: take the LAST entry in x-forwarded-for, which is appended by
    // the trusted reverse proxy, not the client.
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      const ips = forwardedFor.split(',');
      return ips[ips.length - 1].trim();
    }
    return req.ip ?? 'unknown';
  }

  protected getRequestResponse(context: ExecutionContext) {
    const http = context.switchToHttp();
    return { req: http.getRequest<Request>(), res: http.getResponse() };
  }
}
