'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

const TABS = [
  {
    label: 'Edit Event',
    section: 'event',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
      </svg>
    ),
    exact: true,
  },
  {
    label: 'Optional Inclusions',
    section: 'inclusions',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75v16.5m8.25-8.25H3.75M6.75 6.75l10.5 10.5m0-10.5-10.5 10.5" />
      </svg>
    ),
    exact: false,
  },
  {
    label: 'Workspace',
    section: 'workspace',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    exact: false,
  },
  {
    label: 'My Tasks',
    section: 'my-tasks',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5.25H6.75A2.25 2.25 0 004.5 7.5v11.25A2.25 2.25 0 006.75 21h10.5a2.25 2.25 0 002.25-2.25V7.5a2.25 2.25 0 00-2.25-2.25H15M9 5.25a3 3 0 006 0M9 5.25a3 3 0 016 0M9 12l1.5 1.5L14 10" />
      </svg>
    ),
    exact: false,
  },
  {
    label: 'Icebreaker',
    section: 'icebreaker',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
    exact: false,
  },
];

export default function EventDetailLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { data: event } = useQuery<{ access?: { canManageEvent: boolean } }>({
    queryKey: ['admin-event', id],
    queryFn: () => api.get<{ data: { access?: { canManageEvent: boolean } } }>(`/admin/events/${id}`).then((response) => response.data.data),
    enabled: Boolean(id),
  });

  return (
    <div>
      <div className="border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6">
          <nav className="flex overflow-x-auto" aria-label="Event sections">
            {TABS.map((tab) => {
              const label = tab.section === 'event' && event?.access?.canManageEvent === false
                ? 'Event Details'
                : tab.label;
              const href = tab.section === 'workspace'
                ? `/admin/events/${id}/workspace`
                : tab.section === 'my-tasks'
                  ? `/admin/events/${id}/my-tasks`
                  : tab.section === 'icebreaker'
                    ? `/admin/events/${id}/icebreaker`
                  : tab.section === 'inclusions'
                    ? `/admin/events/${id}/inclusions`
                    : `/admin/events/${id}`;
              const isWorkspaceRoute = pathname.startsWith(`/admin/events/${id}/workspace`);
              const isMyTasksRoute = pathname.startsWith(`/admin/events/${id}/my-tasks`);
              const isIcebreakerRoute = pathname.startsWith(`/admin/events/${id}/icebreaker`);
              const isInclusionsRoute = pathname.startsWith(`/admin/events/${id}/inclusions`);
              const isActive = tab.section === 'workspace'
                ? isWorkspaceRoute
                : tab.section === 'my-tasks'
                  ? isMyTasksRoute
                  : tab.section === 'icebreaker'
                    ? isIcebreakerRoute
                  : tab.section === 'inclusions'
                    ? isInclusionsRoute
                    : !isWorkspaceRoute && !isMyTasksRoute && !isIcebreakerRoute && !isInclusionsRoute;
              return (
                <Link
                  key={tab.section}
                  href={href}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    isActive
                      ? 'border-violet-600 text-violet-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.icon}
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {children}
    </div>
  );
}
