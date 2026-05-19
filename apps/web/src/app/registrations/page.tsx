'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { formatManila } from '@axon-tickets/utils';
import api from '@/lib/api';
import type { RegistrationSummary, RegistrationStatus } from '@axon-tickets/types';

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending_payment: 'Pending Payment',
  proof_submitted: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_STYLES: Record<RegistrationStatus, { dot: string; chip: string }> = {
  pending_payment: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  proof_submitted: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  verified: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  rejected: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 ring-red-600/20' },
  cancelled: { dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
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

export default function MyRegistrationsPage() {
  const [registrations, setRegistrations] = useState<RegistrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/registrations/my')
      .then((res) => {
        const body = res.data;
        setRegistrations(body?.data?.items ?? body?.items ?? []);
      })
      .catch(() => setError('Failed to load registrations.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">My Registrations</h1>
            <p className="text-sm text-gray-500 mt-1.5">Track payment and verification status for every event you&apos;ve registered for.</p>
          </header>

          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-white rounded-2xl ring-1 ring-gray-200 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="bg-red-50 ring-1 ring-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && registrations.length === 0 && (
            <div className="bg-white rounded-2xl ring-1 ring-gray-200 px-6 py-16 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-900">No registrations yet</p>
              <p className="text-sm text-gray-500 mt-1.5 max-w-sm mx-auto">Browse events and reserve a seat to start tracking your registrations here.</p>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 mt-5 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-hover transition-colors shadow-sm"
              >
                Browse events
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
              </Link>
            </div>
          )}

          {!loading && !error && registrations.length > 0 && (
            <div className="space-y-3">
              {registrations.map((reg) => {
                const style = STATUS_STYLES[reg.status];
                return (
                  <Link
                    key={reg.id}
                    href={`/registrations/${reg.id}`}
                    className="group block bg-white rounded-2xl p-5 ring-1 ring-gray-200 hover:ring-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <DatePill iso={reg.eventStartsAt} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">{reg.eventTitle}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{formatManila(new Date(reg.eventStartsAt))}</p>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
                          <span className="truncate">{reg.eventVenue}</span>
                        </p>
                        {reg.tierName && (
                          <p className="text-xs text-gray-400 mt-1.5">{reg.tierName} · {reg.attendeeCount} attendee{reg.attendeeCount > 1 ? 's' : ''}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ring-1 ring-inset whitespace-nowrap ${style.chip}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {STATUS_LABELS[reg.status]}
                        </span>
                        <p className="text-base font-bold text-gray-900">₱{reg.total.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-400 font-mono">{reg.referenceNumber}</span>
                      <span className="text-xs text-gray-400 group-hover:text-primary transition-colors">View details →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
