import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { OrganizationsService } from './organizations.service';
import { RegisterOrganizationDto } from './dto/organization.dto';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new organizer organization (pending approval)' })
  register(@Body() dto: RegisterOrganizationDto, @CurrentUser() user: JwtPayload) {
    return this.orgsService.register(dto, user.sub);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the organization owned by the current user' })
  getMyOrganization(@CurrentUser() user: JwtPayload) {
    return this.orgsService.getMyOrganization(user.sub);
  }
}
