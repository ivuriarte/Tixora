import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
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

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending registration' })
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.registrationsService.cancel(id, user.sub);
  }
}

