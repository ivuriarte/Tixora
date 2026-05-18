'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatManila } from '@axon-tickets/utils';
import api from '@/lib/api';
import type { RegistrationSummary, RegistrationStatus } from '@axon-tickets/types';

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending_payment: 'Pending Payment',
  proof_submitted: 'Proof Submitted',
  verified: 'Verified',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<RegistrationStatus, string> = {
  pending_payment: 'bg-yellow-100 text-yellow-700',
  proof_submitted: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

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
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Registrations</h1>

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && registrations.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg font-medium">No registrations yet</p>
            <p className="text-sm mt-1">Browse events and register to attend.</p>
            <Link
              href="/"
              className="inline-block mt-4 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-colors"
            >
              Browse Events
            </Link>
          </div>
        )}

        {!loading && !error && registrations.length > 0 && (
          <div className="space-y-4">
            {registrations.map((reg) => (
              <Link
                key={reg.id}
                href={`/registrations/${reg.id}`}
                className="block bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{reg.eventTitle}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatManila(new Date(reg.eventStartsAt))} · {reg.eventVenue}
                    </p>
                    {reg.tierName && (
                      <p className="text-xs text-gray-400 mt-0.5">{reg.tierName} × {reg.attendeeCount}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[reg.status]}`}
                    >
                      {STATUS_LABELS[reg.status]}
                    </span>
                    <p className="text-sm font-semibold text-gray-900 mt-2">
                      ₱{reg.total.toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3 font-mono">{reg.referenceNumber}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
