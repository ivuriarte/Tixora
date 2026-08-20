'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { ScreenSkeleton } from '@/components/ScreenState';

type TaskStatus = 'open' | 'in_progress' | 'done' | 'blocked' | 'not_applicable';
type DueState = 'completed' | 'overdue' | 'due_today' | 'due_soon' | 'upcoming' | 'unscheduled';

interface TaskUpdate {
  id: string;
  message: string | null;
  previousStatus: TaskStatus | null;
  nextStatus: TaskStatus | null;
  author: { id: string; name: string };
  createdAt: string;
}

interface MyTask {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  isBlocker: boolean;
  dueDate: string | null;
  dueState: DueState;
  notes: string | null;
  assignmentRoles: Array<'responsible' | 'accountable'>;
  recentUpdates: TaskUpdate[];
}

interface MyTasksResponse {
  workspaceId: string;
  isClosed: boolean;
  event: { id: string; title: string; startsAt: string };
  summary: { total: number; open: number; inProgress: number; overdue: number; done: number };
  tasks: MyTask[];
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Not Started',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
  not_applicable: 'Not Applicable',
};

const DUE_STYLE: Record<DueState, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  overdue: { label: 'Overdue', className: 'bg-red-50 text-red-700 border-red-200' },
  due_today: { label: 'Due today', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  due_soon: { label: 'Due soon', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  upcoming: { label: 'Upcoming', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  unscheduled: { label: 'No due date', className: 'bg-gray-50 text-gray-600 border-gray-200' },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' });
}

function TaskCard({ task, eventId, locked, focused }: { task: MyTask; eventId: string; locked: boolean; focused: boolean }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(task.dueState === 'overdue' || task.dueState === 'due_today');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<TaskStatus>(task.status);
  useEffect(() => setStatus(task.status), [task.status]);
  useEffect(() => {
    if (!focused) return;
    setExpanded(true);
    window.requestAnimationFrame(() => document.getElementById(`task-${task.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [focused, task.id]);
  const mutation = useMutation({
    mutationFn: () => api.post(`/admin/events/${eventId}/workspace/items/${task.id}/updates`, {
      message: message.trim() || undefined,
      status: status !== task.status ? status : undefined,
    }),
    onSuccess: () => {
      toast.success('Progress update saved.');
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['workspace-my-tasks', eventId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-summary', eventId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-items', eventId] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'Could not save the update.'),
  });
  const due = DUE_STYLE[task.dueState];
  return (
    <article id={`task-${task.id}`} className={`overflow-hidden rounded-2xl border bg-white ${focused ? 'border-violet-400 ring-4 ring-violet-100' : task.dueState === 'overdue' ? 'border-red-200 shadow-[0_8px_28px_rgba(185,28,28,0.08)]' : 'border-gray-200'}`}>
      <button onClick={() => setExpanded((value) => !value)} className="flex w-full items-start gap-4 px-5 py-5 text-left">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${task.priority === 'critical' ? 'bg-red-500' : task.priority === 'high' ? 'bg-amber-400' : task.priority === 'medium' ? 'bg-blue-400' : 'bg-gray-300'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-base font-semibold leading-6 text-gray-950">{task.title}</h2>
            {task.isBlocker && <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">Blocker</span>}
          </div>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-gray-400">{task.category}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {task.assignmentRoles.map((role) => <span key={role} className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-violet-700">{role}</span>)}
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${due.className}`}>{due.label}{task.dueDate ? ` · ${formatDate(task.dueDate)}` : ''}</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">{STATUS_LABEL[task.status]}</span>
          </div>
        </div>
        <span className="mt-1 text-sm text-gray-400">{expanded ? 'Hide' : 'Open'}</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <section><h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Description</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{task.description || 'No description has been added yet.'}</p></section>
              {task.notes && <section><h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Notes</h3><p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-gray-50 p-3 text-sm leading-6 text-gray-700">{task.notes}</p></section>}
              <section><h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Recent activity</h3>{task.recentUpdates.length === 0 ? <p className="mt-2 text-sm text-gray-400">No progress updates yet.</p> : <div className="mt-2 space-y-3">{task.recentUpdates.map((update) => <div key={update.id} className="border-l-2 border-violet-200 pl-3"><p className="text-sm text-gray-700">{update.message || (update.previousStatus && update.nextStatus ? `${STATUS_LABEL[update.previousStatus]} → ${STATUS_LABEL[update.nextStatus]}` : 'Progress updated')}</p><p className="mt-1 text-[11px] text-gray-400">{update.author.name} · {formatDate(update.createdAt)}</p></div>)}</div>}</section>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="h-fit rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
              <h3 className="text-sm font-semibold text-gray-900">Post a progress update</h3>
              <label className="mt-3 block text-xs font-medium text-gray-600">Status<select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} disabled={locked} className="mt-1.5 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"><option value="open">Not Started</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></label>
              <label className="mt-3 block text-xs font-medium text-gray-600">Update note<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={4} disabled={locked} placeholder="What changed, what is blocked, or what happens next?" className="mt-1.5 w-full resize-y rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm leading-5" /></label>
              <button type="submit" disabled={locked || mutation.isPending || (!message.trim() && status === task.status)} className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{locked ? 'Workspace closed' : mutation.isPending ? 'Saving…' : 'Save update'}</button>
            </form>
          </div>
        </div>
      )}
    </article>
  );
}

export default function MyTasksPage() {
  const { id } = useParams<{ id: string }>();
  const focusTaskId = useSearchParams().get('task');
  const [filter, setFilter] = useState<'all' | 'attention' | 'active' | 'done'>('all');
  const { data, isLoading } = useQuery<MyTasksResponse | null>({
    queryKey: ['workspace-my-tasks', id],
    queryFn: () => api.get<{ data: MyTasksResponse | null }>(`/admin/events/${id}/workspace/my-tasks`).then((response) => response.data.data),
    enabled: Boolean(id),
  });
  if (isLoading) return <main className="mx-auto max-w-6xl px-6 py-10"><ScreenSkeleton rows={6} /></main>;
  if (!data) return <main className="mx-auto max-w-3xl px-6 py-16 text-center"><h1 className="text-2xl font-semibold text-gray-950">My Tasks</h1><p className="mt-2 text-sm text-gray-500">The event workspace has not been enabled yet.</p></main>;
  const tasks = data.tasks.filter((task) => filter === 'all'
    || (filter === 'attention' && ['overdue', 'due_today', 'due_soon'].includes(task.dueState))
    || (filter === 'active' && ['open', 'in_progress', 'blocked'].includes(task.status))
    || (filter === 'done' && task.status === 'done'));
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Personal event queue</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">My Tasks</h1><p className="mt-1 text-sm text-gray-500">{data.event.title} · Responsible and Accountable assignments only</p></div><p className="text-sm text-gray-500">Event date <span className="font-medium text-gray-800">{formatDate(data.event.startsAt)}</span></p></header>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">{[{ label: 'Assigned', value: data.summary.total, style: 'text-gray-950' }, { label: 'Not Started', value: data.summary.open, style: 'text-gray-700' }, { label: 'In Progress', value: data.summary.inProgress, style: 'text-blue-700' }, { label: 'Overdue', value: data.summary.overdue, style: 'text-red-700' }, { label: 'Done', value: data.summary.done, style: 'text-emerald-700' }].map((item) => <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{item.label}</p><p className={`mt-1 text-2xl font-bold ${item.style}`}>{item.value}</p></div>)}</section>
      <div className="flex flex-wrap gap-2">{(['all', 'attention', 'active', 'done'] as const).map((option) => <button key={option} onClick={() => setFilter(option)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${filter === option ? 'bg-violet-600 text-white' : 'border border-gray-200 bg-white text-gray-600'}`}>{option === 'attention' ? 'Needs attention' : option}</button>)}</div>
      {tasks.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center"><h2 className="font-semibold text-gray-900">No tasks in this view</h2><p className="mt-1 text-sm text-gray-500">Tasks appear here as soon as you are assigned as Responsible or Accountable.</p></div> : <div className="space-y-4">{tasks.map((task) => <TaskCard key={task.id} task={task} eventId={id} locked={data.isClosed} focused={focusTaskId === task.id} />)}</div>}
    </main>
  );
}
