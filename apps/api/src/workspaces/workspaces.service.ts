import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { JwtPayload } from '@axon-tickets/types';
import {
  CreateWorkspaceItemDto,
  UpdateWorkspaceItemDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
  CreateWorkspaceTaskUpdateDto,
} from './dto/workspace.dto';

type WorkspaceRoleLevel = 'manager' | 'editor' | 'viewer';

const ORG_ROLE_TO_WORKSPACE_ROLE: Record<string, WorkspaceRoleLevel> = {
  owner: 'manager',
  admin: 'manager',
  co_owner: 'manager',
  manager: 'manager',
  member: 'viewer',
};

// ── Scoring constants ─────────────────────────────────────────────────────────

export const PRIORITY_WEIGHTS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 5,
};

export type ScoreLabel = 'Complete' | 'On Track' | 'At Risk' | 'Needs Attention' | 'Blocked';

export function computeScore(items: Array<{ status: string; priority: string; isBlocker: boolean }>): {
  score: number;
  label: ScoreLabel;
  totalWeight: number;
  doneWeight: number;
  isForceBlocked: boolean;
} {
  const scorable = items.filter((i) => i.status !== 'not_applicable');
  const totalWeight = scorable.reduce((sum, i) => sum + (PRIORITY_WEIGHTS[i.priority] ?? 1), 0);
  const doneWeight = scorable
    .filter((i) => i.status === 'done')
    .reduce((sum, i) => sum + (PRIORITY_WEIGHTS[i.priority] ?? 1), 0);

  const score = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 100;

  // A critical item (high structural importance) that is stuck as "blocked" forces
  // the overall status to "Blocked" regardless of numeric score.
  const isForceBlocked = scorable.some(
    (i) => i.status === 'blocked' && (i.isBlocker || i.priority === 'critical'),
  );

  let label: ScoreLabel;
  if (isForceBlocked) label = 'Blocked';
  else if (score === 100) label = 'Complete';
  else if (score >= 70) label = 'On Track';
  else if (score >= 40) label = 'At Risk';
  else label = 'Needs Attention';

  return { score, label, totalWeight, doneWeight, isForceBlocked };
}

// ── Template library ──────────────────────────────────────────────────────────

type Priority = 'low' | 'medium' | 'high' | 'critical';

interface TemplateItem {
  title: string;
  priority: Priority;
  isBlocker: boolean;
}

interface TemplateCategory {
  name: string;
  items: TemplateItem[];
}

interface Template {
  id: string;
  label: string;
  description: string;
  categories: TemplateCategory[];
}

const TEMPLATES: Record<string, Template> = {
  conference: {
    id: 'conference',
    label: 'Conference / Seminar',
    description: 'Full-day or multi-day conference with speakers and sessions',
    categories: [
      {
        name: 'Event Setup',
        items: [
          { title: 'Cover image uploaded', priority: 'medium', isBlocker: false },
          { title: 'Event description complete', priority: 'medium', isBlocker: false },
          { title: 'Ticket tiers configured', priority: 'critical', isBlocker: true },
          { title: 'Payment methods configured', priority: 'critical', isBlocker: true },
          { title: 'Event published for sale', priority: 'high', isBlocker: false },
          { title: 'Registration confirmation email set up', priority: 'medium', isBlocker: false },
        ],
      },
      {
        name: 'Content & Speakers',
        items: [
          { title: 'Speaker lineup confirmed', priority: 'critical', isBlocker: true },
          { title: 'Speaker bios and photos collected', priority: 'high', isBlocker: false },
          { title: 'Session agenda finalized', priority: 'high', isBlocker: false },
          { title: 'Presentation materials submitted', priority: 'medium', isBlocker: false },
          { title: 'Moderators / hosts briefed', priority: 'medium', isBlocker: false },
          { title: 'Recording / streaming setup confirmed', priority: 'medium', isBlocker: false },
        ],
      },
      {
        name: 'Logistics',
        items: [
          { title: 'Venue confirmed and booked', priority: 'critical', isBlocker: true },
          { title: 'AV equipment checklist complete', priority: 'high', isBlocker: false },
          { title: 'Catering / F&B arranged', priority: 'medium', isBlocker: false },
          { title: 'Registration desk setup plan ready', priority: 'medium', isBlocker: false },
          { title: 'Signage and wayfinding prepared', priority: 'low', isBlocker: false },
          { title: 'Parking / transport info ready', priority: 'low', isBlocker: false },
          { title: 'Name tags / lanyards printed', priority: 'medium', isBlocker: false },
        ],
      },
      {
        name: 'Marketing',
        items: [
          { title: 'Social media campaign launched', priority: 'high', isBlocker: false },
          { title: 'Email invites sent to list', priority: 'high', isBlocker: false },
          { title: 'Press release issued', priority: 'low', isBlocker: false },
          { title: 'Sponsor acknowledgements ready', priority: 'medium', isBlocker: false },
          { title: 'Event hashtag set and promoted', priority: 'low', isBlocker: false },
        ],
      },
      {
        name: 'Day-of Operations',
        items: [
          { title: 'Staff / volunteer briefing done', priority: 'high', isBlocker: false },
          { title: 'Check-in staff assigned and trained', priority: 'critical', isBlocker: true },
          { title: 'Emergency / safety plan reviewed', priority: 'high', isBlocker: false },
          { title: 'QR check-in system tested', priority: 'high', isBlocker: false },
          { title: 'Speaker tech rehearsal done', priority: 'medium', isBlocker: false },
        ],
      },
    ],
  },

  concert: {
    id: 'concert',
    label: 'Concert / Live Show',
    description: 'Live music or entertainment performance',
    categories: [
      {
        name: 'Event Setup',
        items: [
          { title: 'Cover image uploaded', priority: 'medium', isBlocker: false },
          { title: 'Event description complete', priority: 'medium', isBlocker: false },
          { title: 'Ticket tiers configured', priority: 'critical', isBlocker: true },
          { title: 'Payment methods configured', priority: 'critical', isBlocker: true },
          { title: 'Event published for sale', priority: 'high', isBlocker: false },
        ],
      },
      {
        name: 'Production & AV',
        items: [
          { title: 'Stage plan finalized', priority: 'critical', isBlocker: true },
          { title: 'Sound check scheduled', priority: 'critical', isBlocker: true },
          { title: 'Lighting design confirmed', priority: 'high', isBlocker: false },
          { title: 'Backline / equipment confirmed', priority: 'high', isBlocker: false },
          { title: 'Recording / livestream setup confirmed', priority: 'medium', isBlocker: false },
        ],
      },
      {
        name: 'Logistics',
        items: [
          { title: 'Venue access and load-in confirmed', priority: 'critical', isBlocker: true },
          { title: 'Load-in / load-out schedule finalized', priority: 'high', isBlocker: false },
          { title: 'Security briefing done', priority: 'high', isBlocker: false },
          { title: 'Parking and transport arranged', priority: 'medium', isBlocker: false },
          { title: 'Merchandise setup confirmed', priority: 'low', isBlocker: false },
        ],
      },
      {
        name: 'Marketing',
        items: [
          { title: 'Social media campaign live', priority: 'high', isBlocker: false },
          { title: 'Ticket sales target on track', priority: 'medium', isBlocker: false },
          { title: 'Press coverage secured', priority: 'low', isBlocker: false },
          { title: 'Radio / online ads placed', priority: 'medium', isBlocker: false },
        ],
      },
      {
        name: 'Venue & Safety',
        items: [
          { title: 'Safety inspection complete', priority: 'critical', isBlocker: true },
          { title: 'Emergency exits marked and clear', priority: 'critical', isBlocker: true },
          { title: 'First aid station setup confirmed', priority: 'high', isBlocker: false },
          { title: 'Crowd capacity check done', priority: 'high', isBlocker: false },
          { title: 'Fire marshal briefed', priority: 'high', isBlocker: false },
        ],
      },
    ],
  },

  community: {
    id: 'community',
    label: 'Community / Networking',
    description: 'Meetup, workshop, or networking event',
    categories: [
      {
        name: 'Event Setup',
        items: [
          { title: 'Cover image uploaded', priority: 'medium', isBlocker: false },
          { title: 'Event description complete', priority: 'medium', isBlocker: false },
          { title: 'Ticket tiers / RSVP configured', priority: 'critical', isBlocker: true },
          { title: 'Payment methods configured', priority: 'high', isBlocker: false },
          { title: 'Event published', priority: 'high', isBlocker: false },
        ],
      },
      {
        name: 'Logistics',
        items: [
          { title: 'Venue confirmed', priority: 'critical', isBlocker: true },
          { title: 'AV / projector available', priority: 'medium', isBlocker: false },
          { title: 'Snacks / drinks arranged', priority: 'low', isBlocker: false },
          { title: 'Name tags prepared', priority: 'low', isBlocker: false },
          { title: 'Parking info ready', priority: 'low', isBlocker: false },
        ],
      },
      {
        name: 'Marketing',
        items: [
          { title: 'Community channels announced', priority: 'high', isBlocker: false },
          { title: 'Social media posts published', priority: 'medium', isBlocker: false },
          { title: 'Email to subscriber list sent', priority: 'medium', isBlocker: false },
        ],
      },
      {
        name: 'Day-of Operations',
        items: [
          { title: 'Host / facilitator briefed', priority: 'high', isBlocker: false },
          { title: 'Check-in process ready', priority: 'medium', isBlocker: false },
          { title: 'Ice-breaker / agenda ready', priority: 'medium', isBlocker: false },
          { title: 'Emergency contact list prepared', priority: 'medium', isBlocker: false },
        ],
      },
    ],
  },

  general: {
    id: 'general',
    label: 'General Event',
    description: 'Lightweight checklist for any event type',
    categories: [
      {
        name: 'Event Setup',
        items: [
          { title: 'Cover image uploaded', priority: 'medium', isBlocker: false },
          { title: 'Event description complete', priority: 'medium', isBlocker: false },
          { title: 'Ticket tiers configured', priority: 'critical', isBlocker: true },
          { title: 'Payment methods configured', priority: 'critical', isBlocker: true },
          { title: 'Event published for sale', priority: 'high', isBlocker: false },
        ],
      },
      {
        name: 'Logistics',
        items: [
          { title: 'Venue confirmed', priority: 'critical', isBlocker: true },
          { title: 'Equipment checklist done', priority: 'medium', isBlocker: false },
          { title: 'Staff assigned', priority: 'high', isBlocker: false },
        ],
      },
      {
        name: 'Marketing',
        items: [
          { title: 'Announcements published', priority: 'high', isBlocker: false },
          { title: 'Email announcement sent', priority: 'medium', isBlocker: false },
        ],
      },
      {
        name: 'Day-of Operations',
        items: [
          { title: 'Setup complete', priority: 'high', isBlocker: false },
          { title: 'Staff briefed', priority: 'high', isBlocker: false },
          { title: 'Check-in process ready', priority: 'medium', isBlocker: false },
        ],
      },
    ],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function userDisplayName(u: { firstName: string | null; lastName: string | null; email: string }) {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
}

function parseSafeDate(value: string): Date {
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new BadRequestException(`Invalid date value: ${value}`);
  return d;
}

export type WorkspaceDueState = 'completed' | 'overdue' | 'due_today' | 'due_soon' | 'upcoming' | 'unscheduled';

export function manilaDateKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function dateKeyDistance(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function workspaceDueState(
  dueDate: Date | null,
  status: string,
  now = new Date(),
): WorkspaceDueState {
  if (status === 'done' || status === 'not_applicable') return 'completed';
  if (!dueDate) return 'unscheduled';
  const distance = dateKeyDistance(manilaDateKey(now), manilaDateKey(dueDate));
  if (distance < 0) return 'overdue';
  if (distance === 0) return 'due_today';
  if (distance <= 3) return 'due_soon';
  return 'upcoming';
}

function manilaStartOfToday(now = new Date()): Date {
  return new Date(`${manilaDateKey(now)}T00:00:00+08:00`);
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly emailService?: EmailService,
  ) {}

  // ── Workspace lifecycle ─────────────────────────────────────────────────────

  async ensureWorkspace(eventId: string, creatorId: string) {
    const existing = await this.prisma.eventWorkspace.findUnique({ where: { eventId } });
    if (existing) return existing;

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Create workspace bare, then member and items sequentially — avoids nested createMany
    // which can fail with PgBouncer transaction-mode connection poolers (Supabase).
    const workspace = await this.prisma.eventWorkspace.create({ data: { eventId } });

    // Seed the workspace team from the event's organization membership, so
    // assignable users / team visibility reflect the real org roster rather
    // than a single hardcoded manager row.
    if (event.organizationId) {
      const orgMembers = await this.prisma.organizationMember.findMany({
        where: { organizationId: event.organizationId },
        select: { userId: true, role: true },
      });
      const seen = new Set<string>();
      for (const m of orgMembers) {
        seen.add(m.userId);
        await this.prisma.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: m.userId,
            role: ORG_ROLE_TO_WORKSPACE_ROLE[m.role] ?? 'viewer',
          },
        });
      }
      if (!seen.has(creatorId)) {
        await this.prisma.workspaceMember.create({
          data: { workspaceId: workspace.id, userId: creatorId, role: 'manager' },
        });
      }
    } else {
      await this.prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: creatorId, role: 'manager' },
      });
    }

    await this.audit.log({
      action: 'WORKSPACE_CREATED',
      entityType: 'EventWorkspace',
      entityId: workspace.id,
      performedById: creatorId,
      metadata: { eventId, initializedEmpty: true },
    });

    return workspace;
  }

  // ── Summary — weighted score, force-blocked, ownership, overdue ─────────────

  async getWorkspaceSummary(eventId: string, user?: JwtPayload) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      include: {
        event: { select: { id: true, title: true, startsAt: true, status: true, organizationId: true } },
        items: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          take: 500,
        },
        milestones: {
          where: { status: { not: 'done' } },
          orderBy: { dueDate: 'asc' },
          take: 5,
        },
        closedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!workspace) return null;

    const viewerRole = user
      ? await this.resolveViewerRole(workspace.event.organizationId, workspace.id, user)
      : 'viewer';
    const canEdit = !workspace.closedAt && (viewerRole === 'manager' || viewerRole === 'editor');

    const items = workspace.items;
    const now = new Date();

    const { score, label, totalWeight, doneWeight, isForceBlocked } = computeScore(items);

    const scorable = items.filter((i) => i.status !== 'not_applicable');
    const notApplicable = items.length - scorable.length;
    const done = scorable.filter((i) => i.status === 'done').length;
    const notStarted = scorable.filter((i) => i.status === 'open').length;
    const inProgress = scorable.filter((i) => i.status === 'in_progress').length;
    const blocked = scorable.filter((i) => i.status === 'blocked').length;

    const criticalBlockers = items.filter(
      (i) => i.isBlocker && i.status !== 'done' && i.status !== 'not_applicable',
    );
    const blockedItems = items.filter((i) => i.status === 'blocked');

    // Unowned = scorable items not done/NA with neither responsible nor accountable set
    const unownedCount = scorable.filter(
      (i) => i.status !== 'done'
        && !i.assignedToUserId && !i.accountableToUserId
        && !i.assignedToName && !i.accountableName,
    ).length;

    // Overdue = scorable, not done, past due date
    const overdueCount = scorable.filter(
      (i) => workspaceDueState(i.dueDate, i.status, now) === 'overdue',
    ).length;
    const dueTodayCount = scorable.filter((i) => workspaceDueState(i.dueDate, i.status, now) === 'due_today').length;
    const dueSoonCount = scorable.filter((i) => workspaceDueState(i.dueDate, i.status, now) === 'due_soon').length;

    return {
      workspaceId: workspace.id,
      eventId: workspace.eventId,
      event: {
        id: workspace.event.id,
        title: workspace.event.title,
        startsAt: workspace.event.startsAt,
        status: workspace.event.status,
      },
      canEdit,
      viewerRole,
      isClosed: !!workspace.closedAt,
      closedAt: workspace.closedAt?.toISOString() ?? null,
      closedBy: workspace.closedBy ? { name: userDisplayName(workspace.closedBy) } : null,
      readiness: {
        score,
        label,
        totalWeight,
        doneWeight,
        scorableTotal: scorable.length,
        done,
        notStarted,
        inProgress,
        blocked,
        notApplicable,
        hasCriticalBlockers: criticalBlockers.length > 0,
        blockedCount: blockedItems.length,
        unownedCount,
        overdueCount,
        dueTodayCount,
        dueSoonCount,
        isForceBlocked,
      },
      criticalBlockers: criticalBlockers.map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        status: i.status,
        priority: i.priority,
        dueDate: i.dueDate?.toISOString() ?? null,
        dueState: workspaceDueState(i.dueDate, i.status, now),
        assignedTo:    i.assignedToName    ? { name: i.assignedToName    } : null,
        accountableTo: i.accountableName ? { name: i.accountableName } : null,
      })),
      blockedItems: blockedItems.map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        notes: i.notes,
        dueState: workspaceDueState(i.dueDate, i.status, now),
        assignedTo:    i.assignedToName    ? { name: i.assignedToName    } : null,
        accountableTo: i.accountableName ? { name: i.accountableName } : null,
      })),
      upcomingMilestones: workspace.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        dueDate: m.dueDate.toISOString(),
        status: m.status,
      })),
      createdAt: workspace.createdAt.toISOString(),
    };
  }

  // ── Team & roles ─────────────────────────────────────────────────────────────

  /**
   * Live role resolution: prefers the event's current OrganizationMember roster
   * over the WorkspaceMember snapshot, so members added to the org after the
   * workspace was created still get correct permissions without a separate
   * invite/sync step. WorkspaceMember is only the source of truth for
   * organization-less (legacy/admin-created) events.
   */
  private async resolveViewerRole(
    organizationId: string | null,
    workspaceId: string,
    user: JwtPayload,
  ): Promise<WorkspaceRoleLevel> {
    if (user.isAdmin) return 'manager';

    if (organizationId) {
      const orgMember = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: user.sub, organizationId } },
      });
      if (orgMember) return ORG_ROLE_TO_WORKSPACE_ROLE[orgMember.role] ?? 'viewer';
    }

    const wsMember = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.sub } },
    });
    return wsMember?.role ?? 'viewer';
  }

  private assertWorkspaceNotClosed(workspace: { closedAt: Date | null }) {
    if (workspace.closedAt) {
      throw new BadRequestException('Workspace is closed and read-only');
    }
  }

  async getWorkspaceMembers(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organizationId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (event.organizationId) {
      const members = await this.prisma.organizationMember.findMany({
        where: { organizationId: event.organizationId },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { role: 'asc' },
      });
      return members.map((m) => ({
        id: m.user.id,
        name: userDisplayName(m.user),
        email: m.user.email,
        role: ORG_ROLE_TO_WORKSPACE_ROLE[m.role] ?? 'viewer',
      }));
    }

    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!workspace) return [];

    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return members.map((m) => ({
      id: m.user.id,
      name: userDisplayName(m.user),
      email: m.user.email,
      role: m.role,
    }));
  }

  // ── Checklist items ─────────────────────────────────────────────────────────

  async createWorkspaceCategory(eventId: string, rawName: string, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true, closedAt: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    this.assertWorkspaceNotClosed(workspace);
    const name = rawName.trim();
    const duplicate = await this.prisma.workspaceCategory.findFirst({
      where: { workspaceId: workspace.id, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('A category with this name already exists');
    const maxOrder = await this.prisma.workspaceCategory.aggregate({
      where: { workspaceId: workspace.id },
      _max: { sortOrder: true },
    });
    const category = await this.prisma.workspaceCategory.create({
      data: { workspaceId: workspace.id, name, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    });
    await this.audit.log({
      action: 'WORKSPACE_CATEGORY_CREATED', entityType: 'WorkspaceCategory',
      entityId: category.id, performedById, metadata: { eventId, name },
    });
    return { ...category, createdAt: category.createdAt.toISOString(), updatedAt: category.updatedAt.toISOString() };
  }

  async updateWorkspaceCategory(eventId: string, categoryId: string, rawName: string, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId }, select: { id: true, closedAt: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    this.assertWorkspaceNotClosed(workspace);
    const category = await this.prisma.workspaceCategory.findFirst({ where: { id: categoryId, workspaceId: workspace.id } });
    if (!category) throw new NotFoundException('Category not found');
    const name = rawName.trim();
    const duplicate = await this.prisma.workspaceCategory.findFirst({
      where: { workspaceId: workspace.id, id: { not: categoryId }, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('A category with this name already exists');
    await this.prisma.$transaction([
      this.prisma.workspaceCategory.update({ where: { id: categoryId }, data: { name } }),
      this.prisma.workspaceItem.updateMany({ where: { categoryId }, data: { category: name } }),
    ]);
    await this.audit.log({
      action: 'WORKSPACE_CATEGORY_RENAMED', entityType: 'WorkspaceCategory', entityId: categoryId,
      performedById, metadata: { eventId, from: category.name, to: name },
    });
    return { id: categoryId, name };
  }

  async deleteWorkspaceCategory(eventId: string, categoryId: string, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId }, select: { id: true, closedAt: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    this.assertWorkspaceNotClosed(workspace);
    const category = await this.prisma.workspaceCategory.findFirst({
      where: { id: categoryId, workspaceId: workspace.id }, include: { _count: { select: { items: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    await this.prisma.workspaceCategory.delete({ where: { id: categoryId } });
    await this.audit.log({
      action: 'WORKSPACE_CATEGORY_DELETED', entityType: 'WorkspaceCategory', entityId: categoryId,
      performedById, metadata: { eventId, name: category.name, deletedItemCount: category._count.items },
    });
    return { deleted: true, deletedItemCount: category._count.items };
  }

  async getWorkspaceItems(eventId: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: {
        id: true,
        categories: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            items: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              include: {
                assignedToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
                accountableToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
          },
        },
        items: {
          where: { categoryId: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          take: 500,
          include: {
            assignedToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
            accountableToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    if (!workspace) return null;

    const grouped: Record<string, typeof workspace.items> = {};
    for (const item of workspace.items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }

    return {
      workspaceId: workspace.id,
      categories: [
        ...workspace.categories.map((category) => ({
          id: category.id,
          category: category.name,
          sortOrder: category.sortOrder,
          items: category.items.map((i) => this.serializeItem(i)),
        })),
        ...Object.entries(grouped).map(([category, categoryItems]) => ({
          id: null,
          category,
          sortOrder: Number.MAX_SAFE_INTEGER,
          items: categoryItems.map((i) => this.serializeItem(i)),
        })),
      ],
    };
  }

  async createWorkspaceItem(eventId: string, dto: CreateWorkspaceItemDto, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true, closedAt: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    this.assertWorkspaceNotClosed(workspace);

    let category = dto.categoryId
      ? await this.prisma.workspaceCategory.findFirst({ where: { id: dto.categoryId, workspaceId: workspace.id } })
      : null;
    if (!category && dto.categoryId) throw new BadRequestException('Category does not belong to this workspace');
    if (!category) {
      const name = dto.category?.trim() || 'General';
      category = await this.prisma.workspaceCategory.findFirst({
        where: { workspaceId: workspace.id, name: { equals: name, mode: 'insensitive' } },
      });
      if (!category) {
        const maxCategoryOrder = await this.prisma.workspaceCategory.aggregate({
          where: { workspaceId: workspace.id }, _max: { sortOrder: true },
        });
        category = await this.prisma.workspaceCategory.create({
          data: { workspaceId: workspace.id, name, sortOrder: (maxCategoryOrder._max.sortOrder ?? -1) + 1 },
        });
      }
    }

    const responsible = dto.assignedToUserId
      ? await this.resolveTaskMember(eventId, dto.assignedToUserId)
      : null;
    const accountable = dto.accountableToUserId
      ? await this.resolveTaskMember(eventId, dto.accountableToUserId)
      : null;

    const maxOrder = await this.prisma.workspaceItem.aggregate({
      where: { workspaceId: workspace.id },
      _max: { sortOrder: true },
    });

    const item = await this.prisma.workspaceItem.create({
      data: {
        workspaceId: workspace.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        category: category.name,
        categoryId: category.id,
        priority: (dto.priority as any) ?? 'medium',
        isBlocker: dto.isBlocker ?? false,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes ?? null,
        assignedToUserId: responsible?.id ?? null,
        assignedToName: responsible ? userDisplayName(responsible) : null,
        accountableToUserId: accountable?.id ?? null,
        accountableName: accountable ? userDisplayName(accountable) : null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    await this.audit.log({
      action: 'WORKSPACE_ITEM_CREATED',
      entityType: 'WorkspaceItem',
      entityId: item.id,
      performedById,
      metadata: { eventId, title: item.title, category: item.category, isBlocker: item.isBlocker },
    });

    if (responsible || accountable) {
      const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
      const webBase = process.env.WEB_URL ?? 'https://axontickets.online';
      const assignments = [
        ...(responsible ? [{ user: responsible, role: 'Responsible' as const }] : []),
        ...(accountable ? [{ user: accountable, role: 'Accountable' as const }] : []),
      ];
      await Promise.all(assignments.map((assignment) => this.emailService?.sendWorkspaceTaskAssignment(
        assignment.user.email,
        userDisplayName(assignment.user),
        item.title,
        event?.title ?? 'Event workspace',
        assignment.role,
        item.dueDate,
        `${webBase}/admin/events/${eventId}/my-tasks?task=${item.id}`,
      ).catch(() => false)));
    }

    return this.serializeItem({ ...item, assignedToUser: responsible, accountableToUser: accountable });
  }

  async updateWorkspaceItem(eventId: string, itemId: string, dto: UpdateWorkspaceItemDto, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true, closedAt: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    this.assertWorkspaceNotClosed(workspace);

    const item = await this.prisma.workspaceItem.findFirst({
      where: { id: itemId, workspaceId: workspace.id },
    });
    if (!item) throw new NotFoundException('Item not found');

    const nextCategory = dto.categoryId
      ? await this.prisma.workspaceCategory.findFirst({ where: { id: dto.categoryId, workspaceId: workspace.id } })
      : null;
    if (dto.categoryId && !nextCategory) throw new BadRequestException('Category does not belong to this workspace');
    const responsible = dto.assignedToUserId
      ? await this.resolveTaskMember(eventId, dto.assignedToUserId)
      : null;
    const accountable = dto.accountableToUserId
      ? await this.resolveTaskMember(eventId, dto.accountableToUserId)
      : null;

    const wasNotDone = item.status !== 'done';
    const becomingDone = dto.status === 'done';

    const updated = await this.prisma.workspaceItem.update({
      where: { id: itemId },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.categoryId !== undefined && {
          categoryId: dto.categoryId,
          ...(nextCategory ? { category: nextCategory.name } : {}),
        }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.status !== undefined && { status: dto.status as any }),
        ...(dto.priority !== undefined && { priority: dto.priority as any }),
        ...(dto.isBlocker !== undefined && { isBlocker: dto.isBlocker }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...('assignedToName'  in dto && { assignedToName:  dto.assignedToName  ?? null }),
        ...('accountableName' in dto && { accountableName: dto.accountableName ?? null }),
        ...('assignedToUserId' in dto && {
          assignedToUserId: dto.assignedToUserId ?? null,
          assignedToName: responsible ? userDisplayName(responsible) : null,
        }),
        ...('accountableToUserId' in dto && {
          accountableToUserId: dto.accountableToUserId ?? null,
          accountableName: accountable ? userDisplayName(accountable) : null,
        }),
        ...(wasNotDone && becomingDone && { completedAt: new Date() }),
        ...(dto.status !== undefined && dto.status !== 'done' && item.completedAt && { completedAt: null }),
      },
    });

    if (dto.status !== undefined && dto.status !== item.status) {
      await this.audit.log({
        action: 'WORKSPACE_ITEM_STATUS_CHANGED',
        entityType: 'WorkspaceItem',
        entityId: itemId,
        performedById,
        metadata: { eventId, from: item.status, to: dto.status, isBlocker: item.isBlocker },
      });
    }

    if ('assignedToName' in dto && (dto.assignedToName ?? null) !== item.assignedToName) {
      await this.audit.log({
        action: 'WORKSPACE_ITEM_ASSIGNEE_CHANGED',
        entityType: 'WorkspaceItem',
        entityId: itemId,
        performedById,
        metadata: { eventId, role: 'responsible', from: item.assignedToName, to: dto.assignedToName ?? null },
      });
    }

    if ('accountableName' in dto && (dto.accountableName ?? null) !== item.accountableName) {
      await this.audit.log({
        action: 'WORKSPACE_ITEM_ASSIGNEE_CHANGED',
        entityType: 'WorkspaceItem',
        entityId: itemId,
        performedById,
        metadata: { eventId, role: 'accountable', from: item.accountableName, to: dto.accountableName ?? null },
      });
    }

    if ('assignedToUserId' in dto && (dto.assignedToUserId ?? null) !== item.assignedToUserId) {
      await this.audit.log({
        action: 'WORKSPACE_ITEM_ASSIGNEE_CHANGED', entityType: 'WorkspaceItem', entityId: itemId,
        performedById, metadata: { eventId, role: 'responsible', fromUserId: item.assignedToUserId, toUserId: dto.assignedToUserId ?? null },
      });
    }

    if ('accountableToUserId' in dto && (dto.accountableToUserId ?? null) !== item.accountableToUserId) {
      await this.audit.log({
        action: 'WORKSPACE_ITEM_ASSIGNEE_CHANGED', entityType: 'WorkspaceItem', entityId: itemId,
        performedById, metadata: { eventId, role: 'accountable', fromUserId: item.accountableToUserId, toUserId: dto.accountableToUserId ?? null },
      });
    }

    if (dto.dueDate !== undefined) {
      const newDue = dto.dueDate ? new Date(dto.dueDate).toISOString() : null;
      const oldDue = item.dueDate ? item.dueDate.toISOString() : null;
      if (newDue !== oldDue) {
        await this.audit.log({
          action: 'WORKSPACE_ITEM_DUE_DATE_CHANGED',
          entityType: 'WorkspaceItem',
          entityId: itemId,
          performedById,
          metadata: { eventId, from: oldDue, to: newDue },
        });
      }
    }

    if (dto.isBlocker !== undefined && dto.isBlocker !== item.isBlocker) {
      await this.audit.log({
        action: 'WORKSPACE_ITEM_BLOCKER_FLAG_CHANGED',
        entityType: 'WorkspaceItem',
        entityId: itemId,
        performedById,
        metadata: { eventId, from: item.isBlocker, to: dto.isBlocker },
      });
    }

    const newlyAssigned = [
      ...('assignedToUserId' in dto && dto.assignedToUserId && dto.assignedToUserId !== item.assignedToUserId
        ? [{ userId: dto.assignedToUserId, role: 'Responsible' as const }]
        : []),
      ...('accountableToUserId' in dto && dto.accountableToUserId && dto.accountableToUserId !== item.accountableToUserId
        ? [{ userId: dto.accountableToUserId, role: 'Accountable' as const }]
        : []),
    ];
    if (newlyAssigned.length > 0) {
      const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
      const users = await this.prisma.user.findMany({
        where: { id: { in: Array.from(new Set(newlyAssigned.map((assignment) => assignment.userId))) }, isVerified: true },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      const webBase = process.env.WEB_URL ?? 'https://axontickets.online';
      await Promise.all(newlyAssigned.map(async (assignment) => {
        const recipient = users.find((user) => user.id === assignment.userId);
        if (!recipient || !event) return;
        await this.emailService?.sendWorkspaceTaskAssignment(
          recipient.email,
          userDisplayName(recipient),
          updated.title,
          event.title,
          assignment.role,
          updated.dueDate,
          `${webBase}/admin/events/${eventId}/my-tasks?task=${itemId}`,
        ).catch(() => false);
      }));
    }

    return this.serializeItem({
      ...updated,
      assignedToUser: 'assignedToUserId' in dto ? responsible : undefined,
      accountableToUser: 'accountableToUserId' in dto ? accountable : undefined,
    });
  }

  async deleteWorkspaceItem(eventId: string, itemId: string, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true, closedAt: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    this.assertWorkspaceNotClosed(workspace);

    const item = await this.prisma.workspaceItem.findFirst({
      where: { id: itemId, workspaceId: workspace.id },
    });
    if (!item) throw new NotFoundException('Item not found');

    await this.prisma.workspaceItem.delete({ where: { id: itemId } });

    await this.audit.log({
      action: 'WORKSPACE_ITEM_DELETED',
      entityType: 'WorkspaceItem',
      entityId: itemId,
      performedById,
      metadata: { eventId, title: item.title, isBlocker: item.isBlocker },
    });

    return { deleted: true };
  }

  // ── Overdue items ───────────────────────────────────────────────────────────

  async getOverdueItems(eventId: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!workspace) return null;

    const items = await this.prisma.workspaceItem.findMany({
      where: {
        workspaceId: workspace.id,
        dueDate: { lt: manilaStartOfToday() },
        status: { notIn: ['done', 'not_applicable'] },
      },
      orderBy: { dueDate: 'asc' },
      include: {
        assignedToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        accountableToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return items.map((i) => this.serializeItem(i));
  }

  async getMyTasks(eventId: string, userId: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: {
        id: true,
        closedAt: true,
        event: { select: { id: true, title: true, startsAt: true } },
      },
    });
    if (!workspace) return null;

    const items = await this.prisma.workspaceItem.findMany({
      where: {
        workspaceId: workspace.id,
        OR: [{ assignedToUserId: userId }, { accountableToUserId: userId }],
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
      take: 500,
      include: {
        assignedToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        accountableToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });
    const dueRank: Record<WorkspaceDueState, number> = {
      overdue: 0,
      due_today: 1,
      due_soon: 2,
      upcoming: 3,
      unscheduled: 4,
      completed: 5,
    };
    const tasks = items
      .map((item) => ({
        ...this.serializeItem(item),
        assignmentRoles: [
          ...(item.assignedToUserId === userId ? ['responsible' as const] : []),
          ...(item.accountableToUserId === userId ? ['accountable' as const] : []),
        ],
        recentUpdates: item.updates.map((update) => ({
          id: update.id,
          message: update.message,
          previousStatus: update.previousStatus,
          nextStatus: update.nextStatus,
          author: { id: update.author.id, name: userDisplayName(update.author) },
          createdAt: update.createdAt.toISOString(),
        })),
      }))
      .sort((a, b) => dueRank[a.dueState] - dueRank[b.dueState]);

    return {
      workspaceId: workspace.id,
      isClosed: Boolean(workspace.closedAt),
      event: {
        id: workspace.event.id,
        title: workspace.event.title,
        startsAt: workspace.event.startsAt.toISOString(),
      },
      summary: {
        total: tasks.length,
        open: tasks.filter((task) => task.status === 'open').length,
        inProgress: tasks.filter((task) => task.status === 'in_progress').length,
        overdue: tasks.filter((task) => task.dueState === 'overdue').length,
        done: tasks.filter((task) => task.status === 'done').length,
      },
      tasks,
    };
  }

  async getTaskUpdates(eventId: string, itemId: string, userId: string, canManage: boolean) {
    const item = await this.prisma.workspaceItem.findFirst({
      where: { id: itemId, workspace: { eventId } },
      select: { assignedToUserId: true, accountableToUserId: true },
    });
    if (!item) throw new NotFoundException('Task not found');
    if (!canManage && item.assignedToUserId !== userId && item.accountableToUserId !== userId) {
      throw new ForbiddenException('You can only view updates for tasks assigned to you');
    }
    const updates = await this.prisma.workspaceTaskUpdate.findMany({
      where: { workspaceItemId: itemId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return updates.map((update) => ({
      id: update.id,
      message: update.message,
      previousStatus: update.previousStatus,
      nextStatus: update.nextStatus,
      author: { id: update.author.id, name: userDisplayName(update.author) },
      createdAt: update.createdAt.toISOString(),
    }));
  }

  async addTaskUpdate(
    eventId: string,
    itemId: string,
    dto: CreateWorkspaceTaskUpdateDto,
    userId: string,
    canManage: boolean,
  ) {
    const item = await this.prisma.workspaceItem.findFirst({
      where: { id: itemId, workspace: { eventId } },
      include: { workspace: { select: { closedAt: true } } },
    });
    if (!item) throw new NotFoundException('Task not found');
    this.assertWorkspaceNotClosed(item.workspace);
    if (!canManage && item.assignedToUserId !== userId && item.accountableToUserId !== userId) {
      throw new ForbiddenException('You can only update tasks assigned to you');
    }
    const message = dto.message?.trim() || null;
    if (!message && !dto.status) {
      throw new BadRequestException('Add a progress note or select a new status');
    }
    const nextStatus = dto.status ?? item.status;
    if (!canManage && nextStatus === 'not_applicable') {
      throw new ForbiddenException('Only a workspace manager can mark a task not applicable');
    }
    const updated = dto.status && dto.status !== item.status
      ? await this.prisma.workspaceItem.update({
          where: { id: item.id },
          data: {
            status: dto.status as any,
            completedAt: dto.status === 'done' ? new Date() : null,
          },
        })
      : item;
    const update = await this.prisma.workspaceTaskUpdate.create({
      data: {
        workspaceItemId: item.id,
        authorUserId: userId,
        message,
        previousStatus: item.status,
        nextStatus: nextStatus as any,
      },
      include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    await this.audit.log({
      action: 'WORKSPACE_TASK_PROGRESS_UPDATED', entityType: 'WorkspaceItem', entityId: item.id,
      performedById: userId, metadata: { eventId, from: item.status, to: nextStatus, hasNote: Boolean(message) },
    });
    return {
      task: this.serializeItem(updated),
      update: {
        id: update.id,
        message: update.message,
        previousStatus: update.previousStatus,
        nextStatus: update.nextStatus,
        author: { id: update.author.id, name: userDisplayName(update.author) },
        createdAt: update.createdAt.toISOString(),
      },
    };
  }

  // ── Assignable users ────────────────────────────────────────────────────────

  private async resolveTaskMember(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId }, select: { organizationId: true, createdById: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizationId) {
      const membership = await this.prisma.organizationMember.findFirst({
        where: { organizationId: event.organizationId, userId, user: { isVerified: true } },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
      if (!membership) throw new BadRequestException('Select a verified member of this organization');
      return membership.user;
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isVerified: true, OR: [{ isAdmin: true }, { id: event.createdById }] },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!user) throw new BadRequestException('Select a verified member with access to this event');
    return user;
  }

  async getAssignableUsers(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { createdById: true, organizationId: true },
    });
    if (!event) return [];

    // Preferred pool: real members of the event's organization.
    if (event.organizationId) {
      const orgMembers = await this.prisma.organizationMember.findMany({
        where: { organizationId: event.organizationId, user: { isVerified: true } },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        take: 200,
      });
      return orgMembers
        .map((m) => m.user)
        .sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b)))
        .map((u) => ({ id: u.id, name: userDisplayName(u), email: u.email }));
    }

    // Fallback for legacy/admin-created events with no organization: admins + creator.
    const adminUsers = await this.prisma.user.findMany({
      where: { isAdmin: true, isVerified: true },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 200,
    });

    const userMap = new Map(adminUsers.map((u) => [u.id, u]));

    if (event.createdById && !userMap.has(event.createdById)) {
      const organizer = await this.prisma.user.findUnique({
        where: { id: event.createdById, isVerified: true },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (organizer) userMap.set(organizer.id, organizer);
    }

    return Array.from(userMap.values())
      .sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b)))
      .map((u) => ({
        id: u.id,
        name: userDisplayName(u),
        email: u.email,
      }));
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  getTemplates() {
    return Object.values(TEMPLATES).map(({ id, label, description, categories }) => ({
      id,
      label,
      description,
      totalItems: categories.reduce((sum, c) => sum + c.items.length, 0),
      categoryCount: categories.length,
    }));
  }

  async applyTemplate(eventId: string, templateId: string, performedById: string) {
    const template = TEMPLATES[templateId];
    if (!template) throw new BadRequestException('Unknown template ID');

    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true, closedAt: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    this.assertWorkspaceNotClosed(workspace);

    await this.prisma.workspaceItem.deleteMany({ where: { workspaceId: workspace.id } });
    await this.prisma.workspaceCategory.deleteMany({ where: { workspaceId: workspace.id } });
    let globalSort = 0;
    for (const [categoryIndex, cat] of template.categories.entries()) {
      const category = await this.prisma.workspaceCategory.create({
        data: { workspaceId: workspace.id, name: cat.name, sortOrder: categoryIndex },
      });
      await this.prisma.workspaceItem.createMany({
        data: cat.items.map((item) => ({
          workspaceId: workspace.id,
          categoryId: category.id,
          title: item.title,
          category: cat.name,
          priority: item.priority,
          isBlocker: item.isBlocker,
          sortOrder: globalSort++,
        })),
      });
    }

    await this.audit.log({
      action: 'WORKSPACE_TEMPLATE_APPLIED',
      entityType: 'EventWorkspace',
      entityId: workspace.id,
      performedById,
      metadata: { templateId, eventId },
    });

    return {
      templateId,
      templateLabel: template.label,
      itemsCreated: template.categories.reduce((sum, category) => sum + category.items.length, 0),
    };
  }

  // ── Milestones ──────────────────────────────────────────────────────────────

  async getMilestones(eventId: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!workspace) return null;

    const milestones = await this.prisma.workspaceMilestone.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { dueDate: 'asc' },
    });

    return milestones.map((m) => ({
      id: m.id,
      title: m.title,
      dueDate: m.dueDate.toISOString(),
      status: m.status,
      notes: m.notes,
      completedAt: m.completedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async createMilestone(eventId: string, dto: CreateMilestoneDto, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true, closedAt: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    this.assertWorkspaceNotClosed(workspace);

    const milestone = await this.prisma.workspaceMilestone.create({
      data: {
        workspaceId: workspace.id,
        title: dto.title.trim(),
        dueDate: parseSafeDate(dto.dueDate),
        notes: dto.notes ?? null,
      },
    });

    await this.audit.log({
      action: 'WORKSPACE_MILESTONE_CREATED',
      entityType: 'WorkspaceMilestone',
      entityId: milestone.id,
      performedById,
      metadata: { eventId, title: milestone.title, dueDate: milestone.dueDate.toISOString() },
    });

    return {
      id: milestone.id,
      title: milestone.title,
      dueDate: milestone.dueDate.toISOString(),
      status: milestone.status,
      notes: milestone.notes,
      completedAt: null,
      createdAt: milestone.createdAt.toISOString(),
    };
  }

  async updateMilestone(eventId: string, milestoneId: string, dto: UpdateMilestoneDto, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true, closedAt: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    this.assertWorkspaceNotClosed(workspace);

    const milestone = await this.prisma.workspaceMilestone.findFirst({
      where: { id: milestoneId, workspaceId: workspace.id },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');

    const becomingDone = dto.status === 'done';
    const wasNotDone = milestone.status !== 'done';

    const updated = await this.prisma.workspaceMilestone.update({
      where: { id: milestoneId },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.dueDate !== undefined && { dueDate: parseSafeDate(dto.dueDate) }),
        ...(dto.status !== undefined && { status: dto.status as any }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(wasNotDone && becomingDone && { completedAt: new Date() }),
        ...(!becomingDone && milestone.completedAt && { completedAt: null }),
      },
    });

    if (dto.status !== undefined && dto.status !== milestone.status) {
      await this.audit.log({
        action: 'WORKSPACE_MILESTONE_STATUS_CHANGED',
        entityType: 'WorkspaceMilestone',
        entityId: milestoneId,
        performedById,
        metadata: { eventId, from: milestone.status, to: dto.status },
      });
    }
    if (dto.title !== undefined || dto.dueDate !== undefined || dto.notes !== undefined) {
      await this.audit.log({
        action: 'WORKSPACE_MILESTONE_UPDATED',
        entityType: 'WorkspaceMilestone',
        entityId: milestoneId,
        performedById,
        metadata: { eventId },
      });
    }

    return {
      id: updated.id,
      title: updated.title,
      dueDate: updated.dueDate.toISOString(),
      status: updated.status,
      notes: updated.notes,
      completedAt: updated.completedAt?.toISOString() ?? null,
    };
  }

  async deleteMilestone(eventId: string, milestoneId: string, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true, closedAt: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    this.assertWorkspaceNotClosed(workspace);

    const milestone = await this.prisma.workspaceMilestone.findFirst({
      where: { id: milestoneId, workspaceId: workspace.id },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');

    await this.prisma.workspaceMilestone.delete({ where: { id: milestoneId } });

    await this.audit.log({
      action: 'WORKSPACE_MILESTONE_DELETED',
      entityType: 'WorkspaceMilestone',
      entityId: milestoneId,
      performedById,
      metadata: { eventId, title: milestone.title },
    });

    return { deleted: true };
  }

  // ── Closure ──────────────────────────────────────────────────────────────────

  async closeWorkspace(eventId: string, user: JwtPayload) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      include: {
        event: { select: { status: true, organizationId: true } },
        items: {
          select: { title: true, category: true, status: true, priority: true, isBlocker: true },
        },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    if (workspace.closedAt) {
      return {
        closed: true,
        alreadyClosed: true,
        closedAt: workspace.closedAt.toISOString(),
        closedById: workspace.closedById,
      };
    }

    const viewerRole = await this.resolveViewerRole(workspace.event.organizationId, workspace.id, user);
    if (viewerRole !== 'manager') {
      throw new ForbiddenException('Only a workspace manager can close this workspace');
    }

    if (workspace.event.status !== 'completed') {
      throw new BadRequestException('Workspace can only be closed once the event is marked completed');
    }

    const scoreResult = computeScore(workspace.items);
    const snapshot = {
      score: scoreResult.score,
      label: scoreResult.label,
      totalWeight: scoreResult.totalWeight,
      doneWeight: scoreResult.doneWeight,
      itemStatuses: workspace.items.map((i) => ({
        title: i.title,
        category: i.category,
        status: i.status,
        priority: i.priority,
        isBlocker: i.isBlocker,
      })),
      generatedAt: new Date().toISOString(),
    };

    const updated = await this.prisma.eventWorkspace.update({
      where: { id: workspace.id },
      data: {
        closedAt: new Date(),
        closedById: user.sub,
        readinessSnapshot: snapshot as any,
      },
    });

    await this.audit.log({
      action: 'WORKSPACE_CLOSED',
      entityType: 'EventWorkspace',
      entityId: workspace.id,
      performedById: user.sub,
      metadata: { eventId, score: scoreResult.score, label: scoreResult.label },
    });

    return {
      closed: true,
      alreadyClosed: false,
      closedAt: updated.closedAt!.toISOString(),
      closedById: updated.closedById,
    };
  }

  // ── Stakeholder report ──────────────────────────────────────────────────────

  async generateStakeholderReport(eventId: string, performedById: string): Promise<Buffer> {
    // Share-safe query boundary: operational facts only. No attendee, member,
    // assignee, sponsor-contact, internal-note, or payment data enters the PDF.
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      include: {
        event: { select: { title: true, startsAt: true, venue: true, city: true, status: true } },
        items: {
          select: { title: true, category: true, status: true, priority: true, isBlocker: true, dueDate: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          take: 500,
        },
        milestones: {
          select: { title: true, dueDate: true, status: true },
          orderBy: { dueDate: 'asc' },
          take: 200,
        },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const now = new Date();
    const { score, label } = computeScore(workspace.items);
    const scorable = workspace.items.filter((item) => item.status !== 'not_applicable');
    const doneCount = scorable.filter((item) => item.status === 'done').length;
    const inProgressCount = scorable.filter((item) => item.status === 'in_progress').length;
    const notStartedCount = scorable.filter((item) => item.status === 'open').length;
    const blockedCount = scorable.filter((item) => item.status === 'blocked').length;
    const notApplicableCount = workspace.items.length - scorable.length;
    const overdueItems = scorable.filter((item) => workspaceDueState(item.dueDate, item.status, now) === 'overdue');
    const dueTodayItems = scorable.filter((item) => workspaceDueState(item.dueDate, item.status, now) === 'due_today');
    const dueSoonItems = scorable.filter((item) => workspaceDueState(item.dueDate, item.status, now) === 'due_soon');
    const activeBlockers = scorable.filter((item) => item.isBlocker && item.status !== 'done');

    const categoryMap = new Map<string, { total: number; done: number; blocked: number; overdue: number }>();
    for (const item of scorable) {
      const current = categoryMap.get(item.category) ?? { total: 0, done: 0, blocked: 0, overdue: 0 };
      current.total += 1;
      if (item.status === 'done') current.done += 1;
      if (item.status === 'blocked') current.blocked += 1;
      if (workspaceDueState(item.dueDate, item.status, now) === 'overdue') current.overdue += 1;
      categoryMap.set(item.category, current);
    }
    const categories = Array.from(categoryMap.entries());

    const priorityActions = Array.from(new Map(
      [...activeBlockers, ...overdueItems, ...dueTodayItems, ...dueSoonItems].map((item) => [item.title, item]),
    ).values());

    const pdf = await PDFDocument.create();
    pdf.setTitle(`${workspace.event.title} - Stakeholder Progress Report`);
    pdf.setAuthor('Axon Tickets');
    pdf.setSubject('Event readiness and priority action brief');
    pdf.setCreator('Axon Tickets');

    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const W = 595.28;
    const H = 841.89;
    const ML = 48;
    const MR = 48;
    const CW = W - ML - MR;
    const FOOTER_TOP = 48;
    const cViolet = rgb(0.39, 0.22, 0.78);
    const cVioletSoft = rgb(0.96, 0.94, 1);
    const cBody = rgb(0.12, 0.14, 0.19);
    const cSecond = rgb(0.38, 0.41, 0.48);
    const cMuted = rgb(0.57, 0.59, 0.65);
    const cBorder = rgb(0.87, 0.88, 0.92);
    const cPanel = rgb(0.97, 0.97, 0.99);
    const cRed = rgb(0.76, 0.10, 0.12);
    const cRedSoft = rgb(1, 0.95, 0.95);
    const cGreen = rgb(0.05, 0.55, 0.30);
    const cAmber = rgb(0.72, 0.40, 0.02);
    const cBlue = rgb(0.10, 0.36, 0.78);
    const cWhite = rgb(1, 1, 1);
    const ctx = { page: null as unknown as PDFPage, y: 0 };

    const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
      const output: string[] = [];
      for (const paragraph of (text || '').split(/\n/)) {
        if (!paragraph.trim()) { output.push(''); continue; }
        let line = '';
        for (const rawWord of paragraph.trim().split(/\s+/)) {
          const fragments: string[] = [];
          let word = rawWord;
          while (font.widthOfTextAtSize(word, size) > maxWidth && word.length > 1) {
            let cut = word.length - 1;
            while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut) + '-', size) > maxWidth) cut -= 1;
            fragments.push(word.slice(0, cut) + '-');
            word = word.slice(cut);
          }
          fragments.push(word);
          for (const fragment of fragments) {
            const candidate = line ? `${line} ${fragment}` : fragment;
            if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
            else { if (line) output.push(line); line = fragment; }
          }
        }
        if (line) output.push(line);
      }
      return output.length ? output : [''];
    };

    const newPage = (continuation = true) => {
      ctx.page = pdf.addPage([W, H]);
      if (continuation) {
        ctx.page.drawRectangle({ x: 0, y: H - 7, width: W, height: 7, color: cViolet });
        ctx.page.drawText('STAKEHOLDER PROGRESS REPORT', { x: ML, y: H - 28, font: bold, size: 7, color: cViolet });
        ctx.page.drawText('CONTINUED', { x: W - MR - bold.widthOfTextAtSize('CONTINUED', 7), y: H - 28, font: bold, size: 7, color: cMuted });
        ctx.y = H - 48;
      }
    };
    const ensureSpace = (height: number) => { if (ctx.y - height < FOOTER_TOP) newPage(); };
    const drawLines = (lines: string[], x: number, y: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>, lineHeight: number) => {
      lines.forEach((line, index) => ctx.page.drawText(line, { x, y: y - index * lineHeight, font, size, color }));
      return lines.length * lineHeight;
    };
    const sectionHeader = (title: string, subtitle?: string) => {
      ensureSpace(subtitle ? 40 : 28);
      ctx.page.drawText(title.toUpperCase(), { x: ML, y: ctx.y, font: bold, size: 8, color: cViolet });
      if (subtitle) ctx.page.drawText(subtitle, { x: ML, y: ctx.y - 13, font: regular, size: 7.5, color: cMuted });
      const lineY = ctx.y - (subtitle ? 20 : 8);
      ctx.page.drawLine({ start: { x: ML, y: lineY }, end: { x: ML + CW, y: lineY }, color: cBorder, thickness: 0.7 });
      ctx.y = lineY - 15;
    };

    newPage(false);
    const titleLines = wrapText(workspace.event.title, bold, 20, CW).slice(0, 4);
    const headerHeight = Math.max(104, 48 + titleLines.length * 24);
    ctx.page.drawRectangle({ x: 0, y: H - headerHeight, width: W, height: headerHeight, color: cViolet });
    ctx.page.drawText('STAKEHOLDER PROGRESS REPORT', { x: ML, y: H - 27, font: bold, size: 8, color: rgb(0.82, 0.76, 0.98) });
    drawLines(titleLines, ML, H - 56, bold, 20, cWhite, 24);
    ctx.y = H - headerHeight - 22;

    const generatedLabel = `Prepared ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
    const privacyLabel = 'Share-safe - no attendee personal data';
    ctx.page.drawText(generatedLabel, { x: ML, y: ctx.y, font: regular, size: 8, color: cSecond });
    ctx.page.drawText(privacyLabel, { x: W - MR - oblique.widthOfTextAtSize(privacyLabel, 8), y: ctx.y, font: oblique, size: 8, color: cViolet });
    ctx.y -= 24;

    const eventDate = workspace.event.startsAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const eventStatus = workspace.event.status.replace(/_/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
    const venue = [workspace.event.venue, workspace.event.city].filter(Boolean).join(', ') || 'Not specified';
    const detailRows: Array<[string, string]> = [['Event date', eventDate], ['Venue', venue], ['Event status', eventStatus]];
    const detailHeight = 18 + detailRows.reduce((sum, [, value]) => sum + Math.max(16, wrapText(value, regular, 9, CW - 115).length * 12), 0);
    ensureSpace(detailHeight);
    ctx.page.drawRectangle({ x: ML, y: ctx.y - detailHeight, width: CW, height: detailHeight, color: cPanel, borderColor: cBorder, borderWidth: 0.6 });
    let detailY = ctx.y - 18;
    for (const [key, value] of detailRows) {
      const lines = wrapText(value, regular, 9, CW - 115);
      ctx.page.drawText(key.toUpperCase(), { x: ML + 14, y: detailY, font: bold, size: 6.8, color: cMuted });
      drawLines(lines, ML + 110, detailY, regular, 9, cBody, 12);
      detailY -= Math.max(16, lines.length * 12);
    }
    ctx.y -= detailHeight + 22;

    const narrative: string[] = [];
    narrative.push(`Readiness is currently assessed as ${label} at ${score}%. ${doneCount} of ${scorable.length} applicable tasks are complete, while ${inProgressCount} are in progress and ${notStartedCount} have not started.`);
    if (activeBlockers.length || blockedCount) narrative.push(`${activeBlockers.length} active event blocker${activeBlockers.length === 1 ? '' : 's'} and ${blockedCount} blocked task${blockedCount === 1 ? '' : 's'} require decision or dependency follow-through before the event can be considered operationally secure.`);
    else narrative.push('No active event blockers are recorded. The immediate management focus should remain on sustaining delivery pace and closing remaining work in priority order.');
    if (overdueItems.length || dueTodayItems.length || dueSoonItems.length) narrative.push(`Schedule pressure is visible: ${overdueItems.length} task${overdueItems.length === 1 ? ' is' : 's are'} overdue, ${dueTodayItems.length} due today, and ${dueSoonItems.length} due within the next three days. Resolve overdue and blocker-tagged work first, then protect near-term commitments.`);
    else narrative.push('There are no overdue or near-term due tasks in the current workspace. Stakeholders should validate that remaining work has realistic dates and clear ownership.');
    const narrativeLines = narrative.flatMap((paragraph, index) => [...wrapText(paragraph, regular, 9.2, CW - 28), ...(index < narrative.length - 1 ? [''] : [])]);
    const narrativeHeight = 30 + narrativeLines.length * 13;
    ensureSpace(narrativeHeight + 28);
    sectionHeader('Executive Narrative', 'What the current readiness picture means for stakeholders');
    ctx.page.drawRectangle({ x: ML, y: ctx.y - narrativeHeight, width: CW, height: narrativeHeight, color: cVioletSoft, borderColor: rgb(0.84, 0.79, 0.96), borderWidth: 0.7 });
    ctx.page.drawRectangle({ x: ML, y: ctx.y - narrativeHeight, width: 5, height: narrativeHeight, color: cViolet });
    drawLines(narrativeLines, ML + 18, ctx.y - 20, regular, 9.2, cBody, 13);
    ctx.y -= narrativeHeight + 22;

    sectionHeader('Readiness At A Glance', 'Weighted score: critical 5x, high 3x, medium 2x, low 1x; N/A is excluded');
    const scoreColor = label === 'Complete' || label === 'On Track' ? cGreen : label === 'At Risk' ? cAmber : cRed;
    const cards = [
      { label: 'READINESS', value: `${score}%`, note: label, color: scoreColor },
      {
        label: 'COMPLETED',
        value: String(doneCount),
        note: `of ${scorable.length} applicable${notApplicableCount ? ` · ${notApplicableCount} N/A` : ''}`,
        color: cGreen,
      },
      { label: 'IN PROGRESS', value: String(inProgressCount), note: `${notStartedCount} not started`, color: cBlue },
      { label: 'AT RISK', value: String(overdueItems.length + blockedCount), note: `${overdueItems.length} overdue / ${blockedCount} blocked`, color: cRed },
    ];
    const cardGap = 8;
    const cardWidth = (CW - cardGap * 3) / 4;
    ensureSpace(82);
    cards.forEach((card, index) => {
      const x = ML + index * (cardWidth + cardGap);
      ctx.page.drawRectangle({ x, y: ctx.y - 66, width: cardWidth, height: 66, color: cPanel, borderColor: cBorder, borderWidth: 0.6 });
      ctx.page.drawText(card.label, { x: x + 10, y: ctx.y - 15, font: bold, size: 6.5, color: cMuted });
      ctx.page.drawText(card.value, { x: x + 10, y: ctx.y - 39, font: bold, size: 18, color: card.color });
      const note = wrapText(card.note, regular, 6.7, cardWidth - 20)[0] ?? '';
      ctx.page.drawText(note, { x: x + 10, y: ctx.y - 55, font: regular, size: 6.7, color: cSecond });
    });
    ctx.y -= 86;

    sectionHeader('Category Progress', 'Completion and delivery pressure by workstream');
    if (categories.length === 0) {
      ctx.page.drawText('No applicable checklist categories have been created.', { x: ML, y: ctx.y, font: oblique, size: 9, color: cMuted });
      ctx.y -= 24;
    }
    for (const [category, counts] of categories) {
      const nameLines = wrapText(category, bold, 8.5, 185);
      const rowHeight = Math.max(28, nameLines.length * 11 + 8);
      ensureSpace(rowHeight);
      drawLines(nameLines, ML, ctx.y - 4, bold, 8.5, cBody, 11);
      const percent = counts.total ? Math.round((counts.done / counts.total) * 100) : 100;
      const barX = ML + 205;
      const barWidth = 185;
      ctx.page.drawRectangle({ x: barX, y: ctx.y - 8, width: barWidth, height: 7, color: cBorder });
      if (percent > 0) ctx.page.drawRectangle({ x: barX, y: ctx.y - 8, width: Math.max(3, barWidth * percent / 100), height: 7, color: percent === 100 ? cGreen : percent >= 60 ? cBlue : percent >= 30 ? cAmber : cRed });
      ctx.page.drawText(`${counts.done}/${counts.total}  ${percent}%`, { x: barX + barWidth + 10, y: ctx.y - 8, font: bold, size: 8, color: cBody });
      const riskText = [counts.overdue ? `${counts.overdue} overdue` : '', counts.blocked ? `${counts.blocked} blocked` : ''].filter(Boolean).join(' / ');
      if (riskText) ctx.page.drawText(riskText, { x: barX, y: ctx.y - 22, font: regular, size: 7, color: cRed });
      ctx.y -= rowHeight;
    }
    ctx.y -= 10;

    ensureSpace(priorityActions.length > 0 ? 105 : 70);
    sectionHeader('Priority Actions', 'Unresolved blockers and time-sensitive commitments');
    if (priorityActions.length === 0) {
      ensureSpace(30);
      ctx.page.drawRectangle({ x: ML, y: ctx.y - 26, width: CW, height: 26, color: rgb(0.94, 0.99, 0.96), borderColor: rgb(0.73, 0.91, 0.80), borderWidth: 0.6 });
      ctx.page.drawText('No active blockers, overdue tasks, or tasks due within three days.', { x: ML + 12, y: ctx.y - 17, font: regular, size: 8.5, color: cGreen });
      ctx.y -= 40;
    } else {
      const actionGap = 10;
      const actionWidth = (CW - actionGap) / 2;
      for (let index = 0; index < priorityActions.length; index += 2) {
        const pair = priorityActions.slice(index, index + 2);
        const prepared = pair.map((item) => ({
          item,
          lines: wrapText(item.title, regular, 8.2, actionWidth - 24),
        }));
        const rowHeight = Math.max(...prepared.map(({ lines }) => Math.max(54, lines.length * 10 + 30)));
        ensureSpace(rowHeight + 6);
        prepared.forEach(({ item, lines }, column) => {
          const x = ML + column * (actionWidth + actionGap);
          const dueState = workspaceDueState(item.dueDate, item.status, now);
          const stateLabel = item.isBlocker ? 'BLOCKER' : dueState === 'overdue' ? 'OVERDUE' : dueState === 'due_today' ? 'DUE TODAY' : 'DUE SOON';
          ctx.page.drawRectangle({ x, y: ctx.y - rowHeight, width: actionWidth, height: rowHeight, color: cRedSoft, borderColor: rgb(0.96, 0.80, 0.80), borderWidth: 0.5 });
          ctx.page.drawRectangle({ x, y: ctx.y - rowHeight, width: 4, height: rowHeight, color: cRed });
          ctx.page.drawText(stateLabel, { x: x + 13, y: ctx.y - 15, font: bold, size: 6.3, color: cRed });
          if (item.dueDate) ctx.page.drawText(item.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), { x: x + actionWidth - 70, y: ctx.y - 15, font: regular, size: 6.5, color: cSecond });
          drawLines(lines, x + 13, ctx.y - 31, regular, 8.2, cBody, 10);
        });
        ctx.y -= rowHeight + 6;
      }
    }

    if (workspace.milestones.length > 0) {
      ctx.y -= 8;
      const estimatedMilestoneHeight = 42 + workspace.milestones.reduce((total, milestone) => {
        const lines = wrapText(milestone.title, regular, 9, CW - 165);
        return total + Math.max(25, lines.length * 12 + 8);
      }, 0);
      if (ctx.y - estimatedMilestoneHeight < FOOTER_TOP) newPage();
      sectionHeader('Milestones', 'Decision points and delivery checkpoints');
      for (const milestone of workspace.milestones) {
        const titleLines = wrapText(milestone.title, regular, 9, CW - 165);
        const rowHeight = Math.max(25, titleLines.length * 12 + 8);
        ensureSpace(rowHeight);
        drawLines(titleLines, ML, ctx.y - 5, regular, 9, cBody, 12);
        const date = milestone.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const status = milestone.status.replace(/_/g, ' ').toUpperCase();
        const statusColor = milestone.status === 'done' ? cGreen : milestone.status === 'overdue' ? cRed : milestone.status === 'at_risk' ? cAmber : cSecond;
        ctx.page.drawText(date, { x: ML + CW - 155, y: ctx.y - 5, font: regular, size: 8, color: cSecond });
        ctx.page.drawText(status, { x: ML + CW - 65, y: ctx.y - 5, font: bold, size: 7, color: statusColor });
        ctx.page.drawLine({ start: { x: ML, y: ctx.y - rowHeight + 4 }, end: { x: ML + CW, y: ctx.y - rowHeight + 4 }, color: cBorder, thickness: 0.4 });
        ctx.y -= rowHeight;
      }
    }

    const generatedIso = now.toISOString();
    const pages = pdf.getPages();
    pages.forEach((page, index) => {
      page.drawLine({ start: { x: ML, y: 40 }, end: { x: W - MR, y: 40 }, color: cBorder, thickness: 0.5 });
      page.drawText('Share-safe operational summary. No attendee personal data is included.', { x: ML, y: 27, font: oblique, size: 6.5, color: cMuted });
      const pageLabel = `Axon Tickets  |  Page ${index + 1} of ${pages.length}`;
      page.drawText(pageLabel, { x: ML, y: 14, font: regular, size: 6.5, color: cSecond });
      page.drawText(generatedIso, { x: W - MR - regular.widthOfTextAtSize(generatedIso, 6.5), y: 14, font: regular, size: 6.5, color: cSecond });
    });

    const buffer = Buffer.from(await pdf.save());
    await this.audit.log({
      action: 'REPORT_GENERATED', entityType: 'EventWorkspace', entityId: workspace.id,
      performedById, metadata: { eventId, reportType: 'stakeholder', pageCount: pages.length, score, label },
    });
    return buffer;
  }

  // ── Post-event report suite (PR-01 / PR-02) ──────────────────────────────────

  async generatePostEventReport(eventId: string, isExternal: boolean, performedById: string): Promise<Buffer> {
    // Privacy boundary enforced at query level:
    //   - Attendee: only checkedInAt, company, jobTitle — no firstName/lastName/email/phone/qrToken
    //   - Registration: only status, total, tierId, tierName, createdAt, paymentMethod — no userId
    //   - No sponsor/contact records queried
    // Bounded queries — no unbounded findMany on large attendee/registration tables (#7/#9)
    const [
      event, tiers, regStatusGroups, tierRevGroups, allRegs,
      orderRevAgg, regRevAgg, workspace,
      totalAttendees, checkedInCount, checkedInTimes,
      companyGroups, jobTitleGroups,
    ] = await Promise.all([
      this.prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, title: true, startsAt: true, endsAt: true, venue: true, city: true, status: true, maxCapacity: true },
      }),
      // Bounded: events have at most dozens of tiers in practice
      this.prisma.ticketTier.findMany({
        where: { eventId },
        select: { id: true, name: true, price: true, totalQuantity: true, soldQuantity: true },
        orderBy: { sortOrder: 'asc' },
        take: 100,
      }),
      this.prisma.registration.groupBy({
        by: ['status'],
        where: { eventId },
        _count: { _all: true },
        _sum: { attendeeCount: true },
      }),
      this.prisma.registration.groupBy({
        by: ['tierId', 'tierName'],
        where: { eventId, status: 'verified', tierId: { not: null } },
        _sum: { subtotal: true, discount: true, fees: true },
        _count: { _all: true },
      }),
      // Cap at 10,000 — sufficient for timeline/PM charts; large events should switch to SQL aggregation
      this.prisma.registration.findMany({
        where: { eventId },
        select: { createdAt: true, status: true, paymentMethod: true },
        orderBy: { createdAt: 'asc' },
        take: 10_000,
      }),
      this.prisma.order.aggregate({
        where: { eventId, status: 'paid' },
        _sum: { total: true },
      }),
      this.prisma.registration.aggregate({
        where: { eventId, status: 'verified' },
        _sum: { total: true, attendeeCount: true },
      }),
      this.prisma.eventWorkspace.findUnique({
        where: { eventId },
        include: {
          items: {
            select: { title: true, category: true, status: true, priority: true, isBlocker: true, dueDate: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            take: 500,
          },
          milestones: { select: { title: true, dueDate: true, status: true }, orderBy: { dueDate: 'asc' } },
        },
      }),
      // Aggregate counts — never load all attendee rows into memory
      this.prisma.attendee.count({ where: { registration: { eventId } } }),
      this.prisma.attendee.count({ where: { registration: { eventId }, checkedInAt: { not: null } } }),
      // Only fetch check-in times for the arrival-pattern chart (checked-in subset only)
      this.prisma.attendee.findMany({
        where: { registration: { eventId }, checkedInAt: { not: null } },
        select: { checkedInAt: true },
        take: 5_000,
      }),
      // Top 50 companies by count for demographics
      this.prisma.attendee.groupBy({
        by: ['company'],
        where: { registration: { eventId } },
        _count: { _all: true },
        orderBy: { _count: { company: 'desc' } },
        take: 50,
      }),
      // Top 50 job titles by count for demographics
      this.prisma.attendee.groupBy({
        by: ['jobTitle'],
        where: { registration: { eventId } },
        _count: { _all: true },
        orderBy: { _count: { jobTitle: 'desc' } },
        take: 50,
      }),
    ]);

    if (!event) throw new NotFoundException('Event not found');

    // ── Data aggregation ─────────────────────────────────────────────────────

    // Revenue
    const totalRevenue =
      Number(orderRevAgg._sum.total ?? 0) + Number(regRevAgg._sum.total ?? 0);
    const verifiedAttendees = Number(regRevAgg._sum.attendeeCount ?? 0);

    // Registration breakdown
    const regByStatus = Object.fromEntries(regStatusGroups.map((g) => [g.status, g._count._all]));
    const totalRegs   = regStatusGroups.reduce((s, g) => s + g._count._all, 0);

    // Registration timeline — group by YYYY-MM-DD
    const timelineMap: Record<string, number> = {};
    for (const r of allRegs) {
      const d = r.createdAt.toISOString().slice(0, 10);
      timelineMap[d] = (timelineMap[d] ?? 0) + 1;
    }
    const timeline = Object.entries(timelineMap).sort(([a], [b]) => a.localeCompare(b));

    // Payment method breakdown (confirmed regs only)
    const pmMap: Record<string, number> = {};
    for (const r of allRegs) {
      if (r.status === 'verified') {
        const pm = r.paymentMethod ?? 'Unknown';
        pmMap[pm] = (pmMap[pm] ?? 0) + 1;
      }
    }

    // Check-in
    const checkedIn   = checkedInCount;
    const checkInRate = totalAttendees > 0 ? Math.round((checkedIn / totalAttendees) * 100) : 0;

    // Arrival pattern by hour
    const arrivalMap: Record<number, number> = {};
    for (const a of checkedInTimes) {
      if (a.checkedInAt) {
        const h = new Date(a.checkedInAt).getHours();
        arrivalMap[h] = (arrivalMap[h] ?? 0) + 1;
      }
    }
    const arrivalHours = Object.entries(arrivalMap)
      .map(([h, c]) => ({ hour: Number(h), count: c }))
      .sort((a, b) => a.hour - b.hour);

    // Demographics — suppression threshold for external export (#12)
    // Groups beyond TOP_N and below SUPPRESS all roll into "Other (suppressed)" / "Other"
    // to avoid silently dropping attendees from totals.
    const SUPPRESS = isExternal ? 5 : 0;
    const TOP_N = 10;
    const buildDemoRows = (
      groups: Array<{ _count: { _all: number } }>,
      keyFn: (g: any) => string,
    ): [string, number][] => {
      const visible: [string, number][] = [];
      let hiddenCount = 0;
      const coveredCount = groups.reduce((s, g) => s + g._count._all, 0);

      for (const g of groups) {
        const key = keyFn(g);
        const cnt = g._count._all;
        if (visible.length < TOP_N && cnt > SUPPRESS) {
          visible.push([key, cnt]);
        } else {
          hiddenCount += cnt;
        }
      }
      // Attendees not in top-50 groupBy result
      hiddenCount += totalAttendees - coveredCount;

      if (hiddenCount > 0) {
        visible.push([isExternal ? 'Other (suppressed)' : 'Other', hiddenCount]);
      }
      return visible;
    };

    const companyRows  = buildDemoRows(companyGroups,  (g) => g.company?.trim()  || 'Unknown');
    const jobTitleRows = buildDemoRows(jobTitleGroups, (g) => g.jobTitle?.trim() || 'Unknown');

    // Workspace
    const wsItems = workspace?.items ?? [];
    const { score, label } = computeScore(wsItems);
    const wsDone      = wsItems.filter((i) => i.status === 'done').length;
    const wsScorableT = wsItems.filter((i) => i.status !== 'not_applicable').length;
    const blockers    = wsItems.filter((i) => i.isBlocker && i.status !== 'done' && i.status !== 'not_applicable');
    const blockedItems = wsItems.filter((i) => i.status === 'blocked');

    // Tier revenue table
    const tierRevMap = new Map(tierRevGroups.map((g) => [g.tierId, {
      // Tier revenue stays admission-only. Optional-inclusion revenue is
      // reported by the dedicated inclusion report instead of being assigned
      // to the selected admission tier.
      rev: Math.max(
        0,
        Number(g._sum.subtotal ?? 0) - Number(g._sum.discount ?? 0) + Number(g._sum.fees ?? 0),
      ),
      regs: g._count._all,
    }]));

    // ── PDF setup (mirrors generateStakeholderReport) ─────────────────────────
    const pdf = await PDFDocument.create();
    pdf.setTitle(`${event.title} — Post-Event Report Suite`);
    pdf.setAuthor('Axon Tickets');
    pdf.setSubject(isExternal ? 'Post-Event Report (External Export)' : 'Post-Event Report Suite');
    pdf.setCreator('Axon Tickets');

    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold    = await pdf.embedFont(StandardFonts.HelveticaBold);
    const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const W = 595.28, H = 841.89, ML = 50, MR = 50, CW = W - ML - MR;
    const HDR_H = 70, PAGE_FOOT = 48;

    const cViolet  = rgb(0.44, 0.30, 0.82);
    const cLtVio   = rgb(0.78, 0.70, 0.96);
    const cBody    = rgb(0.22, 0.24, 0.28);
    const cSecond  = rgb(0.45, 0.47, 0.52);
    const cBorder  = rgb(0.87, 0.89, 0.92);
    const cRed     = rgb(0.82, 0.16, 0.16);
    const cGreen   = rgb(0.12, 0.62, 0.34);
    const cAmber   = rgb(0.75, 0.50, 0.06);
    const cBlue    = rgb(0.14, 0.42, 0.82);
    const cWhite   = rgb(1, 1, 1);
    const cBg      = rgb(0.97, 0.98, 1.00);

    const trunc = (text: string, font: PDFFont, size: number, maxW: number): string => {
      if (!text) return '';
      if (font.widthOfTextAtSize(text, size) <= maxW) return text;
      let t = text;
      while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1);
      return t + '…';
    };

    const ctx = { page: null as unknown as PDFPage, cur: 0 };
    const newPage = (first = false) => {
      ctx.page = pdf.addPage([W, H]);
      ctx.cur = first ? H - HDR_H - 20 : H - 30;
    };
    const ensureSpace = (n: number) => { if (ctx.cur - n < PAGE_FOOT) newPage(); };
    const drawSection = (title: string) => {
      ensureSpace(32);
      ctx.page.drawText(title.toUpperCase(), { x: ML, y: ctx.cur, font: bold, size: 7.5, color: cViolet });
      ctx.cur -= 5;
      ctx.page.drawLine({ start: { x: ML, y: ctx.cur }, end: { x: ML + CW, y: ctx.cur }, color: cViolet, thickness: 0.4 });
      ctx.cur -= 12;
    };
    const drawKV = (label: string, value: string, labelW = 110) => {
      ctx.page.drawText(`${label}:`, { x: ML, y: ctx.cur, font: bold, size: 9, color: cSecond });
      ctx.page.drawText(trunc(value, regular, 9, CW - labelW), { x: ML + labelW, y: ctx.cur, font: regular, size: 9, color: cBody });
      ctx.cur -= 15;
    };
    const drawMiniBar = (label: string, count: number, maxCount: number, barW = 160) => {
      const lbl = trunc(label, regular, 8, CW - barW - 60);
      ctx.page.drawText(lbl, { x: ML, y: ctx.cur, font: regular, size: 8, color: cBody });
      ctx.page.drawText(String(count), { x: ML + CW - barW - 28, y: ctx.cur, font: bold, size: 8, color: cBody });
      const bx = ML + CW - barW;
      ctx.page.drawRectangle({ x: bx, y: ctx.cur + 1, width: barW, height: 7, color: cBorder });
      const fill = maxCount > 0 ? Math.max(2, Math.round((count / maxCount) * barW)) : 0;
      if (fill > 0) ctx.page.drawRectangle({ x: bx, y: ctx.cur + 1, width: fill, height: 7, color: cViolet });
      ctx.cur -= 14;
    };

    const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    const fmtMoney = (n: number) => `₱${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ── Header bar (page 1) ───────────────────────────────────────────────────
    newPage(true);
    ctx.page.drawRectangle({ x: 0, y: H - HDR_H, width: W, height: HDR_H, color: cViolet });
    ctx.page.drawText(isExternal ? 'POST-EVENT REPORT SUITE — EXTERNAL EXPORT' : 'POST-EVENT REPORT SUITE', {
      x: ML, y: H - 17, font: bold, size: 7.5, color: cLtVio,
    });
    ctx.page.drawText(trunc(event.title, bold, 18, CW), { x: ML, y: H - 46, font: bold, size: 18, color: cWhite });

    // Meta
    const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    ctx.page.drawText(`Generated ${genDate}`, { x: ML, y: ctx.cur, font: regular, size: 8, color: cSecond });
    const notice = isExternal
      ? 'External export · Attendee data suppressed · Small groups redacted'
      : 'Internal use · No attendee personal data in this report';
    ctx.page.drawText(notice, { x: W - MR - regular.widthOfTextAtSize(notice, 8), y: ctx.cur, font: oblique, size: 8, color: cViolet });
    ctx.cur -= 22;

    // ── 1. Executive Summary ─────────────────────────────────────────────────
    drawSection('1. Executive Summary');
    const evtDate = new Date(event.startsAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const evtStatus = event.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    drawKV('Event', event.title, 55);
    drawKV('Date', evtDate, 55);
    drawKV('Venue', [event.venue, event.city].filter(Boolean).join(', ') || '—', 55);
    drawKV('Status', evtStatus, 55);
    ctx.cur -= 4;

    // Quick stats grid
    const qStats = [
      { l: 'Registrations', v: fmt(totalRegs) },
      { l: 'Attendees',     v: fmt(totalAttendees) },
      { l: 'Checked In',    v: `${fmt(checkedIn)} (${checkInRate}%)` },
      { l: 'Total Revenue', v: fmtMoney(totalRevenue) },
    ];
    const qW = CW / qStats.length;
    ctx.page.drawRectangle({ x: ML, y: ctx.cur - 36, width: CW, height: 48, color: cBg });
    qStats.forEach((s, i) => {
      const sx = ML + i * qW + 6;
      ctx.page.drawText(s.l, { x: sx, y: ctx.cur - 2, font: regular, size: 7.5, color: cSecond });
      ctx.page.drawText(trunc(s.v, bold, 13, qW - 8), { x: sx, y: ctx.cur - 18, font: bold, size: 13, color: cViolet });
    });
    ctx.cur -= 46;

    // Readiness outcome
    const readColor = label === 'Complete' || label === 'On Track' ? cGreen : label === 'At Risk' ? cAmber : cRed;
    ctx.page.drawText(`Readiness: ${score}% — ${label}`, { x: ML, y: ctx.cur, font: bold, size: 10, color: readColor });
    ctx.cur -= 14;
    const readBar = Math.max(score > 0 ? 2 : 0, Math.round((score / 100) * CW));
    ctx.page.drawRectangle({ x: ML, y: ctx.cur, width: CW, height: 7, color: cBorder });
    if (readBar > 0) ctx.page.drawRectangle({ x: ML, y: ctx.cur, width: readBar, height: 7, color: readColor });
    ctx.cur -= 16;

    // Top wins (done blockers)
    const wins = wsItems.filter((i) => i.isBlocker && i.status === 'done').slice(0, 3);
    if (wins.length > 0) {
      ctx.page.drawText('Top Wins:', { x: ML, y: ctx.cur, font: bold, size: 8.5, color: cGreen });
      ctx.cur -= 12;
      for (const w of wins) {
        ctx.page.drawText(`✓ ${trunc(w.title, regular, 8.5, CW - 12)}`, { x: ML + 4, y: ctx.cur, font: regular, size: 8.5, color: cGreen });
        ctx.cur -= 12;
      }
    }
    // Top issues (unresolved blockers)
    if (blockers.length > 0) {
      ctx.page.drawText('Outstanding Issues:', { x: ML, y: ctx.cur, font: bold, size: 8.5, color: cRed });
      ctx.cur -= 12;
      for (const b of blockers.slice(0, 3)) {
        ctx.page.drawText(`· ${trunc(b.title, regular, 8.5, CW - 12)}`, { x: ML + 4, y: ctx.cur, font: regular, size: 8.5, color: cRed });
        ctx.cur -= 12;
      }
    }
    ctx.cur -= 8;

    // ── 2. Sales & Revenue ────────────────────────────────────────────────────
    drawSection('2. Sales & Revenue');
    drawKV('Total Revenue',      fmtMoney(totalRevenue));
    drawKV('Verified Regs',      fmt(regByStatus['verified'] ?? 0));
    drawKV('Total Attendees',    fmt(verifiedAttendees));
    ctx.cur -= 4;

    // Tier breakdown table
    if (tiers.length > 0) {
      ctx.page.drawText('Tier', { x: ML, y: ctx.cur, font: bold, size: 8, color: cSecond });
      ctx.page.drawText('Sold / Qty', { x: ML + 220, y: ctx.cur, font: bold, size: 8, color: cSecond });
      ctx.page.drawText('Price', { x: ML + 310, y: ctx.cur, font: bold, size: 8, color: cSecond });
      ctx.page.drawText('Revenue', { x: ML + 390, y: ctx.cur, font: bold, size: 8, color: cSecond });
      ctx.cur -= 5;
      ctx.page.drawLine({ start: { x: ML, y: ctx.cur }, end: { x: ML + CW, y: ctx.cur }, color: cBorder, thickness: 0.5 });
      ctx.cur -= 12;

      for (const t of tiers) {
        ensureSpace(18);
        const tr = tierRevMap.get(t.id);
        ctx.page.drawText(trunc(t.name, regular, 9, 210), { x: ML,       y: ctx.cur, font: regular, size: 9, color: cBody });
        ctx.page.drawText(`${t.soldQuantity} / ${t.totalQuantity}`,       { x: ML + 220, y: ctx.cur, font: regular, size: 9, color: cSecond });
        ctx.page.drawText(fmtMoney(Number(t.price)),                       { x: ML + 310, y: ctx.cur, font: regular, size: 9, color: cBody });
        ctx.page.drawText(tr ? fmtMoney(tr.rev) : '—',                    { x: ML + 390, y: ctx.cur, font: bold,    size: 9, color: cViolet });
        ctx.cur -= 15;
      }
      ctx.cur -= 6;
    }

    // Payment method
    if (Object.keys(pmMap).length > 0) {
      ctx.page.drawText('Payment Methods:', { x: ML, y: ctx.cur, font: bold, size: 8, color: cSecond });
      ctx.cur -= 12;
      const maxPm = Math.max(...Object.values(pmMap));
      for (const [pm, cnt] of Object.entries(pmMap).sort(([, a], [, b]) => b - a)) {
        ensureSpace(18);
        drawMiniBar(pm.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), cnt, maxPm, 180);
      }
    }
    ctx.cur -= 8;

    // ── 3. Registration ───────────────────────────────────────────────────────
    ensureSpace(80);
    drawSection('3. Registration');
    const statusLabels: Record<string, string> = {
      verified: 'Verified (paid)', pending_payment: 'Pending payment',
      proof_submitted: 'Proof submitted', rejected: 'Rejected', cancelled: 'Cancelled',
    };
    for (const [s, lbl] of Object.entries(statusLabels)) {
      if (regByStatus[s]) {
        ctx.page.drawText(`${lbl}:`, { x: ML, y: ctx.cur, font: bold, size: 9, color: cSecond });
        ctx.page.drawText(fmt(regByStatus[s]), { x: ML + 130, y: ctx.cur, font: bold, size: 9, color: cBody });
        ctx.cur -= 14;
      }
    }
    ctx.cur -= 4;

    // Registration timeline — top 10 days by volume
    if (timeline.length > 0) {
      ctx.page.drawText('Registration Timeline (daily):', { x: ML, y: ctx.cur, font: bold, size: 8, color: cSecond });
      ctx.cur -= 12;
      const maxDay = Math.max(...timeline.map(([, c]) => c));
      for (const [date, count] of timeline.slice(-14)) {
        ensureSpace(16);
        const d = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        drawMiniBar(d, count, maxDay, 220);
      }
    }
    ctx.cur -= 8;

    // ── 4. Attendance & Check-In ──────────────────────────────────────────────
    ensureSpace(80);
    drawSection('4. Attendance & Check-In');
    drawKV('Total Attendees', fmt(totalAttendees));
    drawKV('Checked In',      `${fmt(checkedIn)} (${checkInRate}%)`);
    drawKV('No-Show',         fmt(totalAttendees - checkedIn));
    ctx.cur -= 4;

    // Check-in rate bar
    ctx.page.drawRectangle({ x: ML, y: ctx.cur, width: CW, height: 10, color: cBorder });
    const ciBar = Math.max(checkedIn > 0 ? 3 : 0, Math.round((checkInRate / 100) * CW));
    if (ciBar > 0) ctx.page.drawRectangle({ x: ML, y: ctx.cur, width: ciBar, height: 10, color: checkInRate >= 80 ? cGreen : checkInRate >= 50 ? cBlue : cAmber });
    ctx.cur -= 18;

    // Arrival pattern
    if (arrivalHours.length > 0) {
      ctx.page.drawText('Arrival Pattern (by hour):', { x: ML, y: ctx.cur, font: bold, size: 8, color: cSecond });
      ctx.cur -= 12;
      const maxArr = Math.max(...arrivalHours.map((h) => h.count));
      for (const { hour, count } of arrivalHours) {
        ensureSpace(16);
        const hLabel = `${hour.toString().padStart(2, '0')}:00`;
        drawMiniBar(hLabel, count, maxArr, 220);
      }
    }
    ctx.cur -= 8;

    // ── 5. Operations & Blockers ──────────────────────────────────────────────
    ensureSpace(80);
    drawSection('5. Operations & Blockers');
    drawKV('Final Readiness', `${score}% — ${label}`);
    drawKV('Items Done', `${wsDone} / ${wsScorableT}`);
    ctx.cur -= 4;

    if (blockers.length > 0) {
      ctx.page.drawText('Unresolved Event Blockers:', { x: ML, y: ctx.cur, font: bold, size: 8.5, color: cRed });
      ctx.cur -= 12;
      for (const b of blockers) {
        ensureSpace(16);
        ctx.page.drawRectangle({ x: ML, y: ctx.cur + 1, width: 3, height: 9, color: cRed });
        ctx.page.drawText(trunc(b.title, regular, 9, CW - 80), { x: ML + 8, y: ctx.cur, font: regular, size: 9, color: cBody });
        if (b.dueDate) {
          const dd = `Due ${new Date(b.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
          ctx.page.drawText(dd, { x: ML + CW - regular.widthOfTextAtSize(dd, 8), y: ctx.cur, font: regular, size: 8, color: cRed });
        }
        ctx.cur -= 16;
      }
      ctx.cur -= 4;
    } else {
      ctx.page.drawText('All event blockers resolved.', { x: ML, y: ctx.cur, font: oblique, size: 9, color: cGreen });
      ctx.cur -= 16;
    }

    if (blockedItems.length > 0) {
      ctx.page.drawText('Items Stuck (status: Blocked):', { x: ML, y: ctx.cur, font: bold, size: 8.5, color: cAmber });
      ctx.cur -= 12;
      for (const b of blockedItems) {
        ensureSpace(14);
        ctx.page.drawText(`· ${trunc(b.title, regular, 9, CW - 12)} [${b.category}]`, { x: ML + 4, y: ctx.cur, font: regular, size: 9, color: cBody });
        ctx.cur -= 14;
      }
      ctx.cur -= 4;
    }

    // Milestones summary
    const msDone = workspace?.milestones.filter((m) => m.status === 'done').length ?? 0;
    const msTotal = workspace?.milestones.length ?? 0;
    if (msTotal > 0) {
      ctx.page.drawText(`Milestones: ${msDone} / ${msTotal} completed`, { x: ML, y: ctx.cur, font: regular, size: 9, color: cSecond });
      ctx.cur -= 18;
    }

    // ── 6. Demographics ───────────────────────────────────────────────────────
    if (totalAttendees > 0) {
      ensureSpace(80);
      drawSection(isExternal ? '6. Demographics (External — Groups < 5 Suppressed)' : '6. Demographics');

      if (companyRows.length > 0) {
        ctx.page.drawText('Top Companies / Organisations:', { x: ML, y: ctx.cur, font: bold, size: 8, color: cSecond });
        ctx.cur -= 12;
        const maxCo = Math.max(...companyRows.map(([, c]) => c));
        for (const [co, cnt] of companyRows.slice(0, 10)) {
          ensureSpace(16);
          drawMiniBar(co, cnt, maxCo, 180);
        }
        ctx.cur -= 6;
      }

      if (jobTitleRows.length > 0) {
        ensureSpace(40);
        ctx.page.drawText('Top Job Functions:', { x: ML, y: ctx.cur, font: bold, size: 8, color: cSecond });
        ctx.cur -= 12;
        const maxJt = Math.max(...jobTitleRows.map(([, c]) => c));
        for (const [jt, cnt] of jobTitleRows.slice(0, 8)) {
          ensureSpace(16);
          drawMiniBar(jt, cnt, maxJt, 180);
        }
      }

      if (isExternal && SUPPRESS > 0) {
        ctx.cur -= 8;
        ctx.page.drawText(
          `Groups with fewer than ${SUPPRESS} attendees are grouped into "Other (suppressed)" per privacy policy.`,
          { x: ML, y: ctx.cur, font: oblique, size: 7, color: cSecond },
        );
        ctx.cur -= 10;
      }
    }

    // ── Footer on every page ──────────────────────────────────────────────────
    const ts = new Date().toISOString();
    const allPages = pdf.getPages();
    allPages.forEach((p, i) => {
      p.drawLine({ start: { x: ML, y: 40 }, end: { x: W - MR, y: 40 }, color: cBorder, thickness: 0.4 });
      p.drawText(
        isExternal
          ? 'External export. No attendee PII. Small demographic groups suppressed. Safe for external sharing.'
          : 'Internal use only. No attendee personal data included in this report.',
        { x: ML, y: 28, font: oblique, size: 6.5, color: cSecond },
      );
      p.drawText(`Axon Tickets · Page ${i + 1} of ${allPages.length}`, { x: ML, y: 14, font: regular, size: 6.5, color: cSecond });
      p.drawText(ts, { x: W - MR - regular.widthOfTextAtSize(ts, 6.5), y: 14, font: regular, size: 6.5, color: cSecond });
    });

    const buf = Buffer.from(await pdf.save());

    await this.audit.log({
      action: 'REPORT_GENERATED',
      entityType: 'EventWorkspace',
      entityId: workspace?.id ?? eventId,
      performedById,
      metadata: { eventId, reportType: isExternal ? 'post_event_external' : 'post_event_internal' },
    });

    return buf;
  }

  // ── Serialization ───────────────────────────────────────────────────────────

  private serializeItem(item: any) {
    // If an item is 'done' but lacks completedAt (e.g. pre-migration data), fall back to updatedAt
    const resolvedCompletedAt =
      item.completedAt ?? (item.status === 'done' ? (item.updatedAt ?? null) : null);
    return {
      id: item.id,
      title: item.title,
      description: item.description ?? null,
      category: item.category,
      status: item.status,
      priority: item.priority,
      isBlocker: item.isBlocker,
      startDate: item.startDate?.toISOString() ?? null,
      dueDate: item.dueDate?.toISOString() ?? null,
      dueState: workspaceDueState(item.dueDate ?? null, item.status),
      notes: item.notes,
      completedAt: resolvedCompletedAt instanceof Date ? resolvedCompletedAt.toISOString() : (resolvedCompletedAt ?? null),
      sortOrder: item.sortOrder,
      categoryId: item.categoryId ?? null,
      assignedToUserId: item.assignedToUserId ?? null,
      assignedToName: item.assignedToUser ? userDisplayName(item.assignedToUser) : (item.assignedToName ?? null),
      assignedTo: item.assignedToUser
        ? { id: item.assignedToUser.id, name: userDisplayName(item.assignedToUser), email: item.assignedToUser.email }
        : item.assignedToName ? { id: null, name: item.assignedToName, email: null } : null,
      accountableToUserId: item.accountableToUserId ?? null,
      accountableName: item.accountableToUser ? userDisplayName(item.accountableToUser) : (item.accountableName ?? null),
      accountableTo: item.accountableToUser
        ? { id: item.accountableToUser.id, name: userDisplayName(item.accountableToUser), email: item.accountableToUser.email }
        : item.accountableName ? { id: null, name: item.accountableName, email: null } : null,
    };
  }
}
