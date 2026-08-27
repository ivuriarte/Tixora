'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import Footer from '@/components/marketing/Footer';
import { ErrorState as QueryErrorState } from '@/components/ScreenState';
import Link from 'next/link';
import Image from 'next/image';
import { formatManila, formatPHP } from '@axon-tickets/utils';
import type { AccountTicketSummary, RegistrationSummary, RegistrationStatus } from '@axon-tickets/types';

const REG_STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending_payment:   'Waiting for Payment',
  proof_submitted:   'Being Reviewed',
  pending_approval:  'Awaiting Confirmation',
  verified:          'Approved',
  rejected:          'Needs Attention',
  cancelled:         'Cancelled',
};

const REG_STATUS_STYLES: Record<RegistrationStatus, { dot: string; chip: string }> = {
  pending_payment:  { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  proof_submitted:  { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  pending_approval: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  verified:         { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  rejected:         { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 ring-red-600/20' },
  cancelled:        { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
};

const TICKET_STATUS_STYLES: Record<string, { dot: string; chip: string; label: string }> = {
  valid: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', label: 'Valid' },
  used: { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600 ring-gray-500/20', label: 'Used' },
  revoked: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 ring-red-600/20', label: 'Revoked' },
  cancelled: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 ring-red-600/20', label: 'Cancelled' },
  pending_qr: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-600/20', label: 'QR Pending' },
};

function DatePill({ iso }: { iso: string }) {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'Asia/Manila' }).toUpperCase();
  const day = d.toLocaleString('en-US', { day: 'numeric', timeZone: 'Asia/Manila' });
  return (
    <div className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-[#ede9fe] ring-1 ring-primary/15">
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
    <div className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-primary text-2xl font-bold text-white ring-1 ring-primary/30 sm:flex">
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'registrations') setTab('registrations');
  }, []);

  const { data: tickets, isLoading: ticketsLoading, isError: ticketsError, refetch: refetchTickets } = useQuery({
    queryKey: ['my-tickets'],
    queryFn: () => api.get<{ data: { data: AccountTicketSummary[] } }>('/tickets').then((r) => r.data.data.data),
  });

  const { data: registrations, isLoading: regsLoading, isError: regsError, refetch: refetchRegistrations } = useQuery({
    queryKey: ['my-registrations'],
    queryFn: () =>
      api.get('/registrations/my').then((r) => {
        const body = r.data;
        // API shape: { success, data: { data: items[], meta } }
        return (body?.data?.data ?? body?.data?.items ?? body?.items ?? []) as RegistrationSummary[];
      }),
  });

  const { upcomingTickets, pastTickets } = useMemo(() => {
    const now = Date.now();
    const upcoming: AccountTicketSummary[] = [];
    const past: AccountTicketSummary[] = [];
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
      <main className="min-h-screen bg-[#f5f0ff]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          {/* Header */}
          <header className="mb-8">
            <h1 className="axon-display text-4xl text-[#1a0533] sm:text-5xl">My Events</h1>
            <p className="mt-2 text-sm text-[#6b5b8a]">Your tickets and registration history, all in one place.</p>
          </header>

          {/* Segmented control */}
          <div role="tablist" aria-label="My events tabs" className="mb-7 inline-flex rounded-[40px] border border-[#e4dcf4] bg-white p-1">
            <button
              role="tab"
              aria-selected={tab === 'tickets'}
              onClick={() => setTab('tickets')}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-[40px] px-4 text-sm font-semibold transition-colors sm:px-5 ${
                tab === 'tickets'
                  ? 'bg-[#1a0533] text-white'
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
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-[40px] px-4 text-sm font-semibold transition-colors sm:px-5 ${
                tab === 'registrations'
                  ? 'bg-[#1a0533] text-white'
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

              {ticketsError && (
                <QueryErrorState message="Your tickets could not be loaded. Check your connection and try again." action={<button type="button" onClick={() => refetchTickets()} className="axon-pill bg-primary text-xs text-white">Try again</button>} />
              )}

              {!ticketsLoading && !ticketsError && ticketCount === 0 && (
                <EmptyState
                  icon={<svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h14a2 2 0 012 2v1.5a2 2 0 100 4V16a2 2 0 01-2 2H5a2 2 0 01-2-2v-1.5a2 2 0 100-4V9z"/></svg>}
                  title="No tickets yet"
                  body="Once your registration is approved, your QR tickets will appear here. Just show the QR code at the entrance."
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

              {regsError && (
                <QueryErrorState message="Your registrations could not be loaded. Check your connection and try again." action={<button type="button" onClick={() => refetchRegistrations()} className="axon-pill bg-primary text-xs text-white">Try again</button>} />
              )}

              {!regsLoading && !regsError && regCount === 0 && (
                <EmptyState
                  icon={<svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>}
                  title="No registrations yet"
                  body="When you register for an event, your registration status and payment will appear here."
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
      <Footer />
    </>
  );
}

// ── Card components ─────────────────────────────────────────────────────────

function TicketCard({ ticket, muted = false }: { ticket: AccountTicketSummary; muted?: boolean }) {
  const style = TICKET_STATUS_STYLES[ticket.status] ?? { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600 ring-gray-500/20', label: ticket.status };
  // Registration-based tickets use att_ prefix — route to the attendee detail page
  const href =
    ticket.source === 'registration'
      ? `/account/tickets/attendee/${ticket.id.slice(4)}`
      : `/account/tickets/${ticket.id}`;
  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-lg border border-[#e4dcf4] bg-white p-4 transition-colors hover:border-primary ${muted ? 'opacity-75' : ''}`}
    >
      <DatePill iso={ticket.eventStartsAt} />
      <EventThumb url={ticket.eventImageUrl} title={ticket.eventTitle} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">{ticket.eventTitle}</p>
        <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          <span className="truncate">{ticket.eventVenue}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {ticket.tierName}
          {ticket.attendeeName && (
            <span className="ml-1.5 text-gray-400">· {ticket.attendeeName}</span>
          )}
        </p>
        {!!ticket.inclusionCount && ticket.inclusionCount > 0 && (
          <p className="mt-1 text-xs font-medium text-primary">
            {ticket.inclusionCount} optional add-on{ticket.inclusionCount === 1 ? '' : 's'} · separate fulfillment
          </p>
        )}
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
      className="group block rounded-lg border border-[#e4dcf4] bg-white p-5 transition-colors hover:border-primary"
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
          {!!reg.inclusionCount && reg.inclusionCount > 0 && (
            <p className="mt-1 text-xs font-medium text-primary">
              {reg.inclusionCount} optional add-on{reg.inclusionCount === 1 ? '' : 's'} · separate fulfillment
            </p>
          )}
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-2">
          <StatusChip dot={style.dot} chip={style.chip}>{REG_STATUS_LABELS[reg.status]}</StatusChip>
          <p className="text-base font-bold text-gray-900">{formatPHP(reg.total)}</p>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400 font-mono">{reg.referenceNumber}</span>
        <span className="text-xs text-gray-400 group-hover:text-primary transition-colors">View details →</span>
      </div>
    </Link>
  );
}
