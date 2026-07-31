import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { RegistrationsService } from './registrations.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { UpdateRegistrationAttendeesDto } from './dto/update-registration-attendees.dto';
import {
  ClaimRegistrationDto,
  ConfirmGuestCheckoutDto,
  RequestGuestCheckoutCodeDto,
} from './dto/checkout-confirmation.dto';
import { ValidateReferralCodeDto } from '../admin/dto/referral-code.dto';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('registrations')
@Controller('registrations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new registration (manual-payment flow)' })
  create(
    @Body() dto: CreateRegistrationDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-real-ip'] as string | undefined)?.trim() ??
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',').pop()?.trim() ??
      req.ip ??
      '';
    return this.registrationsService.create(dto, user.sub, ip);
  }

  @Public()
  @Post('guest')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Create a consent-declined guest registration intent' })
  createGuest(@Body() dto: CreateRegistrationDto, @Req() req: Request) {
    const ip =
      (req.headers['x-real-ip'] as string | undefined)?.trim() ??
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',').pop()?.trim() ??
      req.ip ??
      '';
    return this.registrationsService.createGuest(dto, ip);
  }

  @Public()
  @Post('guest-intent')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Create an anonymous paid checkout intent' })
  createGuestIntent(@Body() dto: CreateRegistrationDto, @Req() req: Request) {
    const ip =
      (req.headers['x-real-ip'] as string | undefined)?.trim() ??
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',').pop()?.trim() ??
      req.ip ??
      '';
    return this.registrationsService.createGuestIntent(dto, ip);
  }

  @Public()
  @Get('guest/:id')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Get a guest-owned registration using its scoped access token' })
  findGuest(
    @Param('id') id: string,
    @Headers('x-registration-token') token?: string,
  ) {
    return this.registrationsService.findGuestById(id, token);
  }

  @Public()
  @Patch('guest/:id/attendees')
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  @ApiOperation({ summary: 'Complete guest attendee details using a scoped access token' })
  updateGuestAttendees(
    @Param('id') id: string,
    @Body() dto: UpdateRegistrationAttendeesDto,
    @Headers('x-registration-token') token?: string,
  ) {
    return this.registrationsService.updateGuestAttendees(id, token, dto);
  }

  @Public()
  @Post('guest/:id/request-confirmation-code')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a confirmation code without creating an account' })
  requestGuestConfirmationCode(
    @Param('id') id: string,
    @Body() dto: RequestGuestCheckoutCodeDto,
    @Headers('x-registration-token') token?: string,
  ) {
    return this.registrationsService.requestGuestConfirmationCode(id, token, dto.email);
  }

  @Public()
  @Post('guest/:id/confirm')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify guest email ownership and finalize attendee details' })
  confirmGuestCheckout(
    @Param('id') id: string,
    @Body() dto: ConfirmGuestCheckoutDto,
    @Headers('x-registration-token') token?: string,
  ) {
    return this.registrationsService.confirmGuestCheckout(id, token, dto);
  }

  @Post('validate-referral')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate an event referral code and preview its discount' })
  validateReferral(@Body() dto: ValidateReferralCodeDto) {
    return this.registrationsService.validateReferralCode(dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'List my registrations' })
  findMine(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.registrationsService.findMine(
      user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 50) : 20,
    );
  }

  @Get('check')
  @ApiOperation({ summary: 'Check if the current user has an active registration for an event' })
  checkForEvent(
    @CurrentUser() user: JwtPayload,
    @Query('eventId') eventId: string,
  ) {
    return this.registrationsService.checkForEvent(user.sub, eventId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get registration detail' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.registrationsService.findById(id, user.sub);
  }

  @Patch(':id/attendees')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update attendee details for a pending registration' })
  updateAttendees(
    @Param('id') id: string,
    @Body() dto: UpdateRegistrationAttendeesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.registrationsService.updateAttendees(id, user.sub, dto);
  }

  @Patch(':id/claim-and-complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim a guest checkout after OTP and finalize attendee details' })
  claimAndComplete(
    @Param('id') id: string,
    @Body() dto: ClaimRegistrationDto,
    @CurrentUser() user: JwtPayload,
    @Headers('x-registration-token') token?: string,
  ) {
    return this.registrationsService.claimAndComplete(id, token, user.sub, dto);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending registration' })
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.registrationsService.cancel(id, user.sub);
  }
}
