import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@Controller('tickets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tickets for current user' })
  myTickets(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ticketsService.findByUser(
      user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 50) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket details (includes QR token for rendering)' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ticketsService.findOne(id, user.sub);
  }
}
