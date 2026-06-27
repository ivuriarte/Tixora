import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  CreateWorkspaceItemDto,
  UpdateWorkspaceItemDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto/workspace.dto';

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

// ── Default items (seeded when no template is applied at workspace creation) ──

const DEFAULT_ITEMS: Array<{
  title: string;
  category: string;
  priority: Priority;
  isBlocker: boolean;
  sortOrder: number;
}> = [
  { title: 'Cover image uploaded', category: 'Event Setup', priority: 'medium', isBlocker: false, sortOrder: 0 },
  { title: 'Event description complete', category: 'Event Setup', priority: 'medium', isBlocker: false, sortOrder: 1 },
  { title: 'Ticket tiers configured', category: 'Event Setup', priority: 'critical', isBlocker: true, sortOrder: 2 },
  { title: 'Payment methods configured', category: 'Event Setup', priority: 'critical', isBlocker: true, sortOrder: 3 },
  { title: 'Event published for sale', category: 'Event Setup', priority: 'high', isBlocker: false, sortOrder: 4 },
  { title: 'Venue confirmed with organizer', category: 'Logistics', priority: 'high', isBlocker: false, sortOrder: 5 },
  { title: 'Check-in staff assigned', category: 'Logistics', priority: 'medium', isBlocker: false, sortOrder: 6 },
  { title: 'AV and equipment checklist done', category: 'Logistics', priority: 'low', isBlocker: false, sortOrder: 7 },
  { title: 'Social media announcements scheduled', category: 'Marketing', priority: 'medium', isBlocker: false, sortOrder: 8 },
  { title: 'Email announcement sent to list', category: 'Marketing', priority: 'medium', isBlocker: false, sortOrder: 9 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function userDisplayName(u: { firstName: string | null; lastName: string | null; email: string }) {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
}

function parseSafeDate(value: string): Date {
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new BadRequestException(`Invalid date value: ${value}`);
  return d;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Workspace lifecycle ─────────────────────────────────────────────────────

  async ensureWorkspace(eventId: string, creatorId: string) {
    const existing = await this.prisma.eventWorkspace.findUnique({ where: { eventId } });
    if (existing) return existing;

    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException('Event not found');

    // Create workspace bare, then member and items sequentially — avoids nested createMany
    // which can fail with PgBouncer transaction-mode connection poolers (Supabase).
    const workspace = await this.prisma.eventWorkspace.create({ data: { eventId } });

    await this.prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: creatorId, role: 'manager' },
    });

    await this.prisma.workspaceItem.createMany({
      data: DEFAULT_ITEMS.map((item) => ({ ...item, workspaceId: workspace.id })),
    });

    await this.audit.log({
      action: 'WORKSPACE_CREATED',
      entityType: 'EventWorkspace',
      entityId: workspace.id,
      performedById: creatorId,
      metadata: { eventId },
    });

    return workspace;
  }

  // ── Summary — weighted score, force-blocked, ownership, overdue ─────────────

  async getWorkspaceSummary(eventId: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      include: {
        event: { select: { id: true, title: true, startsAt: true, status: true } },
        items: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          take: 500,
        },
        milestones: {
          where: { status: { not: 'done' } },
          orderBy: { dueDate: 'asc' },
          take: 5,
        },
      },
    });

    if (!workspace) return null;

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
      (i) => i.status !== 'done' && !i.assignedToName && !i.accountableName,
    ).length;

    // Overdue = scorable, not done, past due date
    const overdueCount = scorable.filter(
      (i) => i.dueDate && i.dueDate < now && i.status !== 'done',
    ).length;

    return {
      workspaceId: workspace.id,
      eventId: workspace.eventId,
      event: workspace.event,
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
        isForceBlocked,
      },
      criticalBlockers: criticalBlockers.map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        status: i.status,
        priority: i.priority,
        dueDate: i.dueDate?.toISOString() ?? null,
        assignedTo:    i.assignedToName    ? { name: i.assignedToName    } : null,
        accountableTo: i.accountableName ? { name: i.accountableName } : null,
      })),
      blockedItems: blockedItems.map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        notes: i.notes,
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

  // ── Checklist items ─────────────────────────────────────────────────────────

  async getWorkspaceItems(eventId: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: {
        id: true,
        items: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          take: 500,
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
      categories: Object.entries(grouped).map(([category, categoryItems]) => ({
        category,
        items: categoryItems.map((i) => this.serializeItem(i)),
      })),
    };
  }

  async createWorkspaceItem(eventId: string, dto: CreateWorkspaceItemDto, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const maxOrder = await this.prisma.workspaceItem.aggregate({
      where: { workspaceId: workspace.id },
      _max: { sortOrder: true },
    });

    const item = await this.prisma.workspaceItem.create({
      data: {
        workspaceId: workspace.id,
        title: dto.title.trim(),
        category: dto.category ?? 'General',
        priority: (dto.priority as any) ?? 'medium',
        isBlocker: dto.isBlocker ?? false,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes ?? null,
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

    return this.serializeItem(item);
  }

  async updateWorkspaceItem(eventId: string, itemId: string, dto: UpdateWorkspaceItemDto, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const item = await this.prisma.workspaceItem.findFirst({
      where: { id: itemId, workspaceId: workspace.id },
    });
    if (!item) throw new NotFoundException('Item not found');

    const wasNotDone = item.status !== 'done';
    const becomingDone = dto.status === 'done';

    const updated = await this.prisma.workspaceItem.update({
      where: { id: itemId },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.status !== undefined && { status: dto.status as any }),
        ...(dto.priority !== undefined && { priority: dto.priority as any }),
        ...(dto.isBlocker !== undefined && { isBlocker: dto.isBlocker }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...('assignedToName'  in dto && { assignedToName:  dto.assignedToName  ?? null }),
        ...('accountableName' in dto && { accountableName: dto.accountableName ?? null }),
        ...(wasNotDone && becomingDone && { completedAt: new Date() }),
        ...(!becomingDone && item.completedAt && { completedAt: null }),
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

    return this.serializeItem(updated);
  }

  async deleteWorkspaceItem(eventId: string, itemId: string, performedById: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

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
        dueDate: { lt: new Date() },
        status: { notIn: ['done', 'not_applicable'] },
      },
      orderBy: { dueDate: 'asc' },
    });

    return items.map((i) => this.serializeItem(i));
  }

  // ── Assignable users ────────────────────────────────────────────────────────

  async getAssignableUsers(eventId: string) {
    // Pool: all platform admins + the event creator (organizer)
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { createdById: true },
    });

    const adminUsers = await this.prisma.user.findMany({
      where: { isAdmin: true },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 200,
    });

    const userMap = new Map(adminUsers.map((u) => [u.id, u]));

    if (event?.createdById && !userMap.has(event.createdById)) {
      const organizer = await this.prisma.user.findUnique({
        where: { id: event.createdById },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      if (organizer) userMap.set(organizer.id, organizer);
    }

    return Array.from(userMap.values())
      .sort((a, b) => (a.firstName ?? '').localeCompare(b.firstName ?? ''))
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
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const items: Array<{
      workspaceId: string;
      title: string;
      category: string;
      priority: string;
      isBlocker: boolean;
      sortOrder: number;
    }> = [];

    let globalSort = 0;
    for (const cat of template.categories) {
      for (const item of cat.items) {
        items.push({
          workspaceId: workspace.id,
          title: item.title,
          category: cat.name,
          priority: item.priority,
          isBlocker: item.isBlocker,
          sortOrder: globalSort++,
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.workspaceItem.deleteMany({ where: { workspaceId: workspace.id } }),
      this.prisma.workspaceItem.createMany({ data: items as any }),
    ]);

    await this.audit.log({
      action: 'WORKSPACE_TEMPLATE_APPLIED',
      entityType: 'EventWorkspace',
      entityId: workspace.id,
      performedById,
      metadata: { templateId, eventId },
    });

    return { templateId, templateLabel: template.label, itemsCreated: items.length };
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

  async createMilestone(eventId: string, dto: CreateMilestoneDto) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const milestone = await this.prisma.workspaceMilestone.create({
      data: {
        workspaceId: workspace.id,
        title: dto.title.trim(),
        dueDate: parseSafeDate(dto.dueDate),
        notes: dto.notes ?? null,
      },
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

  async updateMilestone(eventId: string, milestoneId: string, dto: UpdateMilestoneDto) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

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

    return {
      id: updated.id,
      title: updated.title,
      dueDate: updated.dueDate.toISOString(),
      status: updated.status,
      notes: updated.notes,
      completedAt: updated.completedAt?.toISOString() ?? null,
    };
  }

  async deleteMilestone(eventId: string, milestoneId: string) {
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const milestone = await this.prisma.workspaceMilestone.findFirst({
      where: { id: milestoneId, workspaceId: workspace.id },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');

    await this.prisma.workspaceMilestone.delete({ where: { id: milestoneId } });
    return { deleted: true };
  }

  // ── Stakeholder report ──────────────────────────────────────────────────────

  async generateStakeholderReport(eventId: string, performedById: string): Promise<Buffer> {
    // Privacy boundary: only fetch fields needed for the report.
    // Deliberately excludes: notes, user PII, attendee records, sponsor contacts.
    const workspace = await this.prisma.eventWorkspace.findUnique({
      where: { eventId },
      include: {
        event: {
          select: { title: true, startsAt: true, venue: true, city: true, status: true },
        },
        items: {
          select: {
            title: true, category: true, status: true,
            priority: true, isBlocker: true, dueDate: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        milestones: {
          select: { title: true, dueDate: true, status: true },
          orderBy: { dueDate: 'asc' },
        },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    // Compute readiness from items (same logic as computeScore but we also need counts)
    const { score, label } = computeScore(workspace.items);
    const scorable     = workspace.items.filter((i) => i.status !== 'not_applicable');
    const doneCount    = scorable.filter((i) => i.status === 'done').length;
    const inProgCount  = scorable.filter((i) => i.status === 'in_progress').length;
    const notStrtCount = scorable.filter((i) => i.status === 'open').length;
    const blockedCount = scorable.filter((i) => i.status === 'blocked').length;
    const naCount      = workspace.items.length - scorable.length;

    // Category rollup — no notes, no user data
    const catMap: Record<string, { scorable: number; done: number }> = {};
    for (const item of workspace.items) {
      if (!catMap[item.category]) catMap[item.category] = { scorable: 0, done: 0 };
      if (item.status !== 'not_applicable') {
        catMap[item.category].scorable++;
        if (item.status === 'done') catMap[item.category].done++;
      }
    }
    const categories = Object.entries(catMap).filter(([, c]) => c.scorable > 0);

    // Blockers — title only, no notes, no assignee names
    const criticalBlockers = workspace.items.filter(
      (i) => i.isBlocker && i.status !== 'done' && i.status !== 'not_applicable',
    );

    // ── PDF setup ─────────────────────────────────────────────────────────────
    const pdf = await PDFDocument.create();
    pdf.setTitle(`${workspace.event.title} — Stakeholder Progress Report`);
    pdf.setAuthor('Axon Tickets');
    pdf.setSubject('Event Readiness Stakeholder Report');
    pdf.setCreator('Axon Tickets');

    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold    = await pdf.embedFont(StandardFonts.HelveticaBold);
    const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const W    = 595.28;
    const H    = 841.89;
    const ML   = 50;
    const MR   = 50;
    const CW   = W - ML - MR;   // 495.28
    const HDR_H    = 70;
    const PAGE_FOOT = 48;

    const cViolet  = rgb(0.44, 0.30, 0.82);
    const cLtViolet = rgb(0.78, 0.70, 0.96);
    const cBody    = rgb(0.22, 0.24, 0.28);
    const cSecond  = rgb(0.45, 0.47, 0.52);
    const cBorder  = rgb(0.87, 0.89, 0.92);
    const cRed     = rgb(0.82, 0.16, 0.16);
    const cGreen   = rgb(0.12, 0.62, 0.34);
    const cAmber   = rgb(0.75, 0.50, 0.06);
    const cBlue    = rgb(0.14, 0.42, 0.82);
    const cWhite   = rgb(1, 1, 1);

    const scoreColor = (lbl: typeof label) =>
      lbl === 'Complete' || lbl === 'On Track' ? cGreen
      : lbl === 'At Risk' ? cAmber
      : cRed;

    const trunc = (text: string, font: PDFFont, size: number, maxW: number): string => {
      if (!text) return '';
      if (font.widthOfTextAtSize(text, size) <= maxW) return text;
      let t = text;
      while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1);
      return t + '…';
    };

    // ── Rendering context ─────────────────────────────────────────────────────
    const ctx = { page: null as unknown as PDFPage, cur: 0 };

    const newPage = (isFirst = false) => {
      ctx.page = pdf.addPage([W, H]);
      ctx.cur = isFirst ? H - HDR_H - 20 : H - 30;
    };

    const ensureSpace = (needed: number) => {
      if (ctx.cur - needed < PAGE_FOOT) newPage();
    };

    const drawSectionHeader = (title: string) => {
      ensureSpace(32);
      ctx.page.drawText(title.toUpperCase(), {
        x: ML, y: ctx.cur, font: bold, size: 7.5, color: cViolet,
      });
      ctx.cur -= 5;
      ctx.page.drawLine({
        start: { x: ML, y: ctx.cur }, end: { x: ML + CW, y: ctx.cur },
        color: cViolet, thickness: 0.4,
      });
      ctx.cur -= 12;
    };

    // ── Page 1 header bar ─────────────────────────────────────────────────────
    newPage(true);
    ctx.page.drawRectangle({ x: 0, y: H - HDR_H, width: W, height: HDR_H, color: cViolet });
    ctx.page.drawText('STAKEHOLDER PROGRESS REPORT', {
      x: ML, y: H - 17, font: bold, size: 7.5, color: cLtViolet,
    });
    ctx.page.drawText(trunc(workspace.event.title, bold, 18, CW), {
      x: ML, y: H - 46, font: bold, size: 18, color: cWhite,
    });

    // ── Meta row ──────────────────────────────────────────────────────────────
    const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    ctx.page.drawText(`Generated ${genDate}`, { x: ML, y: ctx.cur, font: regular, size: 8, color: cSecond });
    const notice = 'Share-safe · No attendee personal data included';
    ctx.page.drawText(notice, {
      x: W - MR - regular.widthOfTextAtSize(notice, 8),
      y: ctx.cur, font: oblique, size: 8, color: cViolet,
    });
    ctx.cur -= 22;

    // ── Section 1: Event Details ──────────────────────────────────────────────
    drawSectionHeader('Event Details');
    const evt = workspace.event;
    const evtDate = new Date(evt.startsAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const evtStatus = evt.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const venue = [evt.venue, evt.city].filter(Boolean).join(', ') || '—';
    const details: [string, string][] = [
      ['Event',  evt.title],
      ['Date',   evtDate],
      ['Venue',  venue],
      ['Status', evtStatus],
    ];
    for (const [lbl, val] of details) {
      ctx.page.drawText(`${lbl}:`, { x: ML, y: ctx.cur, font: bold, size: 9, color: cSecond });
      ctx.page.drawText(trunc(val, regular, 9, CW - 60), { x: ML + 55, y: ctx.cur, font: regular, size: 9, color: cBody });
      ctx.cur -= 15;
    }
    ctx.cur -= 10;

    // ── Section 2: Readiness Score ────────────────────────────────────────────
    drawSectionHeader('Readiness Score');
    const sColor = scoreColor(label);

    // Large score + label
    ctx.page.drawText(`${score}%`, { x: ML, y: ctx.cur - 10, font: bold, size: 38, color: sColor });
    const scoreW = bold.widthOfTextAtSize(`${score}%`, 38);
    ctx.page.drawText(label, { x: ML + scoreW + 12, y: ctx.cur, font: bold, size: 14, color: sColor });
    const labelDesc =
      label === 'Complete'          ? 'All applicable items completed.' :
      label === 'On Track'          ? 'Good progress across categories.' :
      label === 'At Risk'           ? 'Some areas need attention.' :
      label === 'Blocked'           ? 'Critical items blocked — action required.' :
                                      'Significant gaps in readiness.';
    ctx.page.drawText(labelDesc, { x: ML + scoreW + 12, y: ctx.cur - 15, font: regular, size: 8.5, color: cSecond });

    // Progress bar
    const barY = ctx.cur - 32;
    ctx.page.drawRectangle({ x: ML, y: barY, width: CW, height: 10, color: cBorder });
    const fillW = Math.max(score > 0 ? 3 : 0, Math.round((score / 100) * CW));
    if (fillW > 0) ctx.page.drawRectangle({ x: ML, y: barY, width: fillW, height: 10, color: sColor });
    ctx.cur -= 52;

    // Stats grid
    const stats = [
      { label: 'Not Started', value: notStrtCount, c: cSecond },
      { label: 'In Progress', value: inProgCount,  c: cBlue  },
      { label: 'Done',        value: doneCount,    c: cGreen },
      { label: 'Blocked',     value: blockedCount, c: blockedCount > 0 ? cRed : cSecond },
      { label: 'N/A (excl.)', value: naCount,      c: cSecond },
    ];
    const sColW = CW / stats.length;
    stats.forEach((s, i) => {
      const sx = ML + i * sColW;
      ctx.page.drawText(String(s.value), { x: sx, y: ctx.cur, font: bold, size: 16, color: s.c });
      ctx.page.drawText(s.label, { x: sx, y: ctx.cur - 13, font: regular, size: 7, color: cSecond });
    });
    ctx.cur -= 30;
    ctx.page.drawText(
      '* Weighted score: critical items 5×, high 3×, medium 2×, low 1×. Items marked N/A are excluded.',
      { x: ML, y: ctx.cur, font: oblique, size: 7, color: cSecond },
    );
    ctx.cur -= 20;

    // ── Section 3: Category Progress ──────────────────────────────────────────
    drawSectionHeader('Category Progress');
    for (const [catName, counts] of categories) {
      ensureSpace(20);
      const pct = counts.scorable > 0 ? Math.round((counts.done / counts.scorable) * 100) : 100;
      ctx.page.drawText(trunc(catName, bold, 9, 205), { x: ML, y: ctx.cur, font: bold, size: 9, color: cBody });
      ctx.page.drawText(`${counts.done} / ${counts.scorable}`, { x: ML + 220, y: ctx.cur, font: regular, size: 9, color: cSecond });
      const mBarX = ML + 270;
      const mBarW = CW - 270 - 34;
      const mBarH = 7;
      ctx.page.drawRectangle({ x: mBarX, y: ctx.cur + 1, width: mBarW, height: mBarH, color: cBorder });
      const mFill = Math.max(pct > 0 ? 2 : 0, Math.round((pct / 100) * mBarW));
      const mColor = pct === 100 ? cGreen : pct >= 60 ? cBlue : pct >= 30 ? cAmber : cRed;
      if (mFill > 0) ctx.page.drawRectangle({ x: mBarX, y: ctx.cur + 1, width: mFill, height: mBarH, color: mColor });
      ctx.page.drawText(`${pct}%`, { x: mBarX + mBarW + 5, y: ctx.cur, font: bold, size: 8, color: cBody });
      ctx.cur -= 16;
    }
    ctx.cur -= 8;

    // ── Section 4: Event Blockers ─────────────────────────────────────────────
    ensureSpace(32);
    drawSectionHeader(
      criticalBlockers.length > 0
        ? `Event Blockers (${criticalBlockers.length} unresolved)`
        : 'Event Blockers',
    );
    if (criticalBlockers.length === 0) {
      ctx.page.drawText('No active event blockers.', { x: ML, y: ctx.cur, font: oblique, size: 9, color: cGreen });
      ctx.cur -= 20;
    } else {
      for (const b of criticalBlockers) {
        ensureSpace(22);
        ctx.page.drawRectangle({ x: ML, y: ctx.cur + 1, width: 3, height: 10, color: cRed });
        ctx.page.drawText(trunc(b.title, regular, 9, CW - 85), { x: ML + 9, y: ctx.cur, font: regular, size: 9, color: cBody });
        if (b.dueDate) {
          const dueTxt = `Due ${new Date(b.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
          ctx.page.drawText(dueTxt, {
            x: ML + CW - regular.widthOfTextAtSize(dueTxt, 8),
            y: ctx.cur, font: regular, size: 8, color: cRed,
          });
        }
        ctx.cur -= 16;
      }
      ctx.cur -= 4;
    }

    // ── Section 5: Milestones ─────────────────────────────────────────────────
    if (workspace.milestones.length > 0) {
      ensureSpace(52);
      drawSectionHeader('Milestones');
      const cols = { title: ML, due: ML + 330, status: ML + 425 };
      ctx.page.drawText('Milestone',    { x: cols.title,  y: ctx.cur, font: bold, size: 8, color: cSecond });
      ctx.page.drawText('Due Date',     { x: cols.due,    y: ctx.cur, font: bold, size: 8, color: cSecond });
      ctx.page.drawText('Status',       { x: cols.status, y: ctx.cur, font: bold, size: 8, color: cSecond });
      ctx.cur -= 5;
      ctx.page.drawLine({ start: { x: ML, y: ctx.cur }, end: { x: ML + CW, y: ctx.cur }, color: cBorder, thickness: 0.5 });
      ctx.cur -= 13;

      for (const m of workspace.milestones) {
        ensureSpace(20);
        const mDue   = new Date(m.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const mLabel = m.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const mColor = m.status === 'done' ? cGreen : m.status === 'overdue' ? cRed : m.status === 'at_risk' ? cAmber : cBody;
        ctx.page.drawText(trunc(m.title, regular, 9, 310), { x: cols.title,  y: ctx.cur, font: regular, size: 9, color: cBody });
        ctx.page.drawText(mDue,   { x: cols.due,    y: ctx.cur, font: regular, size: 9, color: cSecond });
        ctx.page.drawText(mLabel, { x: cols.status, y: ctx.cur, font: bold,    size: 9, color: mColor   });
        ctx.cur -= 16;
      }
    }

    // ── Footer on every page ──────────────────────────────────────────────────
    const ts = new Date().toISOString();
    const allPages = pdf.getPages();
    allPages.forEach((p, i) => {
      p.drawLine({ start: { x: ML, y: 40 }, end: { x: W - MR, y: 40 }, color: cBorder, thickness: 0.4 });
      p.drawText(
        'This report contains no attendee personal data. Prepared for stakeholder communication only.',
        { x: ML, y: 28, font: oblique, size: 6.5, color: cSecond },
      );
      p.drawText(`Axon Tickets · Page ${i + 1} of ${allPages.length}`, {
        x: ML, y: 14, font: regular, size: 6.5, color: cSecond,
      });
      p.drawText(ts, {
        x: W - MR - regular.widthOfTextAtSize(ts, 6.5),
        y: 14, font: regular, size: 6.5, color: cSecond,
      });
    });

    const buf = Buffer.from(await pdf.save());

    await this.audit.log({
      action: 'REPORT_GENERATED',
      entityType: 'EventWorkspace',
      entityId: workspace.id,
      performedById,
      metadata: { eventId, reportType: 'stakeholder' },
    });

    return buf;
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
        _sum: { total: true },
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
    const tierRevMap = new Map(tierRevGroups.map((g) => [g.tierId, { rev: Number(g._sum.total ?? 0), regs: g._count._all }]));

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
      category: item.category,
      status: item.status,
      priority: item.priority,
      isBlocker: item.isBlocker,
      startDate: item.startDate?.toISOString() ?? null,
      dueDate: item.dueDate?.toISOString() ?? null,
      notes: item.notes,
      completedAt: resolvedCompletedAt instanceof Date ? resolvedCompletedAt.toISOString() : (resolvedCompletedAt ?? null),
      sortOrder: item.sortOrder,
      assignedToName: item.assignedToName ?? null,
      assignedTo: item.assignedToName ? { name: item.assignedToName } : null,
      accountableName: item.accountableName ?? null,
      accountableTo: item.accountableName ? { name: item.accountableName } : null,
    };
  }
}
