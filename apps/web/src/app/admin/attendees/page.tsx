'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { EmptyState, ScreenSkeleton } from '@/components/ScreenState';

interface Attendee {
  id: string;
  userEmail: string | null;
  userName: string;
  userCompany: string | null;
  userJobTitle: string | null;
  userCity: string | null;
  userPhone: string | null;
  subEvents: string | null;
  tierName: string;
  orderStatus: string | null;
  paymentMethod: string | null;
  status: string;
  checkedInAt: string | null;
  raceDistance: string | null;
  raceDivision: string | null;
  genderIdentity: string | null;
  merchandiseSize: string | null;
  bibNumber: string | null;
  claimMethod: string | null;
  claimedAt: string | null;
}

interface AttendeesResponse {
  data: Attendee[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface Event {
  id: string;
  title: string;
  slug: string;
}

interface MerchandiseSummary {
  distance: string;
  raceDivision: string;
  size: string;
  registered: number;
  claimed: number;
  remaining: number;
}

const PAYMENT_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-600',
};

export default function AdminAttendeesPage() {
  const searchParams = useSearchParams();
  const initialEvent = searchParams.get('eventId') ?? '';
  const [selectedEventId, setSelectedEventId] = useState(initialEvent);
  const [selectedEventTitle, setSelectedEventTitle] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<string>>(() => new Set());
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialEvent && initialEvent !== selectedEventId) {
      setSelectedEventId(initialEvent);
    }
  }, [initialEvent, selectedEventId]);

  useEffect(() => {
    setSelectedAttendeeIds(new Set());
  }, [selectedEventId, searchQ]);

  const { data: events } = useQuery<Event[]>({
    queryKey: ['admin-events-select'],
    queryFn: () =>
      api.get<{ data: { data: Event[] } }>('/admin/events?limit=100').then((r) => r.data.data.data),
  });

  const { data, isLoading, refetch } = useQuery<AttendeesResponse>({
    queryKey: ['admin-attendees', selectedEventId, searchQ, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (searchQ) params.set('q', searchQ);
      return api
        .get<{ data: AttendeesResponse }>(`/admin/events/${selectedEventId}/attendees?${params}`)
        .then((r) => r.data.data);
    },
    enabled: !!selectedEventId,
  });

  const { data: merchandiseSummary, refetch: refetchMerchandise } = useQuery<MerchandiseSummary[]>({
    queryKey: ['admin-merchandise-summary', selectedEventId],
    queryFn: () =>
      api
        .get<{ data: MerchandiseSummary[] }>(`/admin/events/${selectedEventId}/merchandise-summary`)
        .then((response) => response.data.data),
    enabled: !!selectedEventId,
  });

  const visibleAttendeeIds = useMemo(() => data?.data.map((a) => a.id) ?? [], [data]);
  const selectedVisibleCount = visibleAttendeeIds.filter((id) => selectedAttendeeIds.has(id)).length;
  const allVisibleSelected = visibleAttendeeIds.length > 0 && selectedVisibleCount === visibleAttendeeIds.length;
  const partiallySelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectedCount = selectedAttendeeIds.size;

  const toggleVisibleSelection = () => {
    setSelectedAttendeeIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleAttendeeIds.forEach((id) => next.delete(id));
      } else {
        visibleAttendeeIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleAttendeeSelection = (attendeeId: string) => {
    setSelectedAttendeeIds((current) => {
      const next = new Set(current);
      if (next.has(attendeeId)) {
        next.delete(attendeeId);
      } else {
        next.add(attendeeId);
      }
      return next;
    });
  };

  const handleExport = async () => {
    if (!selectedEventId) return;
    setExporting(true);
    try {
      const res = await api.get<Blob>(
        `/admin/events/${selectedEventId}/attendees/export`,
        { responseType: 'blob' },
      );
      const safeTitle = (selectedEventTitle || events?.find((e) => e.id === selectedEventId)?.title || 'Event').replace(/[<>:"/\\|?*]/g, '').trim();
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `[Attendees]${safeTitle}(${date}).csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handlePrintNametags = async () => {
    if (!selectedEventId) return;
    setPrinting(true);
    try {
      const attendeeIds = Array.from(selectedAttendeeIds);
      const res = await api.post<Blob>(
        `/admin/events/${selectedEventId}/attendees/nametags`,
        { attendeeIds },
        { responseType: 'blob' },
      );
      const safeTitle = (selectedEventTitle || events?.find((e) => e.id === selectedEventId)?.title || 'Event').replace(/[<>:"/\\|?*]/g, '').trim();
      const date = new Date().toISOString().slice(0, 10);
      const scope = attendeeIds.length > 0 ? `Selected-${attendeeIds.length}` : 'All';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `[Nametags]${safeTitle}-${scope}(${date}).pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Nametag PDF downloaded.');
    } catch (error: any) {
      const message = error?.response?.data?.message ?? 'Nametag PDF could not be generated. Please try again.';
      toast.error(message);
    } finally {
      setPrinting(false);
    }
  };

  const handleClaim = async (attendee: Attendee) => {
    setClaimingId(attendee.id);
    try {
      await api.patch(`/admin/events/${selectedEventId}/attendees/${attendee.id}/claim`, {
        claimed: !attendee.claimedAt,
      });
      await Promise.all([refetch(), refetchMerchandise()]);
      toast.success(attendee.claimedAt ? 'Claim status reversed.' : 'Merchandise marked as claimed.');
    } catch (error: any) {
      const message = error?.response?.data?.message ?? 'Claim status could not be updated.';
      toast.error(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="axon-page-title text-3xl sm:text-4xl">Attendees</h1>
            <p className="text-sm text-gray-500 mt-1">
              Select an event to view its attendee roster.
            </p>
          </div>
          {selectedEventId && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={handlePrintNametags}
                disabled={printing || isLoading || !data?.meta.total}
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 border border-gray-300 px-4 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                {printing ? 'Preparing…' : 'Print Nametags'}
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:bg-primary/5 border border-primary px-4 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <select
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={selectedEventId}
            onChange={(e) => { setSelectedEventId(e.target.value); setSelectedEventTitle(e.target.options[e.target.selectedIndex]?.text ?? ''); setPage(1); }}
          >
            <option value="">Select an event…</option>
            {events?.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search name, email, company…"
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary flex-1 min-w-[200px]"
          />
        </div>

        {!selectedEventId && (
          <EmptyState title="Select an event" message="Choose an event above to view, search, print, or export its attendee list." />
        )}

        {selectedEventId && isLoading && (
          <ScreenSkeleton rows={6} compact />
        )}

        {selectedEventId && !isLoading && (
          <>
            {merchandiseSummary && merchandiseSummary.length > 0 && (
              <section aria-labelledby="merchandise-summary-title" className="mb-6 rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary">Running event</p>
                    <h2 id="merchandise-summary-title" className="mt-1 text-lg font-bold text-[#1a0533]">Merchandise claim summary</h2>
                  </div>
                  <p className="text-xs text-[#6b5b8a]">Grouped by distance, Race Division, and size</p>
                </div>
                <div className="mt-4 overflow-x-auto rounded-xl border border-violet-100 bg-white">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-violet-50 text-left text-[10px] uppercase tracking-wide text-[#756a92]">
                      <tr><th className="px-3 py-2">Distance</th><th className="px-3 py-2">Race Division</th><th className="px-3 py-2">Size</th><th className="px-3 py-2">Registered</th><th className="px-3 py-2">Claimed</th><th className="px-3 py-2">Remaining</th></tr>
                    </thead>
                    <tbody className="divide-y divide-violet-50">
                      {merchandiseSummary.map((row) => (
                        <tr key={`${row.distance}-${row.raceDivision}-${row.size}`}>
                          <td className="px-3 py-2 font-medium">{row.distance}</td>
                          <td className="px-3 py-2">{row.raceDivision}</td>
                          <td className="px-3 py-2">{row.size}</td>
                          <td className="px-3 py-2 tabular-nums">{row.registered}</td>
                          <td className="px-3 py-2 tabular-nums text-emerald-700">{row.claimed}</td>
                          <td className="px-3 py-2 tabular-nums font-bold text-primary">{row.remaining}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {data && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-500">
                  {data.meta.total} {data.meta.total === 1 ? 'attendee' : 'attendees'}
                </p>
                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAttendeeIds(new Set())}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-900"
                  >
                    {selectedCount} selected · Clear
                  </button>
                )}
              </div>
            )}
            <div className="bg-white shadow rounded-2xl overflow-x-auto">
              <table className="w-full text-sm min-w-[1320px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 w-12">
                      <input
                        type="checkbox"
                        aria-label="Select visible attendees"
                        checked={allVisibleSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = partiallySelected;
                        }}
                        onChange={toggleVisibleSelection}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Position</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Sub Events</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Race</th>
                    <th className="px-4 py-3">Bib</th>
                    <th className="px-4 py-3">Merchandise</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Checked In</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.data.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${a.userName}`}
                          checked={selectedAttendeeIds.has(a.id)}
                          onChange={() => toggleAttendeeSelection(a.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{a.userName}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{a.userEmail ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{a.userCompany ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{a.userJobTitle ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{a.userCity ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[220px]">
                        {a.subEvents ? (
                          <span className="line-clamp-2" title={a.subEvents}>{a.subEvents}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                          {a.tierName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {a.raceDistance ? (
                          <span>{a.raceDistance}<span className="block text-gray-400">{a.raceDivision ?? 'Open'}</span></span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-[#1a0533]">{a.bibNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        {a.merchandiseSize ? (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{a.merchandiseSize}</span>
                            <button
                              type="button"
                              disabled={claimingId === a.id}
                              onClick={() => handleClaim(a)}
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                a.claimedAt
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              } disabled:opacity-50`}
                            >
                              {claimingId === a.id ? 'Saving…' : a.claimedAt ? 'Claimed · Undo' : 'Mark claimed'}
                            </button>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PAYMENT_COLORS[a.orderStatus ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                          {a.orderStatus ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {a.status === 'used' ? (
                          <span className="text-blue-700 font-medium">✓ Yes</span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data?.data.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-4 py-8 text-center text-gray-400">No attendees found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {data && data.meta.totalPages > 1 && (
              <div className="flex justify-between items-center mt-4">
                <p className="text-sm text-gray-500">
                  Page {data.meta.page} of {data.meta.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={!data.meta.hasPrevPage}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-4 py-2 rounded-xl text-sm border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={!data.meta.hasNextPage}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-4 py-2 rounded-xl text-sm border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
    </main>
  );
}
