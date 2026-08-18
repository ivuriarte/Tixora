import { Controller, Post, Get, Body, UseGuards, Patch, Delete, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { OrganizationsService } from './organizations.service';
import {
  RegisterOrganizationDto,
  UpdateOrganizationDto,
  AddOrganizationMemberDto,
  UpdateOrganizationMemberDto,
} from './dto/organization.dto';

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

  @Get('me/members')
  @ApiOperation({ summary: 'List the current organizer team and verification status' })
  getMyTeam(@CurrentUser() user: JwtPayload) {
    return this.orgsService.getMyTeam(user.sub);
  }

  @Post('me/members')
  @ApiOperation({ summary: 'Add or invite a member to the current organizer team' })
  addMyTeamMember(@Body() dto: AddOrganizationMemberDto, @CurrentUser() user: JwtPayload) {
    return this.orgsService.addMyTeamMember(user.sub, dto.email, dto.role ?? 'member');
  }

  @Patch('me/members/:memberId')
  @ApiOperation({ summary: 'Change a team member role' })
  updateMyTeamMember(
    @Param('memberId') memberId: string,
    @Body() dto: UpdateOrganizationMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orgsService.updateMyTeamMember(user.sub, memberId, dto.role);
  }

  @Delete('me/members/:memberId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a team member and unassign their workspace tasks' })
  removeMyTeamMember(@Param('memberId') memberId: string, @CurrentUser() user: JwtPayload) {
    return this.orgsService.removeMyTeamMember(user.sub, memberId);
  }
}
