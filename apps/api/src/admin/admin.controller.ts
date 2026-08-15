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
  Req,
  Res,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { AdminService } from './admin.service';
import { CreateEventDto, UpdateEventDto } from '../events/dto/event.dto';
import { CreateTierDto, UpdateTierDto } from '../ticket-tiers/dto/tier.dto';
import { AddOrganizerMemberDto, CheckinDto, RejectRegistrationDto, BulkApproveDto, BulkRejectDto, RejectOrganizerDto, SetUserRoleDto, UpdatePlatformSettingsDto } from './dto/admin.dto';
import { RegistrationsService } from '../registrations/registrations.service';
import { CreateReferralCodeDto, SetReferralCodeStatusDto, UpdateReferralCodeDto } from './dto/referral-code.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly registrationsService: RegistrationsService,
  ) {}

  private requirePlatformAdmin(user: JwtPayload) {
    if (!user.isAdmin) {
      throw new ForbiddenException('Platform admin access required');
    }
  }

  // ── Events ───────────────────────────────────────────────────────────────

  @Get('events')
  @ApiOperation({ summary: 'List all events (admin)' })
  listEvents(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.adminService.listEvents(
      user,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
      organizationId,
    );
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Get full event detail (admin)' })
  getEvent(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.getEvent(id, user);
  }

  @Post('events')
  @ApiOperation({ summary: 'Create event' })
  createEvent(@Body() dto: CreateEventDto, @CurrentUser() user: JwtPayload) {
    return this.adminService.createEvent(dto, user);
  }

  @Put('events/:id')
  @ApiOperation({ summary: 'Update event' })
  updateEvent(@Param('id') id: string, @Body() dto: UpdateEventDto, @CurrentUser() user: JwtPayload) {
    return this.adminService.updateEvent(id, dto, user);
  }

  @Delete('events/:id')
  @ApiOperation({ summary: 'Hard-delete event and all related data' })
  deleteEvent(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.deleteEvent(id, user);
  }

  @Get('events/:id/referral-codes')
  @ApiOperation({ summary: 'List referral codes and usage for an event' })
  listReferralCodes(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.listReferralCodes(id, user);
  }

  @Post('events/:id/referral-codes')
  @ApiOperation({ summary: 'Create an immutable referral code' })
  createReferralCode(
    @Param('id') id: string,
    @Body() dto: CreateReferralCodeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.adminService.createReferralCode(id, dto, user);
  }

  @Patch('events/:eventId/referral-codes/:codeId')
  @ApiOperation({ summary: 'Update mutable referral code fields (name, maxUses, validity window)' })
  updateReferralCode(
    @Param('eventId') eventId: string,
    @Param('codeId') codeId: string,
    @Body() dto: UpdateReferralCodeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.adminService.updateReferralCode(eventId, codeId, dto, user);
  }

  @Delete('events/:eventId/referral-codes/:codeId')
  @ApiOperation({ summary: 'Soft-delete a referral code (existing discounts are preserved)' })
  deleteReferralCode(
    @Param('eventId') eventId: string,
    @Param('codeId') codeId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.adminService.deleteReferralCode(eventId, codeId, user);
  }

  @Patch('events/:eventId/referral-codes/:codeId/status')
  @ApiOperation({ summary: 'Activate or deactivate a referral code' })
  setReferralCodeStatus(
    @Param('eventId') eventId: string,
    @Param('codeId') codeId: string,
    @Body() dto: SetReferralCodeStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.adminService.setReferralCodeStatus(eventId, codeId, dto.isActive, user);
  }

  @Get('events/:id/referral-codes/export')
  @ApiOperation({ summary: 'Export referral-code usage as CSV' })
  async exportReferralCodes(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.exportReferralCodes(id, user);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="referral-usage.csv"');
    res.send(csv);
  }

  // ── Tiers ────────────────────────────────────────────────────────────────

  @Post('events/:eventId/tiers')
  @ApiOperation({ summary: 'Create ticket tier for event' })
  createTier(@Param('eventId') eventId: string, @Body() dto: CreateTierDto, @CurrentUser() user: JwtPayload) {
    return this.adminService.createTier(eventId, dto, user);
  }

  @Put('tiers/:tierId')
  @ApiOperation({ summary: 'Update ticket tier' })
  updateTier(@Param('tierId') tierId: string, @Body() dto: UpdateTierDto, @CurrentUser() user: JwtPayload) {
    return this.adminService.updateTier(tierId, dto, user);
  }

  @Delete('tiers/:tierId')
  @ApiOperation({ summary: 'Delete ticket tier (only if no tickets sold)' })
  deleteTier(@Param('tierId') tierId: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.deleteTier(tierId, user);
  }

  // ── Orders ───────────────────────────────────────────────────────────────

  @Get('orders')
  @ApiOperation({ summary: 'List orders (optionally filter by event/status)' })
  listOrders(
    @CurrentUser() user: JwtPayload,
    @Query('eventId') eventId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listOrders(
      user,
      eventId,
      status,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
  }

  @Get('orders/export')
  @ApiOperation({ summary: 'Export orders as CSV' })
  async exportOrders(
    @CurrentUser() user: JwtPayload,
    @Query('eventId') eventId: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.exportOrders(user, eventId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(csv);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order detail (admin)' })
  getOrder(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.getOrder(id, user);
  }

  @Post('orders/:id/resend-ticket')
  @ApiOperation({ summary: 'Resend ticket confirmation email to buyer' })
  resendTicket(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.resendTicket(id, user);
  }

  @Patch('orders/:id/confirm-payment')
  @ApiOperation({ summary: 'Manually confirm payment for an order (admin only)' })
  manualConfirmPayment(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.manualConfirmPayment(id, user);
  }

  // ── Check-in ─────────────────────────────────────────────────────────────

  @Post('checkin')
  @ApiOperation({ summary: 'Scan QR code and check in attendee' })
  async checkIn(@Body() dto: CheckinDto, @CurrentUser() user: JwtPayload) {
    await this.adminService.assertEventAccess(dto.eventId, user);
    return this.adminService.checkIn(dto.qrToken, dto.eventId, user.sub);
  }

  // ── Attendees ────────────────────────────────────────────────────────────

  @Get('events/:eventId/attendees')
  @ApiOperation({ summary: 'Get attendee list for event' })
  async getAttendees(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    await this.adminService.assertEventAccess(eventId, user);
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
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.exportAttendees(eventId, user);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendees-${eventId}.csv"`);
    res.send(csv);
  }

  @Patch('events/:eventId/attendees/:attendeeId/claim')
  @ApiOperation({ summary: 'Mark or reverse an audited running-event merchandise claim' })
  setAttendeeClaimStatus(
    @Param('eventId') eventId: string,
    @Param('attendeeId') attendeeId: string,
    @Body() body: { claimed?: unknown },
    @CurrentUser() user: JwtPayload,
  ) {
    if (typeof body?.claimed !== 'boolean') {
      throw new BadRequestException('claimed must be a boolean');
    }
    return this.adminService.setAttendeeClaimStatus(
      eventId,
      attendeeId,
      body.claimed,
      user,
    );
  }

  @Get('events/:eventId/merchandise-summary')
  @ApiOperation({ summary: 'Get running-event merchandise totals by distance, race division, and size' })
  getMerchandiseSummary(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.adminService.getMerchandiseSummary(eventId, user);
  }

  @Post('events/:eventId/attendees/nametags')
  @ApiOperation({ summary: 'Generate printable attendee nametags as PDF' })
  async generateAttendeeNametags(
    @Param('eventId') eventId: string,
    @Body() body: { attendeeIds?: unknown },
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    await this.adminService.assertEventAccess(eventId, user);
    if (
      body?.attendeeIds !== undefined &&
      (!Array.isArray(body.attendeeIds) || body.attendeeIds.some((id) => typeof id !== 'string'))
    ) {
      throw new BadRequestException('attendeeIds must be an array of strings');
    }

    const pdf = await this.adminService.generateNametagsPdf(
      eventId,
      body?.attendeeIds as string[] | undefined,
    );
    const date = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="nametags-${eventId}-${date}.pdf"`);
    res.send(pdf);
  }

  @Get('events/:eventId/attendance')
  @ApiOperation({ summary: 'Get daily attendance records for an event' })
  async getDailyAttendance(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Query('date') date?: string,
  ) {
    await this.adminService.assertEventAccess(eventId, user);
    return this.adminService.getDailyAttendance(eventId, date);
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  @Get('analytics/events/:eventId')
  @ApiOperation({ summary: 'Get sales analytics for event' })
  getEventAnalytics(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.getEventAnalytics(eventId, user);
  }

  @Get('analytics/events/:eventId/timeline')
  @ApiOperation({ summary: 'Get daily revenue + sales timeline for an event' })
  getEventTimeline(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Query('days', new DefaultValuePipe(14), ParseIntPipe) days: number,
  ) {
    return this.adminService.getEventTimeline(eventId, user, days);
  }

  @Get('analytics/events/:eventId/funnel')
  @ApiOperation({ summary: 'Get registration funnel counts and recent failures for an event' })
  getEventFunnel(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.getEventFunnel(eventId, user);
  }

  @Get('analytics/dashboard')
  @ApiOperation({ summary: 'Get dashboard-level aggregate stats' })
  getDashboardStats(@CurrentUser() user: JwtPayload, @Query('eventId') eventId?: string) {
    return this.adminService.getDashboardStats(user, eventId);
  }

  // ── Fraud Flags ──────────────────────────────────────────────────────────

  @Get('fraud-flags')
  @ApiOperation({ summary: 'List unresolved fraud flags' })
  getFraudFlags(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.getFraudFlags(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
  }

  @Patch('fraud-flags/:id/resolve')
  @ApiOperation({ summary: 'Mark fraud flag as resolved' })
  resolveFraudFlag(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.requirePlatformAdmin(user);
    return this.adminService.resolveFraudFlag(id);
  }

  // ── Registrations ─────────────────────────────────────────────────────────

  @Get('events/:eventId/registrations')
  @ApiOperation({ summary: 'List registrations for an event' })
  async listRegistrations(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    await this.adminService.assertEventAccess(eventId, user);
    return this.registrationsService.findByEvent(
      eventId,
      status,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 50,
    );
  }

  @Get('events/:eventId/registrations/export')
  @ApiOperation({ summary: 'Export all registrations for an event as CSV (manual payment backup)' })
  async exportRegistrations(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.exportRegistrations(eventId, user);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="registrations-${eventId}.csv"`,
    );
    res.send(csv);
  }

  @Get('registrations/:id')
  @ApiOperation({ summary: 'Get registration detail (admin)' })
  async getRegistration(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.adminService.assertRegistrationAccess(id, user);
    return this.registrationsService.findByIdAdmin(id);
  }

  @Patch('registrations/:id/approve')
  @ApiOperation({ summary: 'Approve a registration (verifies payment proof)' })
  async approveRegistration(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    await this.adminService.assertRegistrationAccess(id, user);
    return this.registrationsService.approve(id, user.sub, req.ip);
  }

  @Patch('registrations/:id/reject')
  @ApiOperation({ summary: 'Reject a registration with a reason' })
  async rejectRegistration(
    @Param('id') id: string,
    @Body() dto: RejectRegistrationDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    await this.adminService.assertRegistrationAccess(id, user);
    return this.registrationsService.reject(id, user.sub, dto.reason, req.ip);
  }

  // ── Verifications Queue (cross-event) ─────────────────────────────────────

  @Get('verifications')
  @ApiOperation({ summary: 'List registrations pending verification (cross-event)' })
  async listVerifications(
    @CurrentUser() user: JwtPayload,
    @Query('eventId') eventId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    if (!user.isAdmin) {
      if (!eventId) throw new BadRequestException('eventId is required');
      await this.adminService.assertEventAccess(eventId, user);
    }
    return this.registrationsService.listPendingVerifications(
      eventId,
      status ?? 'pending_approval',
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 50,
      dateFrom,
      dateTo,
    );
  }

  @Get('verifications/count')
  @ApiOperation({ summary: 'Count of pending verifications (for nav badge)' })
  verificationsCount(@CurrentUser() user: JwtPayload) {
    return this.registrationsService.pendingCount(user.isAdmin ? undefined : user.sub);
  }

  @Post('verifications/bulk-approve')
  @ApiOperation({ summary: 'Approve up to 20 registrations in one call' })
  async bulkApprove(
    @Body() dto: BulkApproveDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    if (!user.isAdmin) {
      await Promise.all(dto.ids.map((id) => this.adminService.assertRegistrationAccess(id, user)));
    }
    return this.registrationsService.bulkApprove(dto.ids, user.sub, req.ip);
  }

  @Post('verifications/bulk-reject')
  @ApiOperation({ summary: 'Reject up to 20 registrations in one call (shared reason)' })
  async bulkReject(
    @Body() dto: BulkRejectDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    if (!user.isAdmin) {
      await Promise.all(dto.ids.map((id) => this.adminService.assertRegistrationAccess(id, user)));
    }
    return this.registrationsService.bulkReject(dto.ids, user.sub, dto.reason, req.ip);
  }

  @Post('registrations/:id/resend')
  @ApiOperation({ summary: 'Resend QR delivery email for a verified registration' })
  async resendRegistration(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    await this.adminService.assertRegistrationAccess(id, user);
    return this.registrationsService.resend(id, user.sub, req.ip);
  }

  // ── Check-in (P6-05, P6-06) ────────────────────────────────────────────────

  @Get('checkin/search')
  @ApiOperation({ summary: 'Search attendees by name/email for manual check-in' })
  async checkinSearch(
    @CurrentUser() user: JwtPayload,
    @Query('eventId') eventId: string,
    @Query('q') q: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    await this.adminService.assertEventAccess(eventId, user);
    return this.adminService.checkinSearch(eventId, q, page, limit);
  }

  @Post('checkin/manual/:attendeeId')
  @ApiOperation({ summary: 'Manually check in an attendee by ID (no QR scan)' })
  async checkinManual(
    @Param('attendeeId') attendeeId: string,
    @Body('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.adminService.assertEventAccess(eventId, user);
    return this.adminService.checkinManual(attendeeId, eventId, user.sub);
  }

  // ── User Management ──────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List all users (admin)' })
  listUsers(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.listUsers(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 50,
    );
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Grant or revoke admin role for a user' })
  setUserRole(
    @Param('id') id: string,
    @Body() dto: SetUserRoleDto,
    @CurrentUser() caller: JwtPayload,
  ) {
    this.requirePlatformAdmin(caller);
    if (id === caller.sub) {
      throw new BadRequestException('You cannot change your own admin role');
    }
    return this.adminService.setAdminRole(id, dto.isAdmin);
  }

  // ── Organizer Management ─────────────────────────────────────────────────

  @Get('organizers')
  @ApiOperation({ summary: 'List organizer applications (optionally filtered by status)' })
  listOrganizers(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.listOrganizers(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
  }

  @Get('organizers/count')
  @ApiOperation({ summary: 'Count of pending organizer applications (for nav badge)' })
  pendingOrganizersCount(@CurrentUser() user: JwtPayload) {
    this.requirePlatformAdmin(user);
    return this.adminService.pendingOrganizersCount();
  }

  @Get('organizers/:id')
  @ApiOperation({ summary: 'Get organizer application detail' })
  getOrganizer(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.requirePlatformAdmin(user);
    return this.adminService.getOrganizer(id);
  }

  @Post('organizers/:id/members')
  @ApiOperation({ summary: 'Grant organizer account access to another email' })
  addOrganizerMember(
    @Param('id') id: string,
    @Body() dto: AddOrganizerMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.addOrganizerMember(id, user.sub, dto.email, dto.role ?? 'admin');
  }

  @Delete('organizers/:id/members/:memberId')
  @ApiOperation({ summary: 'Remove organizer account access for a member' })
  removeOrganizerMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.removeOrganizerMember(id, memberId, user.sub);
  }

  @Patch('organizers/:id/approve')
  @ApiOperation({ summary: 'Approve an organizer application' })
  approveOrganizer(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.requirePlatformAdmin(user);
    return this.adminService.approveOrganizer(id, user.sub);
  }

  @Patch('organizers/:id/reject')
  @ApiOperation({ summary: 'Reject an organizer application with a reason' })
  rejectOrganizer(
    @Param('id') id: string,
    @Body() dto: RejectOrganizerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.rejectOrganizer(id, user.sub, dto.reason);
  }

  @Patch('organizers/:id/suspend')
  @ApiOperation({ summary: 'Suspend an approved organizer account' })
  suspendOrganizer(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.suspendOrganizer(id, user.sub, dto.reason);
  }

  @Patch('organizers/:id/revoke')
  @ApiOperation({ summary: 'Permanently revoke (ban) an organizer account' })
  revokeOrganizer(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.revokeOrganizer(id, user.sub, dto.reason);
  }

  @Patch('organizers/:id/reinstate')
  @ApiOperation({ summary: 'Reinstate a suspended or revoked organizer account' })
  reinstateOrganizer(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.reinstateOrganizer(id, user.sub);
  }

  @Patch('organizers/:id/profile-visibility')
  @ApiOperation({ summary: 'Super Admin takedown or restore of a public organizer profile' })
  setOrganizerProfileVisibility(
    @Param('id') id: string,
    @Body() body: { visible?: unknown },
    @CurrentUser() user: JwtPayload,
  ) {
    this.requirePlatformAdmin(user);
    if (typeof body?.visible !== 'boolean') {
      throw new BadRequestException('visible must be a boolean');
    }
    return this.adminService.setOrganizerProfileVisibility(id, body.visible, user.sub);
  }

  @Delete('organizers/:id')
  @ApiOperation({ summary: 'Permanently delete an organizer account and notify by email' })
  deleteOrganizer(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.deleteOrganizer(id, user.sub);
  }

  // ── Icebreaker (Wheel / Raffle) ──────────────────────────────────────────

  @Get('events/:eventId/wheel-participants')
  @ApiOperation({ summary: 'Get checked-in attendees for the icebreaker wheel/raffle' })
  async getWheelParticipants(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.adminService.assertEventAccess(eventId, user);
    return this.adminService.getWheelParticipants(eventId);
  }

  // ── Platform settings ────────────────────────────────────────────────────

  @Get('settings/platform')
  @ApiOperation({ summary: 'Get platform-wide settings (service fee, etc.)' })
  getPlatformSettings(@CurrentUser() user: JwtPayload) {
    this.requirePlatformAdmin(user);
    return this.adminService.getPlatformSettings();
  }

  @Patch('settings/platform')
  @ApiOperation({ summary: 'Update platform-wide settings. Admin only.' })
  updatePlatformSettings(
    @Body() dto: UpdatePlatformSettingsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.requirePlatformAdmin(user);
    return this.adminService.updatePlatformSettings(dto.serviceFee, user.sub);
  }
}
