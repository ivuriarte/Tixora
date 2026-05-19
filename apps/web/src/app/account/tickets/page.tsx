'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import Image from 'next/image';
import { formatManila } from '@axon-tickets/utils';
import type { RegistrationSummary, RegistrationStatus } from '@axon-tickets/types';

interface Ticket {
  id: string;
  eventTitle: string;
  eventSlug: string;
  eventStartsAt: string;
  eventVenue: string;
  eventImageUrl?: string | null;
  tierName: string;
  status: string;
}

const REG_STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending_payment: 'Pending Payment',
  proof_submitted: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const REG_STATUS_STYLES: Record<RegistrationStatus, { dot: string; chip: string }> = {
  pending_payment: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  proof_submitted: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  verified: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  rejected: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 ring-red-600/20' },
  cancelled: { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
};

const TICKET_STATUS_STYLES: Record<string, { dot: string; chip: string; label: string }> = {
  valid: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', label: 'Valid' },
  used: { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600 ring-gray-500/20', label: 'Used' },
  revoked: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 ring-red-600/20', label: 'Revoked' },
  cancelled: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 ring-red-600/20', label: 'Cancelled' },
};

function DatePill({ iso }: { iso: string }) {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'Asia/Manila' }).toUpperCase();
  const day = d.toLocaleString('en-US', { day: 'numeric', timeZone: 'Asia/Manila' });
  return (
    <div className="flex flex-col items-center justify-center w-14 h-16 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/15 shrink-0">
      <span className="text-[10px] font-semibold tracking-wider text-primary">{month}</span>
      <span className="text-xl font-bold text-gray-900 leading-none">{day}</span>
    </div>
  );
}

function EventThumb({ url, title }: { url?: string | null; title: string }) {
  if (url) {
    return (
      <div className="relative w-20 h-20 rounded-xl overflow-hidden ring-1 ring-gray-200 shrink-0 bg-gray-100 hidden sm:block">
        <Image src={url} alt={title} fill sizes="80px" className="object-cover" />
      </div>
    );
  }
  const initial = title.charAt(0).toUpperCase();
  return (
    <div className="w-20 h-20 rounded-xl shrink-0 bg-gradient-to-br from-primary via-primary to-violet-700 hidden sm:flex items-center justify-center text-white font-bold text-2xl ring-1 ring-primary/30 shadow-sm">
      {initial}
    </div>
  );
}

function StatusChip({ dot, chip, children }: { dot: string; chip: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ring-1 ring-inset whitespace-nowrap ${chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-200 p-4 flex items-center gap-4">
      <div className="w-14 h-16 rounded-xl bg-gray-100 animate-pulse" />
      <div className="w-20 h-20 rounded-xl bg-gray-100 animate-pulse hidden sm:block" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
        <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
        <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
      </div>
      <div className="w-16 h-6 rounded-full bg-gray-100 animate-pulse" />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-200 px-6 py-16 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="text-base font-semibold text-gray-900">{title}</p>
      <p className="text-sm text-gray-500 mt-1.5 max-w-sm mx-auto">{body}</p>
      <Link
        href={cta.href}
        className="inline-flex items-center gap-1.5 mt-5 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-hover transition-colors shadow-sm"
      >
        {cta.label}
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
      </Link>
    </div>
  );
}

export default function MyEventsPage() {
  const [tab, setTab] = useState<'tickets' | 'registrations'>('tickets');

  const { data: tickets, isLoading: ticketsLoading } = useQuery({
    queryKey: ['my-tickets'],
    queryFn: () => api.get<{ data: { data: Ticket[] } }>('/tickets').then((r) => r.data.data.data),
  });

  const { data: registrations, isLoading: regsLoading } = useQuery({
    queryKey: ['my-registrations'],
    queryFn: () =>
      api.get('/registrations/my').then((r) => {
        const body = r.data;
        return (body?.data?.items ?? body?.items ?? []) as RegistrationSummary[];
      }),
  });

  const { upcomingTickets, pastTickets } = useMemo(() => {
    const now = Date.now();
    const upcoming: Ticket[] = [];
    const past: Ticket[] = [];
    (tickets ?? []).forEach((t) => {
      (new Date(t.eventStartsAt).getTime() >= now ? upcoming : past).push(t);
    });
    upcoming.sort((a, b) => +new Date(a.eventStartsAt) - +new Date(b.eventStartsAt));
    past.sort((a, b) => +new Date(b.eventStartsAt) - +new Date(a.eventStartsAt));
    return { upcomingTickets: upcoming, pastTickets: past };
  }, [tickets]);

  const ticketCount = tickets?.length ?? 0;
  const regCount = registrations?.length ?? 0;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">My Events</h1>
            <p className="text-sm text-gray-500 mt-1.5">Your tickets and registration history, all in one place.</p>
          </header>

          {/* Segmented control */}
          <div role="tablist" aria-label="My events tabs" className="inline-flex p-1 bg-gray-100 rounded-2xl mb-7">
            <button
              role="tab"
              aria-selected={tab === 'tickets'}
              onClick={() => setTab('tickets')}
              className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === 'tickets'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h14a2 2 0 012 2v1.5a2 2 0 100 4V16a2 2 0 01-2 2H5a2 2 0 01-2-2v-1.5a2 2 0 100-4V9z"/>
              </svg>
              Tickets
              {ticketCount > 0 && (
                <span className={`min-w-[20px] text-center text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                  tab === 'tickets' ? 'bg-primary/10 text-primary' : 'bg-gray-200 text-gray-600'
                }`}>{ticketCount}</span>
              )}
            </button>
            <button
              role="tab"
              aria-selected={tab === 'registrations'}
              onClick={() => setTab('registrations')}
              className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === 'registrations'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
              Registrations
              {regCount > 0 && (
                <span className={`min-w-[20px] text-center text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                  tab === 'registrations' ? 'bg-primary/10 text-primary' : 'bg-gray-200 text-gray-600'
                }`}>{regCount}</span>
              )}
            </button>
          </div>

          {/* ── Tickets tab ── */}
          {tab === 'tickets' && (
            <section role="tabpanel" aria-label="Tickets">
              {ticketsLoading && (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => <CardSkeleton key={i} />)}
                </div>
              )}

              {!ticketsLoading && ticketCount === 0 && (
                <EmptyState
                  icon={<svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h14a2 2 0 012 2v1.5a2 2 0 100 4V16a2 2 0 01-2 2H5a2 2 0 01-2-2v-1.5a2 2 0 100-4V9z"/></svg>}
                  title="No tickets yet"
                  body="When you complete a checkout, your QR tickets will appear here, ready to scan at the gate."
                  cta={{ href: '/', label: 'Browse events' }}
                />
              )}

              {!ticketsLoading && upcomingTickets.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Upcoming</h2>
                    <span className="text-xs text-gray-400">{upcomingTickets.length}</span>
                  </div>
                  <div className="space-y-3">
                    {upcomingTickets.map((t) => <TicketCard key={t.id} ticket={t} />)}
                  </div>
                </div>
              )}

              {!ticketsLoading && pastTickets.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Past</h2>
                    <span className="text-xs text-gray-400">{pastTickets.length}</span>
                  </div>
                  <div className="space-y-3">
                    {pastTickets.map((t) => <TicketCard key={t.id} ticket={t} muted />)}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Registrations tab ── */}
          {tab === 'registrations' && (
            <section role="tabpanel" aria-label="Registrations">
              {regsLoading && (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => <CardSkeleton key={i} />)}
                </div>
              )}

              {!regsLoading && regCount === 0 && (
                <EmptyState
                  icon={<svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>}
                  title="No registrations yet"
                  body="Reserve a seat for an event to track its payment and verification status here."
                  cta={{ href: '/', label: 'Browse events' }}
                />
              )}

              {!regsLoading && regCount > 0 && (
                <div className="space-y-3">
                  {registrations!.map((reg) => <RegistrationCard key={reg.id} reg={reg} />)}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </>
  );
}

// ── Card components ─────────────────────────────────────────────────────────

function TicketCard({ ticket, muted = false }: { ticket: Ticket; muted?: boolean }) {
  const style = TICKET_STATUS_STYLES[ticket.status] ?? { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600 ring-gray-500/20', label: ticket.status };
  return (
    <Link
      href={`/account/tickets/${ticket.id}`}
      className={`group flex items-center gap-4 bg-white rounded-2xl p-4 ring-1 ring-gray-200 hover:ring-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all ${muted ? 'opacity-75' : ''}`}
    >
      <DatePill iso={ticket.eventStartsAt} />
      <EventThumb url={ticket.eventImageUrl} title={ticket.eventTitle} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">{ticket.eventTitle}</p>
        <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          <span className="truncate">{ticket.eventVenue}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">{ticket.tierName}</p>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <StatusChip dot={style.dot} chip={style.chip}>{style.label}</StatusChip>
        <span className="text-xs text-gray-400 group-hover:text-primary transition-colors hidden sm:inline">View →</span>
      </div>
    </Link>
  );
}

function RegistrationCard({ reg }: { reg: RegistrationSummary }) {
  const style = REG_STATUS_STYLES[reg.status];
  return (
    <Link
      href={`/registrations/${reg.id}`}
      className="group block bg-white rounded-2xl p-5 ring-1 ring-gray-200 hover:ring-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-start gap-4">
        <DatePill iso={reg.eventStartsAt} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">{reg.eventTitle}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatManila(new Date(reg.eventStartsAt))}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
            <span className="truncate">{reg.eventVenue}</span>
          </p>
          {reg.tierName && (
            <p className="text-xs text-gray-400 mt-1.5">{reg.tierName} · {reg.attendeeCount} attendee{reg.attendeeCount > 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-2">
          <StatusChip dot={style.dot} chip={style.chip}>{REG_STATUS_LABELS[reg.status]}</StatusChip>
          <p className="text-base font-bold text-gray-900">₱{reg.total.toLocaleString()}</p>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400 font-mono">{reg.referenceNumber}</span>
        <span className="text-xs text-gray-400 group-hover:text-primary transition-colors">View details →</span>
      </div>
    </Link>
  );
}
