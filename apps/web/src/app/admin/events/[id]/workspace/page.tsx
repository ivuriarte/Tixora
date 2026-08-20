'use client';

import { useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { EmptyState, ScreenSkeleton } from '@/components/ScreenState';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChecklistStatus = 'open' | 'in_progress' | 'done' | 'blocked' | 'not_applicable';
type ChecklistPriority = 'low' | 'medium' | 'high' | 'critical';
type MilestoneStatus = 'upcoming' | 'at_risk' | 'done' | 'overdue';
type ScoreLabel = 'Complete' | 'On Track' | 'At Risk' | 'Needs Attention' | 'Blocked';

interface WorkspaceItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: ChecklistStatus;
  priority: ChecklistPriority;
  isBlocker: boolean;
  startDate: string | null;
  dueDate: string | null;
  dueState: 'completed' | 'overdue' | 'due_today' | 'due_soon' | 'upcoming' | 'unscheduled';
  notes: string | null;
  completedAt: string | null;
  sortOrder: number;
  assignedToName: string | null;
  accountableName: string | null;
  assignedToUserId: string | null;
  accountableToUserId: string | null;
  assignedTo: { id: string | null; name: string; email: string | null } | null;
  accountableTo: { id: string | null; name: string; email: string | null } | null;
}

interface CategoryGroup {
  id: string | null;
  category: string;
  sortOrder: number;
  items: WorkspaceItem[];
}

interface AssignableUser { id: string; name: string; email: string; }

interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  status: MilestoneStatus;
  notes: string | null;
  completedAt: string | null;
}

interface WorkspaceSummary {
  workspaceId: string;
  eventId: string;
  event: { id: string; title: string; startsAt: string; status: string };
  canEdit: boolean;
  viewerRole: 'manager' | 'editor' | 'viewer';
  isClosed: boolean;
  closedAt: string | null;
  closedBy: { name: string } | null;
  readiness: {
    score: number;
    label: ScoreLabel;
    totalWeight: number;
    doneWeight: number;
    scorableTotal: number;
    done: number;
    notStarted: number;
    inProgress: number;
    blocked: number;
    notApplicable: number;
    hasCriticalBlockers: boolean;
    blockedCount: number;
    unownedCount: number;
    overdueCount: number;
    dueTodayCount: number;
    dueSoonCount: number;
    isForceBlocked: boolean;
  };
  criticalBlockers: Array<{
    id: string; title: string; category: string; status: string;
    priority: string; dueDate: string | null;
    assignedTo: { name: string } | null; accountableTo: { name: string } | null;
  }>;
  blockedItems: Array<{
    id: string; title: string; category: string; notes: string | null;
    assignedTo: { name: string } | null; accountableTo: { name: string } | null;
  }>;
  upcomingMilestones: Array<{ id: string; title: string; dueDate: string; status: string }>;
  createdAt: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ChecklistStatus; label: string; color: string; bg: string }[] = [
  { value: 'open',           label: 'Not Started',  color: 'text-gray-500',   bg: 'bg-gray-100'   },
  { value: 'in_progress',    label: 'In Progress',  color: 'text-blue-700',   bg: 'bg-blue-50'    },
  { value: 'blocked',        label: 'Blocked',      color: 'text-orange-700', bg: 'bg-orange-50'  },
  { value: 'done',           label: 'Done',         color: 'text-green-700',  bg: 'bg-green-50'   },
  { value: 'not_applicable', label: 'N/A',          color: 'text-gray-400',   bg: 'bg-gray-50'    },
];
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o])) as Record<ChecklistStatus, typeof STATUS_OPTIONS[0]>;

const PRIORITY_DOT: Record<ChecklistPriority, string> = {
  low: 'bg-gray-300', medium: 'bg-blue-400', high: 'bg-amber-400', critical: 'bg-red-500',
};
const PRIORITY_LABEL: Record<ChecklistPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};

const MILESTONE_PILL: Record<MilestoneStatus, string> = {
  upcoming: 'bg-blue-50 text-blue-700',
  at_risk:  'bg-amber-50 text-amber-700',
  done:     'bg-green-50 text-green-700',
  overdue:  'bg-red-50 text-red-700',
};

const SCORE_LABEL_STYLE: Record<ScoreLabel, { badge: string; gauge: string }> = {
  Complete:          { badge: 'bg-green-100 text-green-700',  gauge: '#22c55e' },
  'On Track':        { badge: 'bg-green-50 text-green-700',   gauge: '#4ade80' },
  'At Risk':         { badge: 'bg-amber-50 text-amber-700',   gauge: '#f59e0b' },
  'Needs Attention': { badge: 'bg-red-50 text-red-600',       gauge: '#ef4444' },
  Blocked:           { badge: 'bg-orange-100 text-orange-700',gauge: '#f97316' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

function daysUntil(iso: string) {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff < 0)  return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${diff}d`;
}

const DUE_STYLE: Record<WorkspaceItem['dueState'], { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-green-50 text-green-700' },
  overdue: { label: 'Overdue', className: 'bg-red-50 text-red-700' },
  due_today: { label: 'Due today', className: 'bg-orange-50 text-orange-700' },
  due_soon: { label: 'Due soon', className: 'bg-amber-50 text-amber-700' },
  upcoming: { label: 'Upcoming', className: 'bg-blue-50 text-blue-700' },
  unscheduled: { label: 'No due date', className: 'bg-gray-50 text-gray-500' },
};

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function useInvalidateWorkspace(id: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ['workspace-summary', id] });
    qc.invalidateQueries({ queryKey: ['workspace-items', id] });
  }, [qc, id]);
}

// ── Readiness gauge ───────────────────────────────────────────────────────────

function ReadinessGauge({ score, label }: { score: number; label: ScoreLabel }) {
  const style = SCORE_LABEL_STYLE[label];
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="flex items-center gap-4">
      <div className="relative inline-flex items-center justify-center w-[90px] h-[90px] shrink-0">
        <svg width={90} height={90} viewBox="0 0 90 90" className="-rotate-90">
          <circle cx={45} cy={45} r={r} fill="none" stroke="#e5e7eb" strokeWidth={9} />
          <circle cx={45} cy={45} r={r} fill="none" stroke={style.gauge} strokeWidth={9}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-xl font-bold text-gray-900">{score}%</span>
          <span className="text-[10px] text-gray-400 mt-0.5">ready</span>
        </div>
      </div>
      <div>
        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${style.badge}`}>
          {label}
        </span>
        <p className="text-[11px] text-gray-400 mt-1.5 leading-tight">
          Weighted score — critical 5×, high 3×, medium 2×, low 1×
        </p>
      </div>
    </div>
  );
}

function OrganizationTeamPanel({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'co_owner' | 'manager' | 'member'>('member');
  const { data } = useQuery<{
    currentRole: 'owner' | 'co_owner' | 'manager' | 'member';
    canManage: boolean;
    members: Array<{ id: string; userId: string | null; name: string; email: string; role: 'owner' | 'co_owner' | 'manager' | 'member'; status: 'active' | 'invited' | 'expired' }>;
  }>({
    queryKey: ['organization-team'],
    queryFn: () => api.get<{ data: any }>('/organizations/me/members').then((response) => response.data.data),
    enabled: true,
    retry: false,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['organization-team'] });
    qc.invalidateQueries({ queryKey: ['workspace-assignable-users', eventId] });
    qc.invalidateQueries({ queryKey: ['workspace-items', eventId] });
  };
  const inviteMutation = useMutation({
    mutationFn: () => api.post('/organizations/me/members', { email: email.trim(), role }),
    onSuccess: () => { toast.success('Team invitation added.'); setEmail(''); setShowInvite(false); refresh(); },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'Could not add team member.'),
  });
  const roleMutation = useMutation({
    mutationFn: ({ memberId, nextRole }: { memberId: string; nextRole: 'co_owner' | 'manager' | 'member' }) => api.patch(`/organizations/me/members/${memberId}`, { role: nextRole }),
    onSuccess: () => { toast.success('Team role updated.'); refresh(); },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'Could not update role.'),
  });
  const removeMutation = useMutation({
    mutationFn: ({ memberId, invited }: { memberId: string; invited: boolean }) => api.delete(invited ? `/organizations/me/invitations/${memberId}` : `/organizations/me/members/${memberId}`),
    onSuccess: (response: any) => { toast.success(`Member removed${response?.data?.data?.unassignedTaskCount ? `; ${response.data.data.unassignedTaskCount} task(s) unassigned` : ''}.`); refresh(); },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'Could not remove member.'),
  });
  if (!data) return null;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-gray-900">Organizer team</h2><p className="mt-0.5 text-xs text-gray-400">Only verified members can be assigned and receive due-date reminders.</p></div>
        {data.canManage && <button onClick={() => setShowInvite((value) => !value)} className="text-sm font-medium text-violet-600">+ Add member</button>}
      </div>
      {showInvite && (
        <div className="mt-3 flex flex-wrap gap-2 rounded-lg bg-violet-50 p-3">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" className="min-w-52 flex-1 rounded-md border border-violet-200 bg-white px-3 py-2 text-sm" />
          <select value={role} onChange={(event) => setRole(event.target.value as 'co_owner' | 'manager' | 'member')} className="rounded-md border border-violet-200 bg-white px-3 py-2 text-sm"><option value="member">Member</option><option value="manager">Manager</option>{data.currentRole === 'owner' && <option value="co_owner">Co-owner</option>}</select>
          <button onClick={() => inviteMutation.mutate()} disabled={!email.includes('@') || inviteMutation.isPending} className="rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Send invite</button>
        </div>
      )}
      <div className="mt-3 divide-y divide-gray-100">
        {data.members.map((member) => (
          <div key={member.id} className="flex items-center gap-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">{initials(member.name)}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-800">{member.name}</p><p className="truncate text-xs text-gray-400">{member.email}</p></div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${member.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{member.status}</span>
            {data.canManage && member.status === 'active' && member.role !== 'owner' ? (
              <select value={member.role} onChange={(event) => roleMutation.mutate({ memberId: member.id, nextRole: event.target.value as 'co_owner' | 'manager' | 'member' })} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"><option value="member">Member</option><option value="manager">Manager</option>{data.currentRole === 'owner' && <option value="co_owner">Co-owner</option>}</select>
            ) : <span className="text-xs capitalize text-gray-500">{member.role}</span>}
            {data.canManage && member.role !== 'owner' && <button onClick={() => { const invited = member.status !== 'active'; if (window.confirm(invited ? `Revoke the invitation for ${member.email}?` : `Remove ${member.name} from the team? Their tasks will become unassigned.`)) removeMutation.mutate({ memberId: member.id, invited }); }} className="text-xs text-gray-400 hover:text-red-600">{member.status === 'active' ? 'Remove' : 'Revoke'}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── RACI assignment input ─────────────────────────────────────────────────────

function RaciInput({
  role, currentUserId, currentName, itemId, eventId, isUnowned, canEdit, members,
}: {
  role: 'R' | 'A';
  currentUserId: string | null;
  currentName: string | null;
  itemId: string;
  eventId: string;
  isUnowned: boolean;
  canEdit: boolean;
  members: AssignableUser[];
}) {
  const invalidate = useInvalidateWorkspace(eventId);
  const field = role === 'R' ? 'assignedToUserId' : 'accountableToUserId';
  const mutation = useMutation({
    mutationFn: (userId: string | null) => api.patch(`/admin/events/${eventId}/workspace/items/${itemId}`, { [field]: userId }),
    onSuccess: invalidate,
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'Could not save assignment.'),
  });
  if (!canEdit) return <span className={`truncate text-xs ${currentName ? 'text-gray-700' : isUnowned && role === 'R' ? 'text-amber-500' : 'text-gray-300'}`}>{currentName || (isUnowned && role === 'R' ? 'Unassigned' : '—')}</span>;
  return (
    <select
      value={currentUserId ?? ''}
      onChange={(event) => mutation.mutate(event.target.value || null)}
      disabled={mutation.isPending}
      aria-label={role === 'R' ? 'Responsible member' : 'Accountable member'}
      className={`w-full rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-60 ${!currentUserId && isUnowned && role === 'R' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}
    >
      <option value="">{currentName && !currentUserId ? `Relink ${currentName}` : 'Unassigned'}</option>
      {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
    </select>
  );
}

// ── Status select ─────────────────────────────────────────────────────────────

function StatusSelect({ value, itemId, eventId }: { value: ChecklistStatus; itemId: string; eventId: string }) {
  const invalidate = useInvalidateWorkspace(eventId);
  const mutation = useMutation({
    mutationFn: (status: ChecklistStatus) =>
      api.patch(`/admin/events/${eventId}/workspace/items/${itemId}`, { status }),
    onSuccess: invalidate,
    onError: () => toast.error('Status update failed.'),
  });
  const cfg = STATUS_MAP[value];
  return (
    <div className="relative">
      <select value={value} onChange={(e) => mutation.mutate(e.target.value as ChecklistStatus)}
        disabled={mutation.isPending}
        className={`appearance-none text-xs font-medium px-2 py-1 rounded-md border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400 pr-5 ${cfg.bg} ${cfg.color} disabled:opacity-60`}
        aria-label="Item status">
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center">
        <svg className={`w-3 h-3 ${cfg.color}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 4l4 4 4-4"/>
        </svg>
      </div>
    </div>
  );
}

function DueDateInput({ item, eventId, canEdit }: { item: WorkspaceItem; eventId: string; canEdit: boolean }) {
  const invalidate = useInvalidateWorkspace(eventId);
  const mutation = useMutation({
    mutationFn: (date: string) => api.patch(`/admin/events/${eventId}/workspace/items/${item.id}`, {
      dueDate: date ? new Date(`${date}T00:00:00+08:00`).toISOString() : null,
    }),
    onSuccess: invalidate,
    onError: () => toast.error('Could not update the due date.'),
  });
  const value = item.dueDate ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(item.dueDate)) : '';
  if (canEdit) return (
    <div className="flex min-w-0 items-center gap-2">
      <input type="date" value={value} onChange={(event) => mutation.mutate(event.target.value)} disabled={mutation.isPending}
        className="w-[126px] rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-violet-400" />
      <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-semibold ${DUE_STYLE[item.dueState].className}`}>{DUE_STYLE[item.dueState].label}</span>
    </div>
  );
  return <span className={`inline-block rounded-full px-2 py-1 text-[10px] font-semibold ${DUE_STYLE[item.dueState].className}`}>{DUE_STYLE[item.dueState].label}</span>;
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item, eventId, canEdit, members,
}: {
  item: WorkspaceItem; eventId: string; canEdit: boolean; members: AssignableUser[];
}) {
  const invalidate = useInvalidateWorkspace(eventId);
  const isNA = item.status === 'not_applicable';
  const isDone = item.status === 'done';
  const [editing, setEditing] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/events/${eventId}/workspace/items/${item.id}`),
    onSuccess: () => { toast.success('Item removed.'); invalidate(); },
    onError: () => toast.error('Could not remove item.'),
  });

  const isDoneOrNA = isDone || isNA;
  const isUnowned = !item.assignedToUserId && !item.accountableToUserId && !item.assignedToName && !item.accountableName && !isDoneOrNA;

  return (
    <div
      className={`grid items-start gap-3 px-3 py-3 rounded-lg group hover:bg-gray-50 transition-colors text-sm ${isNA ? 'opacity-45' : ''}`}
      style={{ gridTemplateColumns: '10px minmax(240px,1fr) 136px 136px 215px 108px 58px' }}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[item.priority]}`}
        title={`${PRIORITY_LABEL[item.priority]} priority`} />

      <div className="min-w-0">
        <span className={`block whitespace-normal break-words font-medium leading-5 ${isDone || isNA ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {item.title}
          {item.isBlocker && !isDone && !isNA && (
            <span className="ml-2 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1 py-px rounded uppercase tracking-wide">
              blocker
            </span>
          )}
        </span>
        {item.description && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-gray-500">{item.description}</p>}
        {isDone && item.completedAt && (
          <span className="text-[10px] text-green-600 tabular-nums">
            Completed {formatDate(item.completedAt)}
          </span>
        )}
      </div>

      <RaciInput role="R" currentName={item.assignedToName} currentUserId={item.assignedToUserId}
        itemId={item.id} eventId={eventId}
        isUnowned={isUnowned} canEdit={canEdit} members={members} />

      <RaciInput role="A" currentName={item.accountableName} currentUserId={item.accountableToUserId}
        itemId={item.id} eventId={eventId}
        isUnowned={false} canEdit={canEdit} members={members} />

      <DueDateInput item={item} eventId={eventId} canEdit={canEdit} />

      {canEdit ? (
        <StatusSelect value={item.status} itemId={item.id} eventId={eventId} />
      ) : (
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_MAP[item.status].bg} ${STATUS_MAP[item.status].color}`}>
          {STATUS_MAP[item.status].label}
        </span>
      )}

      {canEdit ? (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={() => setEditing(true)} className="text-xs font-medium text-violet-600 hover:text-violet-800" aria-label={`Edit ${item.title}`}>Edit</button>
          <button onClick={() => { if (window.confirm(`Delete “${item.title}”?`)) deleteMutation.mutate(); }} disabled={deleteMutation.isPending}
            className="text-gray-300 hover:text-red-500 transition-all disabled:opacity-30 shrink-0" aria-label="Delete">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ) : <span />}
      {editing && <TaskEditor item={item} eventId={eventId} members={members} onClose={() => setEditing(false)} />}
    </div>
  );
}

function TaskEditor({ item, eventId, members, onClose }: { item: WorkspaceItem; eventId: string; members: AssignableUser[]; onClose: () => void }) {
  const invalidate = useInvalidateWorkspace(eventId);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [priority, setPriority] = useState<ChecklistPriority>(item.priority);
  const [status, setStatus] = useState<ChecklistStatus>(item.status);
  const [isBlocker, setIsBlocker] = useState(item.isBlocker);
  const [assignedToUserId, setAssignedToUserId] = useState(item.assignedToUserId ?? '');
  const [accountableToUserId, setAccountableToUserId] = useState(item.accountableToUserId ?? '');
  const [dueDate, setDueDate] = useState(item.dueDate ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(item.dueDate)) : '');
  const mutation = useMutation({
    mutationFn: () => api.patch(`/admin/events/${eventId}/workspace/items/${item.id}`, {
      title: title.trim(),
      description: description.trim() || null,
      notes: notes.trim() || null,
      priority,
      status,
      isBlocker,
      assignedToUserId: assignedToUserId || null,
      accountableToUserId: accountableToUserId || null,
      dueDate: dueDate ? new Date(`${dueDate}T00:00:00+08:00`).toISOString() : null,
    }),
    onSuccess: () => { toast.success('Task updated.'); invalidate(); onClose(); },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'Could not update task.'),
  });
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label="Edit task">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close task editor" />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Checklist task</p><h2 className="mt-1 text-xl font-semibold text-gray-950">Edit task details</h2></div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">✕</button>
        </div>
        <div className="space-y-5 py-5">
          <label className="block text-sm font-medium text-gray-700">Task title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" /></label>
          <label className="block text-sm font-medium text-gray-700">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={7} placeholder="Add the full outcome, scope, dependencies, and acceptance details." className="mt-1.5 w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm leading-6 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" /><span className="mt-1 block text-right text-[11px] text-gray-400">{description.length}/5000</span></label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Responsible<select value={assignedToUserId} onChange={(event) => setAssignedToUserId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label className="text-sm font-medium text-gray-700">Accountable<select value={accountableToUserId} onChange={(event) => setAccountableToUserId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label className="text-sm font-medium text-gray-700">Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5" /></label>
            <label className="text-sm font-medium text-gray-700">Status<select value={status} onChange={(event) => setStatus(event.target.value as ChecklistStatus)} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5">{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="text-sm font-medium text-gray-700">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as ChecklistPriority)} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5">{Object.entries(PRIORITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="mt-7 flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={isBlocker} onChange={(event) => setIsBlocker(event.target.checked)} className="rounded border-gray-300 text-red-500" />Critical event blocker</label>
          </div>
          <label className="block text-sm font-medium text-gray-700">Internal notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={4} className="mt-1.5 w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm leading-6" /></label>
        </div>
        <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-gray-100 bg-white px-6 py-4"><button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600">Cancel</button><button onClick={() => mutation.mutate()} disabled={!title.trim() || mutation.isPending} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Saving…' : 'Save changes'}</button></div>
      </aside>
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  categoryId, category, items, eventId, canEdit, members,
}: {
  categoryId: string | null; category: string; items: WorkspaceItem[]; eventId: string; canEdit: boolean; members: AssignableUser[];
}) {
  const invalidate = useInvalidateWorkspace(eventId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category);
  const [adding, setAdding] = useState(false);
  const scorable = items.filter((i) => i.status !== 'not_applicable');
  const done = scorable.filter((i) => i.status === 'done').length;
  const pct = scorable.length > 0 ? Math.round((done / scorable.length) * 100) : 100;
  const na = items.length - scorable.length;
  const renameMutation = useMutation({
    mutationFn: () => api.patch(`/admin/events/${eventId}/workspace/categories/${categoryId}`, { name: name.trim() }),
    onSuccess: () => { toast.success('Category renamed.'); setEditing(false); invalidate(); },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'Could not rename category.'),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/events/${eventId}/workspace/categories/${categoryId}`),
    onSuccess: (response: any) => { toast.success(`Category removed${response?.data?.data?.deletedItemCount ? ` with ${response.data.data.deletedItemCount} task(s)` : ''}.`); invalidate(); },
    onError: () => toast.error('Could not remove category.'),
  });

  return (
    <div>
      <div className="flex items-center gap-3 px-3 pb-1 mb-0.5">
        {editing ? (
          <div className="flex items-center gap-1">
            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus className="w-44 rounded-md border border-violet-300 px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-violet-400" />
            <button onClick={() => renameMutation.mutate()} disabled={!name.trim() || renameMutation.isPending} className="text-xs font-semibold text-violet-700">Save</button>
            <button onClick={() => { setEditing(false); setName(category); }} className="text-xs text-gray-400">Cancel</button>
          </div>
        ) : <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">{category}</span>}
        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-400' : pct >= 50 ? 'bg-blue-400' : 'bg-gray-300'}`}
            style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-gray-400 tabular-nums shrink-0">
          {done}/{scorable.length}
          {na > 0 && <span className="ml-1 text-gray-300">·{na} n/a</span>}
        </span>
        {canEdit && categoryId && !editing && (
          <div className="flex items-center gap-2">
            <button onClick={() => setAdding((value) => !value)} className="text-xs font-medium text-violet-600">+ Task</button>
            <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-gray-700">Rename</button>
            <button onClick={() => { if (window.confirm(`Delete “${category}” and its ${items.length} task(s)?`)) deleteMutation.mutate(); }} className="text-xs text-gray-400 hover:text-red-600">Delete</button>
          </div>
        )}
      </div>
      {adding && categoryId && <div className="px-3 pb-2"><AddItemRow eventId={eventId} categoryId={categoryId} members={members} onDone={() => setAdding(false)} /></div>}
      <div className="space-y-0.5">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} eventId={eventId} canEdit={canEdit} members={members} />
        ))}
      </div>
    </div>
  );
}

// ── Add item inline form ──────────────────────────────────────────────────────

function AddCategoryForm({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const invalidate = useInvalidateWorkspace(eventId);
  const [name, setName] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.post(`/admin/events/${eventId}/workspace/categories`, { name: name.trim() }),
    onSuccess: () => { toast.success('Category added.'); invalidate(); onDone(); },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'Could not add category.'),
  });
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-violet-200 bg-violet-50/50 p-3">
      <input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="Category name, e.g. Venue & logistics"
        onKeyDown={(event) => { if (event.key === 'Enter' && name.trim()) mutation.mutate(); if (event.key === 'Escape') onDone(); }}
        className="flex-1 rounded-md border border-violet-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
      <button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} className="rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Add category</button>
      <button onClick={onDone} className="text-xs text-gray-500">Cancel</button>
    </div>
  );
}

function AddItemRow({ eventId, categoryId, members, onDone }: { eventId: string; categoryId: string; members: AssignableUser[]; onDone: () => void }) {
  const invalidate = useInvalidateWorkspace(eventId);
  const [title, setTitle]         = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority]   = useState<ChecklistPriority>('medium');
  const [isBlocker, setIsBlocker] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [accountableToUserId, setAccountableToUserId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/events/${eventId}/workspace/items`, {
        title: title.trim(), description: description.trim() || undefined, categoryId, priority, isBlocker,
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00+08:00`).toISOString() : undefined,
        assignedToUserId: assignedToUserId || undefined,
        accountableToUserId: accountableToUserId || undefined,
      }),
    onSuccess: () => { invalidate(); setTitle(''); setDescription(''); inputRef.current?.focus(); },
    onError: () => toast.error('Could not add item.'),
  });

  return (
    <div className="border border-dashed border-gray-200 rounded-lg px-3 py-2.5 space-y-2 bg-gray-50/60">
      <div className="flex items-center gap-2">
        <input ref={inputRef} type="text" autoFocus placeholder="New item title…" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) mutation.mutate(); if (e.key === 'Escape') onDone(); }}
          className="flex-1 bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        <button onClick={() => { if (title.trim()) mutation.mutate(); }} disabled={!title.trim() || mutation.isPending}
          className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors shrink-0">
          {mutation.isPending ? '…' : 'Add'}
        </button>
        <button onClick={onDone} className="text-gray-400 hover:text-gray-600 text-xs shrink-0">Cancel</button>
      </div>
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={2} placeholder="Description (optional)" className="w-full resize-y rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm leading-5 focus:outline-none focus:ring-1 focus:ring-violet-400" />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={priority} onChange={(e) => setPriority(e.target.value as ChecklistPriority)}
          className="bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} aria-label="Due date"
          className="bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400" />
        <select value={assignedToUserId} onChange={(event) => setAssignedToUserId(event.target.value)} aria-label="Responsible member" className="max-w-36 bg-white border border-gray-200 rounded px-2 py-1">
          <option value="">Responsible</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        <select value={accountableToUserId} onChange={(event) => setAccountableToUserId(event.target.value)} aria-label="Accountable member" className="max-w-36 bg-white border border-gray-200 rounded px-2 py-1">
          <option value="">Accountable</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-600">
          <input type="checkbox" checked={isBlocker} onChange={(e) => setIsBlocker(e.target.checked)}
            className="rounded border-gray-300 text-red-500 focus:ring-red-400" />
          Blocker
        </label>
        <span className="text-gray-400">↵ Enter to add, Esc to cancel</span>
      </div>
    </div>
  );
}

// ── Add milestone form ────────────────────────────────────────────────────────

function AddMilestoneForm({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle]     = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes]     = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/events/${eventId}/workspace/milestones`, {
        title: title.trim(),
        dueDate: new Date(`${dueDate}T00:00:00+08:00`).toISOString(),
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Milestone added.');
      qc.invalidateQueries({ queryKey: ['workspace-milestones', eventId] });
      qc.invalidateQueries({ queryKey: ['workspace-summary', eventId] });
      onDone();
    },
    onError: () => toast.error('Could not add milestone.'),
  });

  return (
    <div className="border border-dashed border-gray-200 rounded-lg px-3 py-3 space-y-2 bg-gray-50/60">
      <div className="flex gap-2">
        <input type="text" autoFocus placeholder="Milestone title…" value={title} onChange={(e) => setTitle(e.target.value)}
          className="flex-1 bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
          className="bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
      </div>
      <div className="flex gap-2 items-center">
        <input type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
          className="flex-1 bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400" />
        <button onClick={() => mutation.mutate()} disabled={!title.trim() || !dueDate || mutation.isPending}
          className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors shrink-0">
          {mutation.isPending ? '…' : 'Add'}
        </button>
        <button onClick={onDone} className="text-gray-400 hover:text-gray-600 text-xs shrink-0">Cancel</button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EventWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddMs, setShowAddMs]         = useState(false);
  const [downloading, setDownloading]         = useState(false);
  const [downloadingPE, setDownloadingPE]     = useState(false);
  const [downloadingPEExt, setDownloadingPEExt] = useState(false);

  // Reads the NestJS JSON error body from a blob response if the Content-Type isn't PDF.
  const extractBlobError = async (err: unknown): Promise<string> => {
    try {
      const blob: Blob | undefined = (err as any)?.response?.data;
      if (blob && blob.type !== 'application/pdf') {
        const text = await blob.text();
        const json = JSON.parse(text);
        return json?.message ?? 'Unexpected error';
      }
    } catch { /* fall through */ }
    const status: number | undefined = (err as any)?.response?.status;
    if (status === 401 || status === 403) return 'You do not have permission to generate this report.';
    if (status === 404) return 'Event or workspace not found.';
    return 'Could not generate report. Please try again.';
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const res = await api.get<Blob>(`/admin/events/${id}/workspace/report`, { responseType: 'blob' });
      const safeTitle = (summary?.event.title ?? 'Event').replace(/[<>:"/\\|?*]/g, '').trim();
      const date = new Date().toISOString().slice(0, 10);
      triggerDownload(res.data, `[Report]${safeTitle}(${date}).pdf`);
      toast.success('Report downloaded.');
    } catch (err) {
      toast.error(await extractBlobError(err));
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadPostEventReport = async (isExternal: boolean) => {
    const setLoading = isExternal ? setDownloadingPEExt : setDownloadingPE;
    setLoading(true);
    try {
      const apiUrl = `/admin/events/${id}/workspace/post-event-report${isExternal ? '?export=external' : ''}`;
      const res = await api.get<Blob>(apiUrl, { responseType: 'blob' });
      const safeTitle = (summary?.event.title ?? 'Event').replace(/[<>:"/\\|?*]/g, '').trim();
      const date = new Date().toISOString().slice(0, 10);
      const suffix = isExternal ? '-External' : '';
      triggerDownload(res.data, `[PostEvent${suffix}]${safeTitle}(${date}).pdf`);
      toast.success(isExternal ? 'Share-safe export downloaded.' : 'Post-event report downloaded.');
    } catch (err) {
      toast.error(await extractBlobError(err));
    } finally {
      setLoading(false);
    }
  };

  const { data: summary, isLoading: summaryLoading } = useQuery<WorkspaceSummary | null>({
    queryKey: ['workspace-summary', id],
    queryFn: () =>
      api.get<{ data: WorkspaceSummary | null }>(`/admin/events/${id}/workspace`)
        .then((r) => r.data.data),
    enabled: !!id,
  });

  // Server-enforced; this only drives which controls render. Write endpoints
  // independently re-check permission, so a stale/absent value here can only
  // hide UI, never grant access.
  const canEdit = summary?.canEdit ?? false;
  const canClose = summary?.viewerRole === 'manager';

  const { data: assignableUsers = [] } = useQuery<AssignableUser[]>({
    queryKey: ['workspace-assignable-users', id],
    queryFn: () => api.get<{ data: AssignableUser[] }>(`/admin/events/${id}/workspace/assignable-users`).then((response) => response.data.data),
    enabled: !!summary,
  });

  const closeWorkspaceMutation = useMutation({
    mutationFn: () => api.post(`/admin/events/${id}/workspace/close`),
    onSuccess: () => {
      toast.success('Workspace closed. Readiness is now locked.');
      qc.invalidateQueries({ queryKey: ['workspace-summary', id] });
    },
    onError: (err: unknown) => {
      const message = (err as any)?.response?.data?.message ?? 'Could not close workspace.';
      toast.error(message);
    },
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery<{
    workspaceId: string; categories: CategoryGroup[];
  } | null>({
    queryKey: ['workspace-items', id],
    queryFn: () =>
      api.get<{ data: { workspaceId: string; categories: CategoryGroup[] } | null }>(
        `/admin/events/${id}/workspace/items`,
      ).then((r) => r.data.data),
    enabled: !!summary,
  });

  const { data: milestones } = useQuery<Milestone[] | null>({
    queryKey: ['workspace-milestones', id],
    queryFn: () =>
      api.get<{ data: Milestone[] | null }>(`/admin/events/${id}/workspace/milestones`)
        .then((r) => r.data.data),
    enabled: !!summary,
  });

  const enableMutation = useMutation({
    mutationFn: () => api.post(`/admin/events/${id}/workspace`),
    onSuccess: () => {
      toast.success('Event Workspace enabled.');
      qc.invalidateQueries({ queryKey: ['workspace-summary', id] });
      qc.invalidateQueries({ queryKey: ['workspace-items', id] });
    },
    onError: () => toast.error('Could not enable workspace.'),
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: ({ milestoneId, status }: { milestoneId: string; status: MilestoneStatus }) =>
      api.patch(`/admin/events/${id}/workspace/milestones/${milestoneId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-milestones', id] });
      qc.invalidateQueries({ queryKey: ['workspace-summary', id] });
    },
    onError: () => toast.error('Could not update milestone.'),
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: (milestoneId: string) =>
      api.delete(`/admin/events/${id}/workspace/milestones/${milestoneId}`),
    onSuccess: () => {
      toast.success('Milestone removed.');
      qc.invalidateQueries({ queryKey: ['workspace-milestones', id] });
      qc.invalidateQueries({ queryKey: ['workspace-summary', id] });
    },
    onError: () => toast.error('Could not remove milestone.'),
  });

  if (summaryLoading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <ScreenSkeleton rows={6} />
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-gray-200 bg-white px-8 py-12 text-center max-w-md mx-auto">
          <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Enable Event Workspace</h2>
          <p className="text-sm text-gray-500 mb-6">
            Track readiness, manage checklists, and set milestones for this event.
          </p>
          <button onClick={() => enableMutation.mutate()} disabled={enableMutation.isPending}
            className="bg-violet-600 hover:bg-violet-700 text-white font-medium px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50">
            {enableMutation.isPending ? 'Enabling…' : 'Enable Workspace'}
          </button>
        </div>
      </main>
    );
  }

  const r = summary.readiness;
  const totalItems = itemsData?.categories.reduce((n, c) => n + c.items.length, 0) ?? 0;

  return (
    <>
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="axon-page-title text-3xl sm:text-4xl">Event Workspace</h1>
            <p className="text-sm text-gray-400">
              {summary.event.title} &middot; {new Date(summary.event.startsAt).toLocaleDateString('en-PH', { dateStyle: 'long' })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <button
              onClick={handleDownloadReport}
              disabled={downloading}
              className="flex items-center gap-1.5 border border-gray-200 hover:border-gray-300 text-sm text-gray-600 hover:text-gray-800 font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {downloading ? 'Generating…' : 'Readiness Report'}
            </button>
            <button
              onClick={() => handleDownloadPostEventReport(false)}
              disabled={downloadingPE || summary.event.status !== 'completed'}
              title={summary.event.status !== 'completed' ? 'Available once the event is marked complete' : undefined}
              className="flex items-center gap-1.5 border border-gray-200 hover:border-gray-300 text-sm text-gray-600 hover:text-gray-800 font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {downloadingPE ? 'Generating…' : 'Post-Event Report'}
            </button>
            {canClose && !summary.isClosed && summary.event.status === 'completed' && (
              <button
                onClick={() => {
                  if (window.confirm('Close this workspace? Readiness will be locked and a snapshot recorded. This cannot be undone.')) {
                    closeWorkspaceMutation.mutate();
                  }
                }}
                disabled={closeWorkspaceMutation.isPending}
                className="border border-gray-200 hover:border-red-300 text-sm text-gray-600 hover:text-red-700 font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {closeWorkspaceMutation.isPending ? 'Closing…' : 'Close Workspace'}
              </button>
            )}
          </div>
        </div>

        {/* Closed banner */}
        {summary.isClosed && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-3 flex items-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Workspace closed{summary.closedAt ? ` on ${formatDate(summary.closedAt)}` : ''}
            {summary.closedBy ? ` by ${summary.closedBy.name}` : ''} — readiness is locked.
          </div>
        )}

        {/* Team */}
        <OrganizationTeamPanel eventId={id} />

        {/* Readiness card */}
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 space-y-4">
          <ReadinessGauge score={r.score} label={r.label} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-gray-100">
            {([
              { label: 'Not Started', value: r.notStarted, color: 'text-gray-700', accent: false },
              { label: 'In Progress', value: r.inProgress, color: 'text-blue-700', accent: false },
              { label: 'Blocked',     value: r.blocked,    color: r.blocked > 0 ? 'text-orange-600' : 'text-gray-400', accent: r.blocked > 0 },
              { label: 'Done',        value: r.done,       color: 'text-green-700', accent: false },
            ] as const).map((s) => (
              <div key={s.label}>
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{s.label}</p>
                <div className="flex items-baseline gap-1">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  {s.accent && (
                    <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">!</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {(r.unownedCount > 0 || r.overdueCount > 0 || r.dueTodayCount > 0 || r.dueSoonCount > 0 || r.notApplicable > 0) && (
            <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100 text-xs">
              {r.unownedCount > 0 && (
                <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {r.unownedCount} unowned
                </span>
              )}
              {r.overdueCount > 0 && (
                <span className="flex items-center gap-1.5 text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {r.overdueCount} overdue
                </span>
              )}
              {r.dueTodayCount > 0 && <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-orange-700">{r.dueTodayCount} due today</span>}
              {r.dueSoonCount > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">{r.dueSoonCount} due soon</span>}
              {r.notApplicable > 0 && (
                <span className="text-gray-400">
                  {r.notApplicable} N/A · score based on {r.scorableTotal} applicable item{r.scorableTotal !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Event blockers */}
        {summary.criticalBlockers.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
            <div className="flex items-center gap-2 mb-2.5">
              <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm font-semibold text-red-800">
                {summary.criticalBlockers.length} event blocker{summary.criticalBlockers.length !== 1 ? 's' : ''} — must resolve before go-live
              </p>
            </div>
            <div className="space-y-1.5">
              {summary.criticalBlockers.map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-sm text-red-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="flex-1">{b.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {b.assignedTo
                      ? <span className="text-xs text-red-400"><span className="font-semibold">R:</span> {b.assignedTo.name}</span>
                      : <span className="text-xs text-red-300 italic">no responsible</span>}
                    {b.accountableTo && (
                      <span className="text-xs text-red-300"><span className="font-semibold">A:</span> {b.accountableTo.name}</span>
                    )}
                  </div>
                  <span className="text-xs text-red-400 shrink-0">{b.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blocked items */}
        {summary.blockedItems.length > 0 && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-4 h-4 rounded-full border-2 border-orange-500 flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              </div>
              <p className="text-sm font-semibold text-orange-800">
                {summary.blockedItems.length} blocked item{summary.blockedItems.length !== 1 ? 's' : ''} — waiting on external dependency
              </p>
            </div>
            <div className="space-y-1">
              {summary.blockedItems.map((b) => (
                <div key={b.id} className="flex items-start gap-2 text-sm text-orange-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span>{b.title}</span>
                    {b.notes && <p className="text-xs text-orange-500 mt-0.5 truncate">{b.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {b.assignedTo
                      ? <span className="text-xs text-orange-500"><span className="font-semibold">R:</span> {b.assignedTo.name}</span>
                      : <span className="text-xs text-orange-300 italic">no responsible</span>}
                    {b.accountableTo && (
                      <span className="text-xs text-orange-400"><span className="font-semibold">A:</span> {b.accountableTo.name}</span>
                    )}
                  </div>
                  <span className="text-xs text-orange-400 shrink-0">{b.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checklist */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Checklist</h2>
              <span className="text-xs text-gray-400">{totalItems} items</span>
            </div>
            {canEdit && !showAddCategory && (
              <button onClick={() => setShowAddCategory(true)}
                className="text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors">
                + Add category
              </button>
            )}
          </div>
          <div className="min-w-[1080px] grid px-3 py-2 border-b border-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wider gap-3"
            style={{ gridTemplateColumns: '10px minmax(240px,1fr) 136px 136px 215px 108px 58px' }}>
            <span /><span>Task</span><span>Responsible</span><span>Accountable</span><span>Due date</span><span>Status</span><span />
          </div>
          <div className="min-w-[1080px] px-2 py-2 space-y-4">
            {showAddCategory && (
              <div className="px-1">
                <AddCategoryForm eventId={id} onDone={() => setShowAddCategory(false)} />
              </div>
            )}
            {itemsLoading ? (
              <ScreenSkeleton rows={4} compact />
            ) : !itemsData || itemsData.categories.length === 0 ? (
              <div className="py-4">
                <EmptyState title="Build your organizer workspace" message="Start with a category, then add the tasks, owners, and due dates your event needs." action={canEdit ? (
                  <button onClick={() => setShowAddCategory(true)}
                    className="axon-pill bg-primary text-xs text-white hover:bg-primary-hover">
                    Add first category
                  </button>
                ) : undefined} />
              </div>
            ) : (
              itemsData.categories.map(({ id: categoryId, category, items }) => (
                <CategorySection key={categoryId ?? category} categoryId={categoryId} category={category} items={items}
                  eventId={id} canEdit={canEdit} members={assignableUsers} />
              ))
            )}
          </div>
        </div>

        {/* Milestones */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Milestones</h2>
            {canEdit && !showAddMs && (
              <button onClick={() => setShowAddMs(true)}
                className="text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors">
                + Add milestone
              </button>
            )}
          </div>
          <div className="px-3 py-2 space-y-1">
            {showAddMs && (
              <div className="py-1">
                <AddMilestoneForm eventId={id} onDone={() => setShowAddMs(false)} />
              </div>
            )}
            {!milestones || milestones.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No milestones yet.</p>
            ) : (
              milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-2 px-1 rounded-md group hover:bg-gray-50 transition-colors">
                  {canEdit ? (
                    <button
                      onClick={() => updateMilestoneMutation.mutate({
                        milestoneId: m.id, status: m.status === 'done' ? 'upcoming' : 'done',
                      })}
                      disabled={updateMilestoneMutation.isPending}
                      className="shrink-0 w-4 h-4 rounded-full border-2 border-gray-300 hover:border-violet-500 flex items-center justify-center transition-colors">
                      {m.status === 'done' && <div className="w-2 h-2 rounded-full bg-green-500" />}
                    </button>
                  ) : (
                    <div className={`shrink-0 w-4 h-4 rounded-full border-2 ${m.status === 'done' ? 'border-green-400' : 'border-gray-200'}`} />
                  )}
                  <span className={`flex-1 text-sm ${m.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {m.title}
                    {m.notes && <span className="text-xs text-gray-400 ml-2">{m.notes}</span>}
                  </span>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${MILESTONE_PILL[m.status]}`}>
                    {m.status === 'done' ? 'Done' : daysUntil(m.dueDate)}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{formatDate(m.dueDate)}</span>
                  {canEdit && (
                    <button onClick={() => deleteMilestoneMutation.mutate(m.id)} disabled={deleteMilestoneMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all shrink-0"
                      aria-label="Delete milestone">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </main>
    </>
  );
}
