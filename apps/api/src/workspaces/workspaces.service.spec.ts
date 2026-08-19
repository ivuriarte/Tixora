/**
 * WorkspacesService — unit tests
 *
 * Coverage:
 *  W-01  weighted score: all done → 100
 *  W-02  weighted score: partial completion with priority weights
 *  W-03  weighted score: not_applicable items excluded from weight total
 *  W-04  weighted score: all items N/A → 100 (no scorable items)
 *  W-05  force-blocked: critical item with status=blocked → isForceBlocked=true, label='Blocked'
 *  W-06  force-blocked: isBlocker item with status=blocked → isForceBlocked=true
 *  W-07  force-blocked: high score but blocked critical → label='Blocked' overrides 'On Track'
 *  W-08  force-blocked: no blocked critical → no override
 *  W-09  score label thresholds: Complete / On Track / At Risk / Needs Attention
 *  W-10  getWorkspaceSummary: unownedCount counts active items without assignee
 *  W-11  getWorkspaceSummary: done items excluded from unownedCount
 *  W-12  getWorkspaceSummary: not_applicable items excluded from unownedCount
 *  W-13  getOverdueItems: returns items past dueDate that are not done
 *  W-14  getOverdueItems: done items excluded even if past dueDate
 *  W-15  getOverdueItems: not_applicable items excluded even if past dueDate
 *  W-16  getOverdueItems: future-dated items not returned
 *  W-17  getOverdueItems: returns null when workspace doesn't exist
 *  W-18  getAssignableUsers: returns admin users mapped to id/name/email
 */

import { computeScore, PRIORITY_WEIGHTS, workspaceDueState } from './workspaces.service';
import { WorkspacesService } from './workspaces.service';

// ── computeScore pure-function tests ──────────────────────────────────────────

describe('computeScore()', () => {
  function item(
    status: string,
    priority: string,
    isBlocker = false,
  ) {
    return { status, priority, isBlocker };
  }

  // W-01
  it('returns score=100 and label=Complete when all items are done', () => {
    const items = [
      item('done', 'critical'),
      item('done', 'high'),
      item('done', 'medium'),
    ];
    const { score, label } = computeScore(items);
    expect(score).toBe(100);
    expect(label).toBe('Complete');
  });

  // W-02
  it('weights by priority: critical=5, high=3, medium=2, low=1', () => {
    // done: critical(5) + high(3) = 8
    // total: 8 + medium(2) = 10
    // score = 80
    const items = [
      item('done', 'critical'),
      item('done', 'high'),
      item('open', 'medium'),
    ];
    const { score, totalWeight, doneWeight } = computeScore(items);
    expect(totalWeight).toBe(PRIORITY_WEIGHTS.critical + PRIORITY_WEIGHTS.high + PRIORITY_WEIGHTS.medium);
    expect(doneWeight).toBe(PRIORITY_WEIGHTS.critical + PRIORITY_WEIGHTS.high);
    expect(score).toBe(Math.round((doneWeight / totalWeight) * 100));
    expect(score).toBe(80);
  });

  // W-03
  it('excludes not_applicable items from the weight total', () => {
    // scorable: done(critical=5) + open(medium=2) → total=7, done=5 → ~71%
    // not_applicable: critical — should NOT affect totalWeight
    const items = [
      item('done', 'critical'),
      item('open', 'medium'),
      item('not_applicable', 'critical'),
    ];
    const { totalWeight, doneWeight, score } = computeScore(items);
    expect(totalWeight).toBe(PRIORITY_WEIGHTS.critical + PRIORITY_WEIGHTS.medium); // 7
    expect(doneWeight).toBe(PRIORITY_WEIGHTS.critical); // 5
    expect(score).toBe(71);
  });

  // W-04
  it('returns score=100 when all items are not_applicable (no scorable items)', () => {
    const items = [
      item('not_applicable', 'critical'),
      item('not_applicable', 'high'),
    ];
    const { score, label } = computeScore(items);
    expect(score).toBe(100);
    expect(label).toBe('Complete');
  });

  // W-05
  it('force-blocks when a critical item has status=blocked', () => {
    const items = [
      item('done', 'high'),
      item('done', 'medium'),
      item('blocked', 'critical'), // triggers force-blocked
    ];
    const { isForceBlocked, label } = computeScore(items);
    expect(isForceBlocked).toBe(true);
    expect(label).toBe('Blocked');
  });

  // W-06
  it('force-blocks when an isBlocker item has status=blocked', () => {
    const items = [
      item('done', 'high'),
      item('blocked', 'medium', true), // isBlocker=true triggers force-blocked
    ];
    const { isForceBlocked, label } = computeScore(items);
    expect(isForceBlocked).toBe(true);
    expect(label).toBe('Blocked');
  });

  // W-07
  it('overrides a high numeric score with Blocked when a critical item is stuck', () => {
    // 9/10 items done = 90% but one critical item is blocked
    const items = [
      ...Array.from({ length: 9 }, () => item('done', 'low')),
      item('blocked', 'critical'),
    ];
    const { score, label, isForceBlocked } = computeScore(items);
    expect(score).toBeGreaterThan(60); // numeric score would be On Track without override
    expect(isForceBlocked).toBe(true);
    expect(label).toBe('Blocked');
  });

  // W-08
  it('does not force-block when a non-critical, non-blocker item is blocked', () => {
    const items = [
      item('done', 'high'),
      item('blocked', 'medium', false), // just a regular medium item stuck
    ];
    const { isForceBlocked } = computeScore(items);
    expect(isForceBlocked).toBe(false);
  });

  // W-09
  it('assigns correct labels per threshold', () => {
    // 100% → Complete
    expect(computeScore([item('done', 'medium')]).label).toBe('Complete');
    // 70% → On Track: done=7/10 items of equal weight
    const seventyPct = [
      ...Array.from({ length: 7 }, () => item('done', 'medium')),
      ...Array.from({ length: 3 }, () => item('open', 'medium')),
    ];
    expect(computeScore(seventyPct).label).toBe('On Track');
    // 40% → At Risk
    const fortyPct = [
      ...Array.from({ length: 4 }, () => item('done', 'medium')),
      ...Array.from({ length: 6 }, () => item('open', 'medium')),
    ];
    expect(computeScore(fortyPct).label).toBe('At Risk');
    // 39% → Needs Attention
    const thirtyNinePct = [
      ...Array.from({ length: 39 }, () => item('done', 'medium')),
      ...Array.from({ length: 61 }, () => item('open', 'medium')),
    ];
    expect(computeScore(thirtyNinePct).score).toBe(39);
    expect(computeScore(thirtyNinePct).label).toBe('Needs Attention');
  });
});

describe('workspaceDueState() — Asia/Manila calendar boundaries', () => {
  const now = new Date('2026-08-18T20:30:00Z'); // 19 Aug, 04:30 in Manila
  it('keeps the whole Manila due date valid instead of marking it overdue at midnight UTC', () => {
    expect(workspaceDueState(new Date('2026-08-18T16:00:00Z'), 'open', now)).toBe('due_today');
  });
  it('classifies the next three Manila dates as due soon', () => {
    expect(workspaceDueState(new Date('2026-08-21T16:00:00Z'), 'open', now)).toBe('due_soon');
  });
  it('never alerts completed or not-applicable tasks', () => {
    expect(workspaceDueState(new Date('2026-08-01T00:00:00Z'), 'done', now)).toBe('completed');
    expect(workspaceDueState(new Date('2026-08-01T00:00:00Z'), 'not_applicable', now)).toBe('completed');
  });
});

// ── WorkspacesService integration-style tests ─────────────────────────────────

const BASE_DATE = new Date('2026-06-25T00:00:00Z');

function makeItem(overrides: Partial<{
  id: string;
  status: string;
  priority: string;
  isBlocker: boolean;
  dueDate: Date | null;
  assignedToName: string | null;
  accountableName: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 'item_1',
    title: 'Test Item',
    category: 'General',
    status: overrides.status ?? 'open',
    priority: overrides.priority ?? 'medium',
    isBlocker: overrides.isBlocker ?? false,
    dueDate: overrides.dueDate ?? null,
    assignedToName: overrides.assignedToName ?? null,
    accountableName: overrides.accountableName ?? null,
    notes: null,
    completedAt: null,
    sortOrder: 0,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
  };
}

function makeWorkspace(items: ReturnType<typeof makeItem>[]) {
  return {
    id: 'ws_1',
    eventId: 'evt_1',
    closedAt: null as Date | null,
    closedById: null as string | null,
    closedBy: null as { firstName: string | null; lastName: string | null; email: string } | null,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    event: {
      id: 'evt_1',
      title: 'Test Event',
      startsAt: BASE_DATE,
      status: 'on_sale',
      organizationId: null as string | null,
    },
    items,
    milestones: [],
  };
}

const ADMIN_USER = { sub: 'admin_1', email: 'admin@example.com', isAdmin: true };

function makePrisma(workspaceFindUnique: unknown, extraMocks: Record<string, unknown> = {}) {
  return {
    eventWorkspace: { findUnique: jest.fn().mockResolvedValue(workspaceFindUnique) },
    event: { findUnique: jest.fn().mockResolvedValue(null) },
    organizationMember: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    workspaceMember: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    workspaceItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    ...extraMocks,
  } as any;
}

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) } as any;

// ── Unowned items (TR-01) ─────────────────────────────────────────────────────

describe('getWorkspaceSummary() — unownedCount', () => {
  // W-10
  it('counts active items without an assignee', async () => {
    const items = [
      makeItem({ id: 'a', status: 'open',        assignedToName: null }),
      makeItem({ id: 'b', status: 'in_progress',  assignedToName: 'Alice' }),
      makeItem({ id: 'c', status: 'open',         assignedToName: null }),
    ];
    const prisma = makePrisma(makeWorkspace(items));
    const service = new WorkspacesService(prisma, mockAudit);
    const summary = await service.getWorkspaceSummary('evt_1', ADMIN_USER);
    expect(summary?.readiness.unownedCount).toBe(2);
  });

  // W-11
  it('excludes done items from unownedCount even if unassigned', async () => {
    const items = [
      makeItem({ id: 'a', status: 'done', assignedToName: null }),
      makeItem({ id: 'b', status: 'open', assignedToName: null }),
    ];
    const prisma = makePrisma(makeWorkspace(items));
    const service = new WorkspacesService(prisma, mockAudit);
    const summary = await service.getWorkspaceSummary('evt_1', ADMIN_USER);
    expect(summary?.readiness.unownedCount).toBe(1);
  });

  // W-12
  it('excludes not_applicable items from unownedCount', async () => {
    const items = [
      makeItem({ id: 'a', status: 'not_applicable', assignedToName: null }),
      makeItem({ id: 'b', status: 'open',           assignedToName: null }),
    ];
    const prisma = makePrisma(makeWorkspace(items));
    const service = new WorkspacesService(prisma, mockAudit);
    const summary = await service.getWorkspaceSummary('evt_1', ADMIN_USER);
    // only 'b' is scorable and unowned
    expect(summary?.readiness.unownedCount).toBe(1);
  });
});

// ── Overdue items (TR-01) ─────────────────────────────────────────────────────

describe('getOverdueItems()', () => {
  const PAST = new Date('2026-01-01T00:00:00Z'); // definitely past

  // W-13
  it('returns items past dueDate that are not done', async () => {
    const overdueItem = makeItem({ id: 'o1', status: 'open', dueDate: PAST });
    const prisma = makePrisma({ id: 'ws_1' });
    prisma.workspaceItem.findMany.mockResolvedValue([overdueItem]);
    const service = new WorkspacesService(prisma, mockAudit);
    const result = await service.getOverdueItems('evt_1');
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe('o1');
  });

  // W-14
  it('does not return done items even if past dueDate', async () => {
    // DB query uses status: { notIn: ['done', 'not_applicable'] } — simulate correctly
    const prisma = makePrisma({ id: 'ws_1' });
    prisma.workspaceItem.findMany.mockResolvedValue([]); // Prisma filters done items
    const service = new WorkspacesService(prisma, mockAudit);
    const result = await service.getOverdueItems('evt_1');
    expect(result).toHaveLength(0);
    // Verify the query excludes done and not_applicable
    const [queryArgs] = prisma.workspaceItem.findMany.mock.calls[0];
    expect(queryArgs.where.status.notIn).toContain('done');
    expect(queryArgs.where.status.notIn).toContain('not_applicable');
  });

  // W-15
  it('does not return not_applicable items even if past dueDate', async () => {
    const prisma = makePrisma({ id: 'ws_1' });
    prisma.workspaceItem.findMany.mockResolvedValue([]);
    const service = new WorkspacesService(prisma, mockAudit);
    await service.getOverdueItems('evt_1');
    const [queryArgs] = prisma.workspaceItem.findMany.mock.calls[0];
    expect(queryArgs.where.status.notIn).toContain('not_applicable');
  });

  // W-16
  it('does not return future-dated items', async () => {
    const prisma = makePrisma({ id: 'ws_1' });
    prisma.workspaceItem.findMany.mockResolvedValue([]);
    const service = new WorkspacesService(prisma, mockAudit);
    await service.getOverdueItems('evt_1');
    const [queryArgs] = prisma.workspaceItem.findMany.mock.calls[0];
    // lt: new Date() means only items before now; a future date would not match
    expect(queryArgs.where.dueDate.lt).toBeInstanceOf(Date);
    expect(queryArgs.where.dueDate.lt.getTime()).toBeLessThanOrEqual(Date.now() + 100);
  });

  // W-17
  it('returns null when no workspace exists for the event', async () => {
    const prisma = makePrisma(null); // workspace not found
    const service = new WorkspacesService(prisma, mockAudit);
    const result = await service.getOverdueItems('evt_unknown');
    expect(result).toBeNull();
  });
});

// ── Assignable users (TR-01) ──────────────────────────────────────────────────

describe('getAssignableUsers()', () => {
  // W-18
  it('falls back to admins + creator for events with no organization', async () => {
    const prisma = makePrisma(null);
    prisma.event.findUnique.mockResolvedValue({ createdById: 'creator_1', organizationId: null });
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' },
      { id: 'u2', firstName: null,    lastName: null,    email: 'bob@example.com' },
    ]);
    const service = new WorkspacesService(prisma, mockAudit);
    const result = await service.getAssignableUsers('evt_1');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'u1', name: 'Alice Smith', email: 'alice@example.com' });
    // Falls back to email when no name set
    expect(result[1]).toEqual({ id: 'u2', name: 'bob@example.com', email: 'bob@example.com' });
    // Only admins queried
    const [queryArgs] = prisma.user.findMany.mock.calls[0];
    expect(queryArgs.where.isAdmin).toBe(true);
  });

  it('uses the event organization roster when the event belongs to an organization', async () => {
    const prisma = makePrisma(null);
    prisma.event.findUnique.mockResolvedValue({ createdById: 'creator_1', organizationId: 'org_1' });
    prisma.organizationMember.findMany.mockResolvedValue([
      { user: { id: 'u1', firstName: 'Carol', lastName: 'Owner', email: 'carol@example.com' } },
    ]);
    const service = new WorkspacesService(prisma, mockAudit);
    const result = await service.getAssignableUsers('evt_1');
    expect(result).toEqual([{ id: 'u1', name: 'Carol Owner', email: 'carol@example.com' }]);
    // Admin fallback pool must not be queried when an org roster exists
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

// ── Role resolution / canEdit (Gap 1 + Gap 2) ─────────────────────────────────

describe('getWorkspaceSummary() — canEdit / viewerRole', () => {
  const NON_ADMIN = { sub: 'user_1', email: 'user@example.com', isAdmin: false };

  it('grants manager + canEdit for platform admins regardless of org membership', async () => {
    const prisma = makePrisma(makeWorkspace([]));
    const service = new WorkspacesService(prisma, mockAudit);
    const summary = await service.getWorkspaceSummary('evt_1', ADMIN_USER);
    expect(summary?.viewerRole).toBe('manager');
    expect(summary?.canEdit).toBe(true);
    // Admin bypass must not need to query membership tables
    expect(prisma.organizationMember.findUnique).not.toHaveBeenCalled();
  });

  it('maps an org "member" role to editor with canEdit=true', async () => {
    const workspace = makeWorkspace([]);
    workspace.event.organizationId = 'org_1';
    const prisma = makePrisma(workspace);
    prisma.organizationMember.findUnique.mockResolvedValue({ role: 'member' });
    const service = new WorkspacesService(prisma, mockAudit);
    const summary = await service.getWorkspaceSummary('evt_1', NON_ADMIN);
    expect(summary?.viewerRole).toBe('editor');
    expect(summary?.canEdit).toBe(true);
  });

  it('defaults to viewer with canEdit=false when the user has no membership anywhere', async () => {
    const prisma = makePrisma(makeWorkspace([]));
    const service = new WorkspacesService(prisma, mockAudit);
    const summary = await service.getWorkspaceSummary('evt_1', NON_ADMIN);
    expect(summary?.viewerRole).toBe('viewer');
    expect(summary?.canEdit).toBe(false);
  });

  it('forces canEdit=false once the workspace is closed, even for a manager', async () => {
    const workspace = makeWorkspace([]);
    workspace.closedAt = BASE_DATE;
    const prisma = makePrisma(workspace);
    prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'manager' });
    const service = new WorkspacesService(prisma, mockAudit);
    const summary = await service.getWorkspaceSummary('evt_1', NON_ADMIN);
    expect(summary?.isClosed).toBe(true);
    expect(summary?.canEdit).toBe(false);
  });
});

// ── Workspace closure (Gap 4) ──────────────────────────────────────────────────

describe('closeWorkspace()', () => {
  function makeCloseableWorkspace(overrides: Partial<{ status: string; organizationId: string | null; closedAt: Date | null }> = {}) {
    return {
      id: 'ws_1',
      eventId: 'evt_1',
      closedAt: overrides.closedAt ?? null,
      closedById: null,
      event: { status: overrides.status ?? 'completed', organizationId: overrides.organizationId ?? null },
      items: [{ title: 'A', category: 'General', status: 'done', priority: 'medium', isBlocker: false }],
    };
  }

  it('throws NotFoundException when the workspace does not exist', async () => {
    const prisma = makePrisma(null);
    const service = new WorkspacesService(prisma, mockAudit);
    await expect(service.closeWorkspace('evt_1', ADMIN_USER)).rejects.toThrow('Workspace not found');
  });

  it('is idempotent: returns the existing closure without re-checking role or event status', async () => {
    const prisma = makePrisma(makeCloseableWorkspace({ closedAt: BASE_DATE, status: 'on_sale' }));
    const service = new WorkspacesService(prisma, mockAudit);
    const result = await service.closeWorkspace('evt_1', ADMIN_USER);
    expect(result.alreadyClosed).toBe(true);
    expect(mockAudit.log).not.toHaveBeenCalled();
  });

  it('rejects non-managers with ForbiddenException', async () => {
    const prisma = makePrisma(makeCloseableWorkspace());
    prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'editor' });
    const service = new WorkspacesService(prisma, mockAudit);
    await expect(
      service.closeWorkspace('evt_1', { sub: 'user_1', email: 'u@example.com', isAdmin: false }),
    ).rejects.toThrow('Only a workspace manager can close this workspace');
  });

  it('rejects closure before the event is marked completed', async () => {
    const prisma = makePrisma(makeCloseableWorkspace({ status: 'on_sale' }));
    const service = new WorkspacesService(prisma, mockAudit);
    await expect(service.closeWorkspace('evt_1', ADMIN_USER)).rejects.toThrow(
      'Workspace can only be closed once the event is marked completed',
    );
  });

  it('closes the workspace, persists a snapshot, and writes an audit log', async () => {
    const prisma = makePrisma(makeCloseableWorkspace());
    prisma.eventWorkspace.update = jest.fn().mockResolvedValue({
      closedAt: BASE_DATE,
      closedById: ADMIN_USER.sub,
    });
    const service = new WorkspacesService(prisma, mockAudit);
    const result = await service.closeWorkspace('evt_1', ADMIN_USER);

    expect(result.alreadyClosed).toBe(false);
    expect(prisma.eventWorkspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws_1' },
        data: expect.objectContaining({
          closedById: ADMIN_USER.sub,
          readinessSnapshot: expect.objectContaining({ score: 100, label: 'Complete' }),
        }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'WORKSPACE_CLOSED', performedById: ADMIN_USER.sub }),
    );
  });
});

// ── Closed-workspace mutation guard + expanded audit (Gap 4 + Gap 5) ──────────

describe('updateWorkspaceItem() — closed guard & audit expansion', () => {
  it('rejects edits once the workspace is closed', async () => {
    const prisma = makePrisma({ id: 'ws_1', closedAt: BASE_DATE });
    const service = new WorkspacesService(prisma, mockAudit);
    await expect(
      service.updateWorkspaceItem('evt_1', 'item_1', { status: 'done' }, 'user_1'),
    ).rejects.toThrow('Workspace is closed and read-only');
  });

  it('logs a distinct audit action for an assignee change (not just status)', async () => {
    const prisma = makePrisma({ id: 'ws_1', closedAt: null });
    const existingItem = makeItem({ id: 'item_1', assignedToName: null });
    prisma.workspaceItem.findFirst.mockResolvedValue(existingItem);
    prisma.workspaceItem.update.mockResolvedValue({ ...existingItem, assignedToName: 'Dana' });
    const service = new WorkspacesService(prisma, mockAudit);

    await service.updateWorkspaceItem('evt_1', 'item_1', { assignedToName: 'Dana' }, 'user_1');

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORKSPACE_ITEM_ASSIGNEE_CHANGED',
        metadata: expect.objectContaining({ role: 'responsible', from: null, to: 'Dana' }),
      }),
    );
  });

  it('logs a distinct audit action for a blocker flag change', async () => {
    const prisma = makePrisma({ id: 'ws_1', closedAt: null });
    const existingItem = makeItem({ id: 'item_1', isBlocker: false });
    prisma.workspaceItem.findFirst.mockResolvedValue(existingItem);
    prisma.workspaceItem.update.mockResolvedValue({ ...existingItem, isBlocker: true });
    const service = new WorkspacesService(prisma, mockAudit);

    await service.updateWorkspaceItem('evt_1', 'item_1', { isBlocker: true }, 'user_1');

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORKSPACE_ITEM_BLOCKER_FLAG_CHANGED',
        metadata: expect.objectContaining({ from: false, to: true }),
      }),
    );
  });
});
