import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';
import { WorkspacesService } from './workspaces.service';
import {
  CreateWorkspaceItemDto,
  UpdateWorkspaceItemDto,
  ApplyTemplateDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto/workspace.dto';

@ApiTags('workspaces')
@Controller('admin/events/:eventId/workspace')
@UseGuards(JwtAuthGuard, AdminGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ensure workspace exists for event (idempotent)' })
  ensureWorkspace(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workspacesService.ensureWorkspace(eventId, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Get workspace readiness summary' })
  getSummary(@Param('eventId') eventId: string) {
    return this.workspacesService.getWorkspaceSummary(eventId);
  }

  // ── Templates ────────────────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'List available readiness checklist templates' })
  getTemplates() {
    return this.workspacesService.getTemplates();
  }

  @Post('apply-template')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a template — replaces all existing checklist items' })
  applyTemplate(
    @Param('eventId') eventId: string,
    @Body() dto: ApplyTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workspacesService.applyTemplate(eventId, dto.templateId, user.sub);
  }

  // ── Stakeholder report ───────────────────────────────────────────────────

  @Get('report')
  @ApiOperation({ summary: 'Download share-safe stakeholder progress report as PDF' })
  async downloadReport(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const pdf = await this.workspacesService.generateStakeholderReport(eventId, user.sub);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="readiness-report-${eventId}-${date}.pdf"`);
    res.send(pdf);
  }

  @Get('post-event-report')
  @ApiOperation({ summary: 'Download post-event report suite as PDF. Add ?export=external for privacy-safe external export.' })
  async downloadPostEventReport(
    @Param('eventId') eventId: string,
    @Query('export') exportMode: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const isExternal = exportMode === 'external';
    const pdf = await this.workspacesService.generatePostEventReport(eventId, isExternal, user.sub);
    const date = new Date().toISOString().slice(0, 10);
    const suffix = isExternal ? '-external' : '';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="post-event-report${suffix}-${eventId}-${date}.pdf"`);
    res.send(pdf);
  }

  // ── Ownership & overdue ──────────────────────────────────────────────────

  @Get('assignable-users')
  @ApiOperation({ summary: 'List users that can be assigned to workspace items' })
  getAssignableUsers(@Param('eventId') eventId: string) {
    return this.workspacesService.getAssignableUsers(eventId);
  }

  @Get('overdue')
  @ApiOperation({ summary: 'List items that are past their due date and not done' })
  getOverdueItems(@Param('eventId') eventId: string) {
    return this.workspacesService.getOverdueItems(eventId);
  }

  // ── Checklist items ──────────────────────────────────────────────────────

  @Get('items')
  @ApiOperation({ summary: 'Get all checklist items grouped by category' })
  getItems(@Param('eventId') eventId: string) {
    return this.workspacesService.getWorkspaceItems(eventId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add a custom checklist item' })
  createItem(
    @Param('eventId') eventId: string,
    @Body() dto: CreateWorkspaceItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workspacesService.createWorkspaceItem(eventId, dto, user.sub);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update checklist item (status, notes, etc.)' })
  updateItem(
    @Param('eventId') eventId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateWorkspaceItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workspacesService.updateWorkspaceItem(eventId, itemId, dto, user.sub);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a checklist item' })
  deleteItem(
    @Param('eventId') eventId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workspacesService.deleteWorkspaceItem(eventId, itemId, user.sub);
  }

  // ── Milestones ───────────────────────────────────────────────────────────

  @Get('milestones')
  @ApiOperation({ summary: 'Get all milestones for the workspace' })
  getMilestones(@Param('eventId') eventId: string) {
    return this.workspacesService.getMilestones(eventId);
  }

  @Post('milestones')
  @ApiOperation({ summary: 'Add a milestone' })
  createMilestone(
    @Param('eventId') eventId: string,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.workspacesService.createMilestone(eventId, dto);
  }

  @Patch('milestones/:milestoneId')
  @ApiOperation({ summary: 'Update a milestone' })
  updateMilestone(
    @Param('eventId') eventId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.workspacesService.updateMilestone(eventId, milestoneId, dto);
  }

  @Delete('milestones/:milestoneId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a milestone' })
  deleteMilestone(
    @Param('eventId') eventId: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return this.workspacesService.deleteMilestone(eventId, milestoneId);
  }
}
