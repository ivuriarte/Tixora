import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CreateFunnelEventDto } from './dto/create-funnel-event.dto';
import { FunnelService } from './funnel.service';

@ApiTags('funnel')
@Controller('funnel')
export class FunnelController {
  constructor(private readonly funnel: FunnelService) {}

  @Public()
  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  @ApiOperation({ summary: 'Record a client-side registration funnel event' })
  async trackEvent(@Body() dto: CreateFunnelEventDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'] as string | undefined;
    const referrer = (req.headers['referer'] as string | undefined) ?? null;

    await this.funnel.track(
      {
        eventId: dto.eventId,
        sessionId: dto.sessionId,
        email: dto.email,
        step: dto.step,
        status: dto.status,
        metadata: dto.metadata,
      },
      { userAgent, referrer: referrer ?? undefined },
    );

    return { accepted: true };
  }
}
