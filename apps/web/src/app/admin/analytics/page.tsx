'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import BackButton from '@/components/BackButton';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Event {
  id: string;
  title: string;
  status: string;
}

interface TierRow {
  tierId: string;
  tierName: string;
  totalQuantity: number;
  soldQuantity: number;
  available: number;
  price: number;
  revenue: number;
  fillRate: number;
}

interface EventAnalytics {
  eventId: string;
  eventTitle: string;
  totalRevenue: number;
  totalFees: number;
  paidOrders: number;
  ticketsSold: number;
  ticketCheckins: number;
  verifiedRegistrations: number;
  verifiedAttendees: number;
  pendingRegistrations: number;
  registrationCheckins: number;
  totalSold: number;
  totalCheckedIn: number;
  checkInRate: number;
  tierBreakdown: TierRow[];
}

interface TimelinePoint {
  date: string;
  revenue: number;
  orders: number;
  registrations: number;
  total: number;
}

interface TimelineData {
  eventId: string;
  days: number;
  series: TimelinePoint[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtRevenue(n: number) {
  return `₱${(n / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function fmtPct(n: number) {
  return `${n}%`;
}

// ── Sparkline (pure SVG — no deps) ─────────────────────────────────────────────

function Sparkline({ data, color = '#6366f1' }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const w = 300;
  const h = 60;
  const max = Math.max(...data, 1);
  const step = w / Math.max(data.length - 1, 1);
  const pts = data
    .map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`)
    .join(' ');
  const fill = `${pts} ${(data.length - 1) * step},${h} 0,${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <polygon points={fill} fill={color} opacity={0.15} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = 'text-gray-900',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white shadow rounded-2xl p-5">
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Capacity bar ───────────────────────────────────────────────────────────────

function CapacityBar({ tier }: { tier: TierRow }) {
  const pct = Math.min(tier.fillRate, 100);
  const color =
    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span className="font-medium">{tier.tierName}</span>
        <span>
          {tier.soldQuantity.toLocaleString()} / {tier.totalQuantity.toLocaleString()} &nbsp;
          <span className="font-semibold">{pct}%</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{fmtRevenue(tier.price)} per ticket · {tier.available} available</span>
        <span className="font-semibold text-gray-900">Revenue: {fmtRevenue(tier.revenue)}</span>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const searchParams = useSearchParams();
  const initialEvent = searchParams.get('eventId') ?? '';
  const [selectedEventId, setSelectedEventId] = useState(initialEvent);
  const [timelineDays, setTimelineDays] = useState(14);

  // Load events
  const { data: events = [] } = useQuery<Event[]>({
    queryKey: ['admin-events-analytics'],
    queryFn: () =>
      api
        .get<{ data: { data: Event[] } }>('/admin/events?limit=100')
        .then((r) => r.data?.data?.data ?? []),
  });

  // Auto-select first event
  useEffect(() => {
    if (events.length && !selectedEventId) setSelectedEventId(events[0].id);
  }, [events, selectedEventId]);

  // Event analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery<EventAnalytics>({
    queryKey: ['event-analytics', selectedEventId],
    queryFn: () =>
      api
        .get<{ data: EventAnalytics }>(`/admin/analytics/events/${selectedEventId}`)
        .then((r) => r.data.data),
    enabled: !!selectedEventId,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // Timeline
  const { data: timeline } = useQuery<TimelineData>({
    queryKey: ['event-timeline', selectedEventId, timelineDays],
    queryFn: () =>
      api
        .get<{ data: TimelineData }>(
          `/admin/analytics/events/${selectedEventId}/timeline?days=${timelineDays}`,
        )
        .then((r) => r.data.data),
    enabled: !!selectedEventId,
  });

  const revenueData = timeline?.series.map((p) => p.revenue) ?? [];
  const salesData = timeline?.series.map((p) => p.total) ?? [];
  const lastDate = timeline?.series.at(-1)?.date ?? '';

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <BackButton href="/admin" label="Back to Admin" className="mb-2" />
            <h1 className="text-2xl font-bold text-gray-900">Real Time Analytics</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Real-time stats for your events
            </p>
          </div>
        </div>

        {/* Event selector */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>

          <div className="flex gap-1">
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                onClick={() => setTimelineDays(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  timelineDays === d
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {analyticsLoading && (
          <p className="text-gray-400 text-sm">Loading analytics…</p>
        )}

        {analytics && (
          <>
            {/* Stat grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Total Revenue"
                value={fmtRevenue(analytics.totalRevenue)}
                color="text-gray-900"
              />
              <StatCard
                label="Total Sold"
                value={analytics.totalSold.toLocaleString()}
                sub="tickets sold for this event"
                color="text-indigo-700"
              />
              <StatCard
                label="Checked In"
                value={`${analytics.totalCheckedIn.toLocaleString()} / ${analytics.totalSold.toLocaleString()}`}
                sub={`Check-in rate: ${fmtPct(analytics.checkInRate)}`}
                color="text-green-700"
              />
              <StatCard
                label="Pending Verification"
                value={analytics.pendingRegistrations.toLocaleString()}
                sub="transactions awaiting verification"
                color={analytics.pendingRegistrations > 0 ? 'text-amber-600' : 'text-gray-400'}
              />
            </div>

            {/* Tier capacity */}
            {analytics.tierBreakdown.length > 0 && (
              <div className="bg-white shadow rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-gray-900">Tier Capacity &amp; Revenue</h2>
                <div className="space-y-5">
                  {analytics.tierBreakdown.map((tier) => (
                    <CapacityBar key={tier.tierId} tier={tier} />
                  ))}
                </div>
                <div className="pt-3 border-t border-gray-100 flex justify-between text-sm">
                  <span className="font-medium text-gray-700">Total Revenue (all tiers)</span>
                  <span className="font-bold text-gray-900">
                    {fmtRevenue(analytics.tierBreakdown.reduce((sum, t) => sum + t.revenue, 0))}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Timeline charts */}
        {timeline && timeline.series.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white shadow rounded-2xl p-6 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Revenue Trend</h2>
                <span className="text-xs text-gray-400">Last {timelineDays} days</span>
              </div>
              <Sparkline data={revenueData} color="#6366f1" />
              <div className="flex justify-between text-xs text-gray-400 pt-1">
                <span>{timeline.series[0]?.date}</span>
                <span>{lastDate}</span>
              </div>
              <p className="text-xs text-gray-500">
                Peak: {fmtRevenue(Math.max(...revenueData))} ·{' '}
                Total: {fmtRevenue(revenueData.reduce((s, v) => s + v, 0))}
              </p>
            </div>

            <div className="bg-white shadow rounded-2xl p-6 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Daily Sales</h2>
                <span className="text-xs text-gray-400">Orders + registrations</span>
              </div>
              <Sparkline data={salesData} color="#22c55e" />
              <div className="flex justify-between text-xs text-gray-400 pt-1">
                <span>{timeline.series[0]?.date}</span>
                <span>{lastDate}</span>
              </div>
              <p className="text-xs text-gray-500">
                Peak day: {Math.max(...salesData)} sales ·{' '}
                Total: {salesData.reduce((s, v) => s + v, 0)}
              </p>
            </div>
          </div>
        )}

        {/* No data */}
        {!analyticsLoading && !analytics && selectedEventId && (
          <p className="text-gray-400 text-center py-12">No data for this event yet.</p>
        )}
      </main>
    </>
  );
}
