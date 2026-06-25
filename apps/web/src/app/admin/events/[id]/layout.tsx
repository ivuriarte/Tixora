'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

const TABS = [
  {
    label: 'Edit Event',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
      </svg>
    ),
    exact: true,
  },
  {
    label: 'Workspace',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    exact: false,
  },
];

export default function EventDetailLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();

  return (
    <div>
      <div className="border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6">
          <nav className="flex" aria-label="Event sections">
            {TABS.map((tab) => {
              const href =
                tab.label === 'Workspace'
                  ? `/admin/events/${id}/workspace`
                  : `/admin/events/${id}`;
              const isWorkspaceRoute = pathname.startsWith(`/admin/events/${id}/workspace`);
              const isActive =
                tab.label === 'Workspace' ? isWorkspaceRoute : !isWorkspaceRoute;
              return (
                <Link
                  key={tab.label}
                  href={href}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    isActive
                      ? 'border-violet-600 text-violet-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
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
