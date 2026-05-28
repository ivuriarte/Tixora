import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { EventsService } from './events.service';
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
  findOne(@Param('slug') slug: string) {
    return this.eventsService.findBySlug(slug);
  }
}
