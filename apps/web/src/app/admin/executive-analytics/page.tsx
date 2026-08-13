'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import api from '@/lib/api';
import { ScreenSkeleton } from '@/components/ScreenState';
import { formatPHP } from '@axon-tickets/utils';

interface ExecutiveDataset {
  contractVersion: string;
  generatedAt: string;
  range: { from: string; to: string; granularity: string; timeZone: string };
  metrics: Record<string, number | null>;
  timeline: Array<{
    period: string;
    grossSales: number;
    refunds: number;
    netSales: number;
    transactions: number;
    ticketsIssued: number;
  }>;
  organizerPerformance: Array<{
    organizerId: string;
    organizerName: string;
    successfulTransactions: number;
    ticketsIssued: number;
    grossSales: number;
    refunds: number;
    netSales: number;
  }>;
}

const countMetrics = [
  ['totalOrganizers', 'Total organizers'],
  ['activeOrganizers', 'Active organizers'],
  ['inactiveOrganizers', 'Inactive organizers'],
  ['overallEvents', 'Overall events'],
  ['activeEvents', 'Active events'],
  ['finishedEvents', 'Finished events'],
  ['totalUserAccounts', 'Customer accounts'],
  ['successfulTransactions', 'Successful transactions'],
  ['ticketsIssued', 'Tickets issued'],
] as const;

const moneyMetrics = [
  ['grossSales', 'Gross sales'],
  ['refunds', 'Refunds'],
  ['netSales', 'Net sales'],
  ['platformFees', 'Platform fees'],
  ['averageOrderValue', 'Average order value'],
  ['averageSpendPerPayingUser', 'Average spend / paying user'],
] as const;

function localDate(daysAgo = 0) {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export default function ExecutiveAnalyticsPage() {
  const [from, setFrom] = useState(localDate(29));
  const [to, setTo] = useState(localDate());
  const { data, isLoading, error } = useQuery<ExecutiveDataset>({
    queryKey: ['executive-analytics', from, to],
    queryFn: () =>
      api
        .get<{ data: ExecutiveDataset }>(
          `/admin/analytics/executive?from=${encodeURIComponent(`${from}T00:00:00+08:00`)}&to=${encodeURIComponent(`${to}T23:59:59+08:00`)}&granularity=auto`,
        )
        .then((response) => response.data.data),
    refetchInterval: 15 * 60_000,
    staleTime: 5 * 60_000,
  });
  const maxNet = useMemo(
    () => Math.max(1, ...(data?.timeline.map((row) => row.netSales) ?? [1])),
    [data],
  );

  const exportCsv = async () => {
    const response = await api.get(
      `/admin/analytics/executive/export?from=${encodeURIComponent(`${from}T00:00:00+08:00`)}&to=${encodeURIComponent(`${to}T23:59:59+08:00`)}&granularity=auto`,
      { responseType: 'blob' },
    );
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `axon-executive-analytics-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <ScreenSkeleton />;
  if (error || !data)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        Executive analytics could not be loaded. Confirm that your account has Super Admin access
        and retry.
      </div>
    );

  return (
    <div className="space-y-8 pb-12">
      <header className="overflow-hidden rounded-3xl bg-[#1a0533] px-6 py-7 text-white shadow-xl sm:px-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-violet-300">
              Axon intelligence · contract v{data.contractVersion}
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Executive performance</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">
              A single, reconciled view of organizer growth, event delivery, transactions, revenue,
              and customer demographics.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold uppercase tracking-wide text-violet-200">
                From
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(event) => setFrom(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm font-medium text-gray-900"
                />
              </label>
              <label className="text-xs font-bold uppercase tracking-wide text-violet-200">
                To
                <input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(event) => setTo(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm font-medium text-gray-900"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-extrabold text-[#1a0533] transition hover:bg-violet-50"
            >
              <Download className="h-4 w-4" />
              Export reconciled CSV
            </button>
          </div>
        </div>
      </header>

      <section aria-labelledby="operations-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-primary text-xs font-extrabold uppercase tracking-[0.14em]">
              Operations
            </p>
            <h2 id="operations-title" className="text-2xl font-black text-[#1a0533]">
              Platform health
            </h2>
          </div>
          <p className="text-xs text-gray-500">
            As of {new Date(data.range.to).toLocaleString('en-PH')}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {countMetrics.map(([key, label]) => (
            <article
              key={key}
              className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
              <p className="mt-2 text-3xl font-black text-[#1a0533]">
                {Number(data.metrics[key] ?? 0).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="organizer-performance-title"
        className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-primary text-xs font-extrabold uppercase tracking-[0.14em]">
              Organizer performance
            </p>
            <h2 id="organizer-performance-title" className="text-2xl font-black text-[#1a0533]">
              Commercial contribution
            </h2>
          </div>
          <p className="text-xs text-gray-500">Ranked by net sales in the selected range</p>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead>
              <tr className="text-xs font-extrabold uppercase tracking-wide text-gray-500">
                <th className="px-3 py-3">Organizer</th>
                <th className="px-3 py-3 text-right">Transactions</th>
                <th className="px-3 py-3 text-right">Tickets</th>
                <th className="px-3 py-3 text-right">Gross sales</th>
                <th className="px-3 py-3 text-right">Refunds</th>
                <th className="px-3 py-3 text-right">Net sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.organizerPerformance.length ? (
                data.organizerPerformance.map((row) => (
                  <tr key={row.organizerId}>
                    <td className="px-3 py-4 font-bold text-[#1a0533]">{row.organizerName}</td>
                    <td className="px-3 py-4 text-right">
                      {row.successfulTransactions.toLocaleString()}
                    </td>
                    <td className="px-3 py-4 text-right">{row.ticketsIssued.toLocaleString()}</td>
                    <td className="px-3 py-4 text-right">{formatPHP(row.grossSales)}</td>
                    <td className="px-3 py-4 text-right">{formatPHP(row.refunds)}</td>
                    <td className="px-3 py-4 text-right font-extrabold text-[#1a0533]">
                      {formatPHP(row.netSales)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    No organizer transactions in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="finance-title">
        <p className="text-primary text-xs font-extrabold uppercase tracking-[0.14em]">
          Commercial
        </p>
        <h2 id="finance-title" className="text-2xl font-black text-[#1a0533]">
          Financial performance
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {moneyMetrics.map(([key, label]) => (
            <article
              key={key}
              className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
              <p className="mt-2 text-2xl font-black text-[#1a0533]">
                {formatPHP(Number(data.metrics[key] ?? 0))}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <article className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Net sales trend
              </p>
              <h2 className="text-xl font-black text-[#1a0533]">
                {data.range.granularity} performance
              </h2>
            </div>
            <span className="text-xs text-gray-500">PHP · Asia/Manila</span>
          </div>
          <div className="mt-6 flex h-64 items-end gap-2 overflow-x-auto border-b border-l border-gray-200 pl-3">
            {data.timeline.length ? (
              data.timeline.map((row) => (
                <div
                  key={row.period}
                  className="group flex min-w-10 flex-1 flex-col items-center justify-end gap-2"
                  title={`${row.period}: ${formatPHP(row.netSales)}`}
                >
                  <div
                    className="from-primary w-full max-w-12 rounded-t-lg bg-gradient-to-t to-violet-400 transition hover:from-violet-700"
                    style={{ height: `${Math.max(4, (row.netSales / maxNet) * 210)}px` }}
                  />
                  <span className="-rotate-45 whitespace-nowrap text-[10px] text-gray-500">
                    {row.period}
                  </span>
                </div>
              ))
            ) : (
              <p className="m-auto text-sm text-gray-500">
                No successful transactions in this range.
              </p>
            )}
          </div>
        </article>
        <article className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Customer data quality
          </p>
          <h2 className="text-xl font-black text-[#1a0533]">Demographic coverage</h2>
          <div className="mt-8 rounded-full bg-violet-100 p-2">
            <div
              className="bg-primary h-4 rounded-full"
              style={{
                width: `${Math.min(100, Number(data.metrics.ageDataCoverage ?? 0) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-4 text-4xl font-black text-[#1a0533]">
            {(Number(data.metrics.ageDataCoverage ?? 0) * 100).toFixed(1)}%
          </p>
          <p className="text-sm text-gray-500">customer accounts have a valid birthday</p>
          <p className="mt-8 text-xs font-bold uppercase tracking-wide text-gray-500">
            Average customer age
          </p>
          <p className="mt-1 text-2xl font-black text-[#1a0533]">
            {data.metrics.averageCustomerAge === null
              ? 'Not available'
              : `${Number(data.metrics.averageCustomerAge).toFixed(1)} years`}
          </p>
        </article>
      </section>

      <footer className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
        Generated {new Date(data.generatedAt).toLocaleString('en-PH')} · Target refresh: 15 minutes
        · Definitions are versioned by the API and documented in the Release 2.1 metric dictionary.
      </footer>
    </div>
  );
}
