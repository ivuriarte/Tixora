import { Controller, Post, Get, Body, UseGuards, Patch, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { OrganizationsService } from './organizations.service';
import { RegisterOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a new organizer organization (pending approval)' })
  register(@Body() dto: RegisterOrganizationDto, @CurrentUser() user: JwtPayload) {
    return this.orgsService.register(dto, user.sub);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the organization owned by the current user' })
  getMyOrganization(@CurrentUser() user: JwtPayload) {
    return this.orgsService.getMyOrganization(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the organization owned by the current user' })
  updateMyOrganization(@Body() dto: UpdateOrganizationDto, @CurrentUser() user: JwtPayload) {
    return this.orgsService.updateMyOrganization(dto, user.sub);
  }

  @Public()
  @Get('public/:slug')
  @ApiOperation({ summary: 'Get an approved public organizer profile and upcoming events' })
  getPublicProfile(@Param('slug') slug: string) {
    return this.orgsService.getPublicProfile(slug);
  }
}
