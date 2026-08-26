'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import { QRCodeSVG } from 'qrcode.react';
import { formatManila } from '@axon-tickets/utils';
import Link from 'next/link';
import Footer from '@/components/marketing/Footer';
import { ErrorState } from '@/components/ScreenState';
import type { RegistrationLineItem } from '@axon-tickets/types';

interface TicketDetail {
  id: string;
  eventTitle: string;
  eventStartsAt: string;
  eventVenue: string;
  tierName: string;
  qrToken: string;
  status: string;
  checkedInAt?: string | null;
  lineItems?: RegistrationLineItem[];
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: ticket, isLoading, isError, refetch } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () =>
      api.get<{ data: TicketDetail }>(`/tickets/${id}`).then((r) => r.data.data),
  });

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-10 md:py-14">
        <Link href="/account/tickets" className="mb-4 inline-flex min-h-[44px] items-center text-sm font-bold text-primary hover:underline">
          ← Back to tickets
        </Link>

        {isLoading && <div className="h-[560px] animate-pulse rounded-lg bg-[#ece4fb]" aria-label="Loading ticket" />}

        {isError && (
          <ErrorState message="We couldn’t load this ticket. Check your connection and try again." action={<button type="button" onClick={() => refetch()} className="axon-pill bg-primary text-xs text-white">Try again</button>} />
        )}

        {ticket && (
          <div className="overflow-hidden rounded-lg border border-[#e4dcf4] bg-white">
            {/* Header */}
            <div className="bg-[#1a0533] p-6 text-white">
              <h1 className="axon-display text-3xl leading-tight">{ticket.eventTitle}</h1>
              <p className="mt-4 text-sm text-[#c4b5fd]">
                {formatManila(new Date(ticket.eventStartsAt))}
              </p>
              <p className="text-sm text-[#c4b5fd]">{ticket.eventVenue}</p>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center py-8 px-4 gap-4">
              {ticket.status === 'valid' ? (
                <>
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-green-800">Valid ticket</span>
                  <QRCodeSVG
                    value={ticket.qrToken}
                    size={220}
                    level="H"
                    includeMargin
                  />
                  <p className="max-w-xs text-center text-xs text-[#756a92]">
                    Keep this QR private. It validates admission only; optional add-ons are fulfilled separately.
                  </p>
                </>
              ) : (
                <div className="py-8 text-center space-y-2">
                  <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${ticket.status === 'used' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`} aria-hidden="true">{ticket.status === 'used' ? '✓' : '×'}</div>
                  <p className="font-semibold text-gray-700">
                    {ticket.status === 'used' ? 'Ticket Used' : 'Ticket Invalid'}
                  </p>
                  {ticket.checkedInAt && (
                    <p className="text-sm text-gray-500">
                      Checked in at {formatManila(new Date(ticket.checkedInAt))}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="border-t px-6 py-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tier</span>
                <span className="font-medium">{ticket.tierName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Ticket ID</span>
                <span className="font-mono text-xs text-gray-400">{ticket.id.slice(-8).toUpperCase()}</span>
              </div>
            </div>
            {ticket.lineItems?.some((item) => item.kind === 'inclusion') && (
              <div className="border-t border-[#e4dcf4] bg-[#faf8ff] px-6 py-4">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Optional add-ons</p>
                <div className="mt-2 space-y-2">
                  {ticket.lineItems.filter((item) => item.kind === 'inclusion').map((item, index) => (
                    <div key={item.id ?? index} className="flex items-start justify-between gap-3 text-sm">
                      <span>{item.name}{item.variantName ? ` · ${item.variantName}` : ''} × {item.quantity}</span>
                      <span className="shrink-0 text-xs font-semibold text-[#6b5b8a]">{(item.fulfillmentStatus ?? 'pending').replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
