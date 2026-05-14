'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import { QRCodeSVG } from 'qrcode.react';
import { formatManila } from '@tixora/utils';
import Link from 'next/link';

interface TicketDetail {
  id: string;
  eventTitle: string;
  eventStartsAt: string;
  eventVenue: string;
  tierName: string;
  qrToken: string;
  status: string;
  checkedInAt?: string | null;
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () =>
      api.get<{ data: TicketDetail }>(`/tickets/${id}`).then((r) => r.data.data),
  });

  return (
    <>
      <Navbar />
      <main className="max-w-md mx-auto px-4 py-10">
        <Link href="/account/tickets" className="text-sm text-primary hover:underline mb-4 inline-block">
          ← Back to tickets
        </Link>

        {isLoading && <p className="text-gray-400">Loading…</p>}

        {ticket && (
          <div className="bg-white shadow rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-primary p-6 text-white">
              <h1 className="text-xl font-bold leading-tight">{ticket.eventTitle}</h1>
              <p className="text-primary-100 text-sm mt-1">
                {formatManila(new Date(ticket.eventStartsAt))}
              </p>
              <p className="text-primary-100 text-sm">{ticket.eventVenue}</p>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center py-8 px-4 gap-4">
              {ticket.status === 'valid' ? (
                <>
                  <QRCodeSVG
                    value={ticket.qrToken}
                    size={220}
                    level="H"
                    includeMargin
                  />
                  <p className="text-xs text-gray-400 text-center">
                    Show this QR code at the venue entrance
                  </p>
                </>
              ) : (
                <div className="py-8 text-center space-y-2">
                  <p className="text-2xl">
                    {ticket.status === 'used' ? '✅' : '❌'}
                  </p>
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
          </div>
        )}
      </main>
    </>
  );
}
