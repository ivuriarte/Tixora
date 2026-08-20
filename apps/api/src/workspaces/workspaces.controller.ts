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
import { EventAccessService } from '../common/services/event-access.service';
import { JwtPayload } from '@axon-tickets/types';
import { WorkspacesService } from './workspaces.service';
import {
  CreateWorkspaceItemDto,
  UpdateWorkspaceItemDto,
  ApplyTemplateDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
  CreateWorkspaceCategoryDto,
  UpdateWorkspaceCategoryDto,
  CreateWorkspaceTaskUpdateDto,
} from './dto/workspace.dto';

@ApiTags('workspaces')
@Controller('admin/events/:eventId/workspace')
@UseGuards(JwtAuthGuard, AdminGuard)
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly eventAccess: EventAccessService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ensure workspace exists for event (idempotent)' })
  async ensureWorkspace(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
    return this.workspacesService.ensureWorkspace(eventId, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Get workspace readiness summary' })
  async getSummary(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    await this.eventAccess.assertEventAccess(eventId, user);
    return this.workspacesService.getWorkspaceSummary(eventId, user);
  }

  // ── Team ─────────────────────────────────────────────────────────────────

  @Get('members')
  @ApiOperation({ summary: 'List event team members and their workspace role' })
  async getWorkspaceMembers(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    await this.eventAccess.assertEventAccess(eventId, user);
    return this.workspacesService.getWorkspaceMembers(eventId);
  }

  // ── Templates ────────────────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'List available readiness checklist templates' })
  async getTemplates(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    await this.eventAccess.assertEventAccess(eventId, user);
    return this.workspacesService.getTemplates();
  }

  @Post('apply-template')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a template — replaces all existing checklist items' })
  async applyTemplate(
    @Param('eventId') eventId: string,
    @Body() dto: ApplyTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
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
    await this.eventAccess.assertEventAccess(eventId, user);
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
    await this.eventAccess.assertEventAccess(eventId, user);
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
  async getAssignableUsers(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    await this.eventAccess.assertEventAccess(eventId, user);
    return this.workspacesService.getAssignableUsers(eventId);
  }

  @Get('overdue')
  @ApiOperation({ summary: 'List items that are past their due date and not done' })
  async getOverdueItems(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    await this.eventAccess.assertEventAccess(eventId, user);
    return this.workspacesService.getOverdueItems(eventId);
  }

  // ── Checklist items ──────────────────────────────────────────────────────

  @Post('categories')
  @ApiOperation({ summary: 'Create a checklist category' })
  async createCategory(
    @Param('eventId') eventId: string,
    @Body() dto: CreateWorkspaceCategoryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
    return this.workspacesService.createWorkspaceCategory(eventId, dto.name, user.sub);
  }

  @Patch('categories/:categoryId')
  @ApiOperation({ summary: 'Rename a checklist category and its legacy item labels' })
  async updateCategory(
    @Param('eventId') eventId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateWorkspaceCategoryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
    return this.workspacesService.updateWorkspaceCategory(eventId, categoryId, dto.name, user.sub);
  }

  @Delete('categories/:categoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a checklist category and the tasks it contains' })
  async deleteCategory(
    @Param('eventId') eventId: string,
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
    return this.workspacesService.deleteWorkspaceCategory(eventId, categoryId, user.sub);
  }

  @Get('items')
  @ApiOperation({ summary: 'Get all checklist items grouped by category' })
  async getItems(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    await this.eventAccess.assertEventAccess(eventId, user);
    return this.workspacesService.getWorkspaceItems(eventId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add a custom checklist item' })
  async createItem(
    @Param('eventId') eventId: string,
    @Body() dto: CreateWorkspaceItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
    return this.workspacesService.createWorkspaceItem(eventId, dto, user.sub);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update checklist item (status, notes, etc.)' })
  async updateItem(
    @Param('eventId') eventId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateWorkspaceItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
    return this.workspacesService.updateWorkspaceItem(eventId, itemId, dto, user.sub);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a checklist item' })
  async deleteItem(
    @Param('eventId') eventId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
    return this.workspacesService.deleteWorkspaceItem(eventId, itemId, user.sub);
  }

  @Get('my-tasks')
  @ApiOperation({ summary: 'List tasks assigned to the current user as Responsible or Accountable' })
  async getMyTasks(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    await this.eventAccess.assertEventAccess(eventId, user);
    return this.workspacesService.getMyTasks(eventId, user.sub);
  }

  @Get('items/:itemId/updates')
  @ApiOperation({ summary: 'List progress updates for a task' })
  async getTaskUpdates(
    @Param('eventId') eventId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const role = await this.eventAccess.getEventOrganizationRole(eventId, user);
    return this.workspacesService.getTaskUpdates(eventId, itemId, user.sub, role !== 'member');
  }

  @Post('items/:itemId/updates')
  @ApiOperation({ summary: 'Add a progress update and optionally change assigned task status' })
  async addTaskUpdate(
    @Param('eventId') eventId: string,
    @Param('itemId') itemId: string,
    @Body() dto: CreateWorkspaceTaskUpdateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const role = await this.eventAccess.getEventOrganizationRole(eventId, user);
    return this.workspacesService.addTaskUpdate(eventId, itemId, dto, user.sub, role !== 'member');
  }

  // ── Milestones ───────────────────────────────────────────────────────────

  @Get('milestones')
  @ApiOperation({ summary: 'Get all milestones for the workspace' })
  async getMilestones(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    await this.eventAccess.assertEventAccess(eventId, user);
    return this.workspacesService.getMilestones(eventId);
  }

  @Post('milestones')
  @ApiOperation({ summary: 'Add a milestone' })
  async createMilestone(
    @Param('eventId') eventId: string,
    @Body() dto: CreateMilestoneDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
    return this.workspacesService.createMilestone(eventId, dto, user.sub);
  }

  @Patch('milestones/:milestoneId')
  @ApiOperation({ summary: 'Update a milestone' })
  async updateMilestone(
    @Param('eventId') eventId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
    return this.workspacesService.updateMilestone(eventId, milestoneId, dto, user.sub);
  }

  @Delete('milestones/:milestoneId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a milestone' })
  async deleteMilestone(
    @Param('eventId') eventId: string,
    @Param('milestoneId') milestoneId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.eventAccess.assertWorkspaceManageAccess(eventId, user);
    return this.workspacesService.deleteMilestone(eventId, milestoneId, user.sub);
  }

  // ── Closure ──────────────────────────────────────────────────────────────

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close the workspace and lock in a readiness snapshot (manager role only)' })
  async closeWorkspace(@Param('eventId') eventId: string, @CurrentUser() user: JwtPayload) {
    await this.eventAccess.assertEventAccess(eventId, user);
    return this.workspacesService.closeWorkspace(eventId, user);
  }
}
