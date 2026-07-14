import { Body, Controller, Get, Post, Query, Param, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { EventsService } from './events.service';
import { OnsiteProfileSuggestionDto, OnsiteRegistrationDto } from './dto/event.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('events')
@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @Get('featured')
  @ApiOperation({ summary: 'List currently-featured events for the homepage hero' })
  findFeatured() {
    return this.eventsService.findFeatured();
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published events' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.eventsService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 50) : 20,
    );
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get event details by slug' })
  @ApiQuery({ name: 'eventId', required: false })
  findOne(@Param('slug') slug: string, @Query('eventId') eventId?: string) {
    return this.eventsService.findBySlug(slug, eventId);
  }

  @Public()
  @Post(':slug/onsite-registration')
  @ApiOperation({ summary: 'Self-register or check in from an event on-site QR code' })
  onsiteRegistration(@Param('slug') slug: string, @Body() dto: OnsiteRegistrationDto) {
    return this.eventsService.handleOnsiteRegistrationScan(slug, dto);
  }

  @Public()
  @Post(':slug/onsite-registration/suggestions')
  @ApiOperation({ summary: 'Find a prior on-site attendee profile for repeat-day registration' })
  onsiteProfileSuggestion(@Param('slug') slug: string, @Body() dto: OnsiteProfileSuggestionDto) {
    return this.eventsService.findOnsiteProfileSuggestion(slug, dto);
  }

  @Public()
  @Get(':slug/onsite-registration/qr.pdf')
  @ApiOperation({ summary: 'Download a printable on-site registration QR PDF' })
  @ApiQuery({ name: 'eventId', required: false })
  async onsiteQrPdf(@Param('slug') slug: string, @Query('eventId') eventId: string | undefined, @Res() res: Response) {
    const pdf = await this.eventsService.generateOnsiteQrPdf(slug, eventId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Content-Length': pdf.buffer.length.toString(),
    });
    res.end(pdf.buffer);
  }
}
