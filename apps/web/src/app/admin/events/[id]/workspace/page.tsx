'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChecklistStatus = 'open' | 'in_progress' | 'done' | 'blocked' | 'not_applicable';
type ChecklistPriority = 'low' | 'medium' | 'high' | 'critical';
type MilestoneStatus = 'upcoming' | 'at_risk' | 'done' | 'overdue';
type ScoreLabel = 'Complete' | 'On Track' | 'At Risk' | 'Needs Attention' | 'Blocked';

interface WorkspaceItem {
  id: string;
  title: string;
  category: string;
  status: ChecklistStatus;
  priority: ChecklistPriority;
  isBlocker: boolean;
  startDate: string | null;
  dueDate: string | null;
  notes: string | null;
  completedAt: string | null;
  sortOrder: number;
  assignedToName: string | null;
  accountableName: string | null;
}

interface CategoryGroup {
  category: string;
  items: WorkspaceItem[];
}

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

interface TemplateInfo {
  id: string;
  label: string;
  description: string;
  totalItems: number;
  categoryCount: number;
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

function isOverdue(iso: string | null, status: ChecklistStatus) {
  if (!iso || status === 'done' || status === 'not_applicable') return false;
  return new Date(iso) < new Date();
}

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

// ── Template picker modal ─────────────────────────────────────────────────────

function TemplatePicker({ eventId, hasItems, onClose }: { eventId: string; hasItems: boolean; onClose: () => void }) {
  const invalidate = useInvalidateWorkspace(eventId);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { data: templates = [] } = useQuery<TemplateInfo[]>({
    queryKey: ['workspace-templates'],
    queryFn: () => api.get<{ data: TemplateInfo[] }>(`/admin/events/${eventId}/workspace/templates`).then((r) => r.data.data),
  });

  const applyMutation = useMutation({
    mutationFn: (templateId: string) =>
      api.post(`/admin/events/${eventId}/workspace/apply-template`, { templateId }),
    onSuccess: (_, templateId) => {
      const t = templates.find((t) => t.id === templateId);
      toast.success(`"${t?.label ?? 'Template'}" applied — ${t?.totalItems ?? 0} items created.`);
      invalidate();
      onClose();
    },
    onError: () => toast.error('Could not apply template. Please try again.'),
  });

  function handleApply() {
    if (!selected) return;
    if (hasItems && !confirmed) { setConfirmed(true); return; }
    applyMutation.mutate(selected);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-modal>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Apply checklist template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-2 max-h-[55vh] overflow-y-auto">
          {templates.map((t) => (
            <button key={t.id} onClick={() => { setSelected(t.id); setConfirmed(false); }}
              className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                selected === t.id
                  ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-400'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="font-medium text-sm text-gray-900">{t.label}</span>
                <span className="text-xs text-gray-400 shrink-0">{t.totalItems} items · {t.categoryCount} categories</span>
              </div>
              <p className="text-xs text-gray-500">{t.description}</p>
            </button>
          ))}
        </div>
        {confirmed && hasItems && (
          <div className="mx-6 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            This will replace all existing checklist items. Click Apply again to confirm.
          </div>
        )}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
          <button onClick={handleApply} disabled={!selected || applyMutation.isPending}
            className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 transition-colors">
            {applyMutation.isPending ? 'Applying…' : confirmed && hasItems ? 'Confirm Replace' : 'Apply Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RACI assignment input ─────────────────────────────────────────────────────

function RaciInput({
  role, currentName, itemId, eventId, isUnowned, canEdit,
}: {
  role: 'R' | 'A';
  currentName: string | null;
  itemId: string;
  eventId: string;
  isUnowned: boolean;
  canEdit: boolean;
}) {
  const invalidate = useInvalidateWorkspace(eventId);
  const field = role === 'R' ? 'assignedToName' : 'accountableName';
  const [localValue, setLocalValue] = useState(currentName ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutation = useMutation({
    mutationFn: (name: string | null) =>
      api.patch(`/admin/events/${eventId}/workspace/items/${itemId}`, { [field]: name || null }),
    onSuccess: invalidate,
    onError: () => toast.error('Could not save assignment.'),
  });

  useEffect(() => { setLocalValue(currentName ?? ''); }, [currentName]);

  if (!canEdit) {
    if (!currentName) {
      return (
        <span className={`text-xs ${isUnowned && role === 'R' ? 'text-amber-400' : 'text-gray-300'}`}>
          {isUnowned && role === 'R' ? 'Unassigned' : '—'}
        </span>
      );
    }
    return (
      <span className="text-xs text-gray-700 truncate" title={currentName}>{currentName}</span>
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setLocalValue(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      mutation.mutate(val.trim() || null);
    }, 600);
  }

  function handleBlur() {
    if (timerRef.current) clearTimeout(timerRef.current);
    mutation.mutate(localValue.trim() || null);
  }

  const isEmpty = !localValue.trim();

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={role === 'R' ? 'Responsible…' : 'Accountable…'}
      disabled={mutation.isPending}
      className={`w-full text-xs rounded-md border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-60 bg-white ${
        isEmpty && isUnowned && role === 'R'
          ? 'border-amber-200 bg-amber-50 text-amber-700 placeholder:text-amber-400'
          : 'border-gray-200 bg-gray-50 text-gray-700 placeholder:text-gray-400'
      }`}
    />
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

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item, eventId, canEdit,
}: {
  item: WorkspaceItem; eventId: string; canEdit: boolean;
}) {
  const invalidate = useInvalidateWorkspace(eventId);
  const isNA = item.status === 'not_applicable';
  const isDone = item.status === 'done';

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/events/${eventId}/workspace/items/${item.id}`),
    onSuccess: () => { toast.success('Item removed.'); invalidate(); },
    onError: () => toast.error('Could not remove item.'),
  });

  const isDoneOrNA = isDone || isNA;
  const isUnowned = !item.assignedToName && !item.accountableName && !isDoneOrNA;

  return (
    <div
      className={`grid items-center gap-2 px-3 py-2 rounded-md group hover:bg-gray-50 transition-colors text-sm ${isNA ? 'opacity-45' : ''}`}
      style={{ gridTemplateColumns: '10px 1fr minmax(110px,150px) minmax(110px,150px) auto auto auto' }}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[item.priority]}`}
        title={`${PRIORITY_LABEL[item.priority]} priority`} />

      <div className="min-w-0">
        <span className={`truncate block ${isDone || isNA ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {item.title}
          {item.isBlocker && !isDone && !isNA && (
            <span className="ml-2 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1 py-px rounded uppercase tracking-wide">
              blocker
            </span>
          )}
        </span>
        {isDone && item.completedAt && (
          <span className="text-[10px] text-green-600 tabular-nums">
            Completed {formatDate(item.completedAt)}
          </span>
        )}
      </div>

      <RaciInput role="R" currentName={item.assignedToName}
        itemId={item.id} eventId={eventId}
        isUnowned={isUnowned} canEdit={canEdit} />

      <RaciInput role="A" currentName={item.accountableName}
        itemId={item.id} eventId={eventId}
        isUnowned={false} canEdit={canEdit} />

      <span />

      {canEdit ? (
        <StatusSelect value={item.status} itemId={item.id} eventId={eventId} />
      ) : (
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_MAP[item.status].bg} ${STATUS_MAP[item.status].color}`}>
          {STATUS_MAP[item.status].label}
        </span>
      )}

      {canEdit ? (
        <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all disabled:opacity-30 shrink-0"
          aria-label="Delete">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : <span />}
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  category, items, eventId, canEdit,
}: {
  category: string; items: WorkspaceItem[]; eventId: string; canEdit: boolean;
}) {
  const scorable = items.filter((i) => i.status !== 'not_applicable');
  const done = scorable.filter((i) => i.status === 'done').length;
  const pct = scorable.length > 0 ? Math.round((done / scorable.length) * 100) : 100;
  const na = items.length - scorable.length;

  return (
    <div>
      <div className="flex items-center gap-3 px-3 pb-1 mb-0.5">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">{category}</span>
        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-400' : pct >= 50 ? 'bg-blue-400' : 'bg-gray-300'}`}
            style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-gray-400 tabular-nums shrink-0">
          {done}/{scorable.length}
          {na > 0 && <span className="ml-1 text-gray-300">·{na} n/a</span>}
        </span>
      </div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} eventId={eventId} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

// ── Add item inline form ──────────────────────────────────────────────────────

function AddItemRow({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const invalidate = useInvalidateWorkspace(eventId);
  const [title, setTitle]         = useState('');
  const [category, setCategory]   = useState('');
  const [priority, setPriority]   = useState<ChecklistPriority>('medium');
  const [isBlocker, setIsBlocker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/events/${eventId}/workspace/items`, {
        title: title.trim(), category: category.trim() || 'General', priority, isBlocker,
      }),
    onSuccess: () => { invalidate(); setTitle(''); inputRef.current?.focus(); },
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
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input type="text" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)}
          className="w-32 bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400" />
        <select value={priority} onChange={(e) => setPriority(e.target.value as ChecklistPriority)}
          className="bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
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
  const [showTemplate, setShowTemplate]   = useState(false);
  const [showAddItem, setShowAddItem]     = useState(false);
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

  // TODO(SD-02): Replace with workspace-role check once event-scoped membership is built.
  // All platform admins can edit for MVP; wire to OrganizationMember role when available.
  const canEdit = true;

  const { data: summary, isLoading: summaryLoading } = useQuery<WorkspaceSummary | null>({
    queryKey: ['workspace-summary', id],
    queryFn: () =>
      api.get<{ data: WorkspaceSummary | null }>(`/admin/events/${id}/workspace`)
        .then((r) => r.data.data),
    enabled: !!id,
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
        <p className="text-sm text-gray-400">Loading workspace…</p>
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
      {showTemplate && (
        <TemplatePicker eventId={id} hasItems={totalItems > 0} onClose={() => setShowTemplate(false)} />
      )}

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Event Workspace</h1>
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
              disabled={downloadingPE || summary.event.status !== 'complete'}
              title={summary.event.status !== 'complete' ? 'Available once the event is marked complete' : undefined}
              className="flex items-center gap-1.5 border border-gray-200 hover:border-gray-300 text-sm text-gray-600 hover:text-gray-800 font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {downloadingPE ? 'Generating…' : 'Post-Event Report'}
            </button>
            {canEdit && (
              <button onClick={() => setShowTemplate(true)}
                className="border border-gray-200 hover:border-gray-300 text-sm text-gray-600 hover:text-gray-800 font-medium px-3 py-2 rounded-lg transition-colors">
                Choose Template
              </button>
            )}
          </div>
        </div>

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

          {(r.unownedCount > 0 || r.overdueCount > 0 || r.notApplicable > 0) && (
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
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Checklist</h2>
              <span className="text-xs text-gray-400">{totalItems} items</span>
            </div>
            {canEdit && !showAddItem && (
              <button onClick={() => setShowAddItem(true)}
                className="text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors">
                + Add item
              </button>
            )}
          </div>
          <div className="grid px-3 py-1.5 border-b border-gray-50 text-[10px] font-semibold text-gray-300 uppercase tracking-wider gap-2"
            style={{ gridTemplateColumns: '10px 1fr minmax(110px,150px) minmax(110px,150px) auto auto auto' }}>
            <span /><span>Item</span><span>Responsible</span><span>Accountable</span><span /><span>Status</span><span />
          </div>
          <div className="px-2 py-2 space-y-4">
            {showAddItem && (
              <div className="px-1">
                <AddItemRow eventId={id} onDone={() => setShowAddItem(false)} />
              </div>
            )}
            {itemsLoading ? (
              <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
            ) : !itemsData || itemsData.categories.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-400 mb-3">No items yet.</p>
                {canEdit && (
                  <button onClick={() => setShowTemplate(true)}
                    className="text-sm text-violet-600 hover:text-violet-800 font-medium">
                    Choose a template to get started →
                  </button>
                )}
              </div>
            ) : (
              itemsData.categories.map(({ category, items }) => (
                <CategorySection key={category} category={category} items={items}
                  eventId={id} canEdit={canEdit} />
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
