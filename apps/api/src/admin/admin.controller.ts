import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { AdminService } from './admin.service';
import { CreateEventDto, UpdateEventDto } from '../events/dto/event.dto';
import { CreateTierDto, UpdateTierDto } from '../ticket-tiers/dto/tier.dto';
import { CheckinDto } from './dto/admin.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Events ───────────────────────────────────────────────────────────────

  @Get('events')
  @ApiOperation({ summary: 'List all events (admin)' })
  listEvents(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listEvents(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
  }

  @Post('events')
  @ApiOperation({ summary: 'Create event' })
  createEvent(@Body() dto: CreateEventDto, @CurrentUser() user: JwtPayload) {
    return this.adminService.createEvent(dto, user.sub);
  }

  @Put('events/:id')
  @ApiOperation({ summary: 'Update event' })
  updateEvent(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.adminService.updateEvent(id, dto);
  }

  @Delete('events/:id')
  @ApiOperation({ summary: 'Cancel / soft-delete event' })
  cancelEvent(@Param('id') id: string) {
    return this.adminService.cancelEvent(id);
  }

  // ── Tiers ────────────────────────────────────────────────────────────────

  @Post('events/:eventId/tiers')
  @ApiOperation({ summary: 'Create ticket tier for event' })
  createTier(@Param('eventId') eventId: string, @Body() dto: CreateTierDto) {
    return this.adminService.createTier(eventId, dto);
  }

  @Put('tiers/:tierId')
  @ApiOperation({ summary: 'Update ticket tier' })
  updateTier(@Param('tierId') tierId: string, @Body() dto: UpdateTierDto) {
    return this.adminService.updateTier(tierId, dto);
  }

  @Delete('tiers/:tierId')
  @ApiOperation({ summary: 'Delete ticket tier (only if no tickets sold)' })
  deleteTier(@Param('tierId') tierId: string) {
    return this.adminService.deleteTier(tierId);
  }

  // ── Orders ───────────────────────────────────────────────────────────────

  @Get('orders')
  @ApiOperation({ summary: 'List orders (optionally filter by event/status)' })
  listOrders(
    @Query('eventId') eventId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listOrders(
      eventId,
      status,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
  }

  @Get('orders/export')
  @ApiOperation({ summary: 'Export orders as CSV' })
  async exportOrders(
    @Query('eventId') eventId: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.exportOrders(eventId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(csv);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order detail (admin)' })
  getOrder(@Param('id') id: string) {
    return this.adminService.getOrder(id);
  }

  @Post('orders/:id/resend-ticket')
  @ApiOperation({ summary: 'Resend ticket confirmation email to buyer' })
  resendTicket(@Param('id') id: string) {
    return this.adminService.resendTicket(id);
  }

  @Patch('orders/:id/confirm-payment')
  @ApiOperation({ summary: 'Manually confirm payment for an order (admin only)' })
  manualConfirmPayment(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.manualConfirmPayment(id, user.sub);
  }

  // ── Check-in ─────────────────────────────────────────────────────────────

  @Post('checkin')
  @ApiOperation({ summary: 'Scan QR code and check in attendee' })
  checkIn(@Body() dto: CheckinDto, @CurrentUser() user: JwtPayload) {
    return this.adminService.checkIn(dto.qrToken, user.sub);
  }

  // ── Attendees ────────────────────────────────────────────────────────────

  @Get('events/:eventId/attendees')
  @ApiOperation({ summary: 'Get attendee list for event' })
  getAttendees(
    @Param('eventId') eventId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.adminService.getAttendees(
      eventId,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 50,
      q,
    );
  }

  @Get('events/:eventId/attendees/export')
  @ApiOperation({ summary: 'Export attendees as CSV' })
  async exportAttendees(
    @Param('eventId') eventId: string,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.exportAttendees(eventId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendees-${eventId}.csv"`);
    res.send(csv);
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  @Get('analytics/events/:eventId')
  @ApiOperation({ summary: 'Get sales analytics for event' })
  getEventAnalytics(@Param('eventId') eventId: string) {
    return this.adminService.getEventAnalytics(eventId);
  }

  @Get('analytics/dashboard')
  @ApiOperation({ summary: 'Get dashboard-level aggregate stats' })
  getDashboardStats(@Query('eventId') eventId?: string) {
    return this.adminService.getDashboardStats(eventId);
  }

  // ── Fraud Flags ──────────────────────────────────────────────────────────

  @Get('fraud-flags')
  @ApiOperation({ summary: 'List unresolved fraud flags' })
  getFraudFlags(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getFraudFlags(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
  }

  @Patch('fraud-flags/:id/resolve')
  @ApiOperation({ summary: 'Mark fraud flag as resolved' })
  resolveFraudFlag(@Param('id') id: string) {
    return this.adminService.resolveFraudFlag(id);
  }
}
