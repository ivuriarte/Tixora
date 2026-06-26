'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { getRefreshToken } from '@/lib/auth';
import toast from 'react-hot-toast';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exactMatch?: boolean;
  alsoActiveFor?: string[];
  pendingBadge?: boolean;
  orgPendingBadge?: boolean;
  adminOnly?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      {
        href: '/admin',
        label: 'Dashboard',
        exactMatch: true,
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Events',
    items: [
      {
        href: '/admin/events',
        label: 'Events',
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        ),
      },
      {
        href: '/admin/event-previews',
        label: 'Event previews',
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
      {
        href: '/admin/featured',
        label: 'Featured events',
        adminOnly: true,
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Registrations',
    items: [
      {
        href: '/admin/verifications',
        label: 'Verification queue',
        pendingBadge: true,
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        href: '/admin/orders',
        label: 'Transactions',
        alsoActiveFor: ['/admin/registrations'],
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'At the door',
    items: [
      {
        href: '/admin/checkin',
        label: 'Check-in scanner',
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5zM13.5 14.625c0-.621.504-1.125 1.125-1.125h1.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5zM13.5 19.875c0-.621.504-1.125 1.125-1.125h1.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5zM18.75 14.625c0-.621.504-1.125 1.125-1.125h1.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5zM18.75 19.875c0-.621.504-1.125 1.125-1.125h1.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5z" />
          </svg>
        ),
      },
      {
        href: '/admin/attendees',
        label: 'Guest list',
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0Zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0Zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0Z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        href: '/admin/analytics',
        label: 'Analytics',
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Organizers',
    items: [
      {
        href: '/admin/organizers',
        label: 'Applications',
        pendingBadge: false,
        orgPendingBadge: true,
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Settings',
    items: [
      {
        href: '/admin/users',
        label: 'User management',
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        ),
      },
      {
        href: '/admin/settings/platform',
        label: 'Platform settings',
        icon: (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
];

export default function AdminSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [pendingCount, setPendingCount] = useState(0);
  const [orgPendingCount, setOrgPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const requests = [api.get('/admin/verifications/count')];
        if (user?.isAdmin) requests.push(api.get('/admin/organizers/count'));
        const [verRes, orgRes] = await Promise.all(requests);
        const verBody = verRes.data as { count?: number; data?: { count?: number } };
        const orgBody = orgRes?.data as { count?: number; data?: { count?: number } } | undefined;
        if (!cancelled) {
          setPendingCount(verBody?.data?.count ?? verBody?.count ?? 0);
          setOrgPendingCount(orgBody?.data?.count ?? orgBody?.count ?? 0);
        }
      } catch {
        /* ignore */
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user?.isAdmin]);

  function isItemActive(item: NavItem): boolean {
    if (item.exactMatch) return pathname === item.href;
    if (pathname === item.href) return true;
    if (pathname.startsWith(item.href + '/')) return true;
    if (item.alsoActiveFor?.some((p) => pathname.startsWith(p))) return true;
    return false;
  }

  async function handleLogout() {
    try {
      const refreshToken = getRefreshToken();
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      /* ignore */
    }
    const isAdmin = user?.isAdmin ?? false;
    logout();
    router.push(isAdmin ? '/auth/admin' : '/');
    toast.success('You have been signed out.');
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-white border-r border-gray-200 overflow-y-auto
        transition-transform duration-200 ease-in-out
        md:sticky md:top-0 md:h-screen md:w-56 md:flex-shrink-0 md:translate-x-0 md:z-30
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
        <div>
          <Link href="/admin" className="flex items-center" onClick={onClose}>
            <Image
              src="/axon-logo.svg"
              alt="Axon Tickets"
              width={120}
              height={24}
              priority
              unoptimized
            />
          </Link>
          <p className="text-[11px] text-gray-400 mt-1.5">Admin panel</p>
        </div>
        {/* Close button — mobile only */}
        <button
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5">
        {SECTIONS.filter((section) => user?.isAdmin || !['Organizers', 'Settings'].includes(section.label)).map((section) => (
          <div key={section.label}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1.5">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.filter((item) => !item.adminOnly || user?.isAdmin).map((item) => {
                const active = isItemActive(item);
                const badge = item.orgPendingBadge ? orgPendingCount : item.pendingBadge ? pendingCount : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-violet-50 text-primary'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <span className={active ? 'text-primary' : 'text-gray-400'}>
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge > 0 && (
                      <span
                        className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold bg-red-100 text-red-700"
                        title={`${badge} pending verification${badge === 1 ? '' : 's'}`}
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer — profile & logout */}
      <div className="flex-shrink-0 border-t border-gray-100 px-3 py-3 space-y-0.5">
        <Link
          href="/admin/profile"
          className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          My profile
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Log out
        </button>
      </div>
      </aside>
    </>
  );
}
