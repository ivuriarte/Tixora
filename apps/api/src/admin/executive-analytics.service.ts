import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export const EXECUTIVE_METRIC_DEFINITIONS = [
  {
    key: 'totalOrganizers',
    label: 'Total Organizers',
    definition: 'Approved, non-test organizer records created on or before the report end date.',
  },
  {
    key: 'activeOrganizers',
    label: 'Active Organizers',
    definition:
      'Approved, non-test organizers with at least one non-test on-sale or sold-out event that has not ended as of the report end date.',
  },
  {
    key: 'inactiveOrganizers',
    label: 'Inactive Organizers',
    definition: 'Total Organizers minus Active Organizers.',
  },
  {
    key: 'overallEvents',
    label: 'Overall Events',
    definition:
      'All non-test events created on or before the report end date, including cancelled events.',
  },
  {
    key: 'activeEvents',
    label: 'Active Events',
    definition:
      'Non-test on-sale or sold-out events that have not ended as of the report end date.',
  },
  {
    key: 'finishedEvents',
    label: 'Finished Events',
    definition:
      'Non-test completed events, or non-cancelled events whose effective end is before the report end date.',
  },
  {
    key: 'totalUserAccounts',
    label: 'Total User Accounts',
    definition: 'Non-admin, non-test customer accounts created on or before the report end date.',
  },
  {
    key: 'successfulTransactions',
    label: 'Successful Transactions',
    definition:
      'Paid or later-refunded online orders plus verified manual-payment registrations completed within the selected date range.',
  },
  {
    key: 'ticketsIssued',
    label: 'Tickets Issued',
    definition:
      'Online tickets plus attendee records attached to successful transactions in the selected date range; cancelled tickets are excluded.',
  },
  {
    key: 'grossSales',
    label: 'Gross Sales',
    definition:
      'Total approved transaction value, including platform fees and before refund deductions, within the selected date range.',
  },
  {
    key: 'refunds',
    label: 'Refunds',
    definition: 'Total value of transactions in refunded status within the selected date range.',
  },
  { key: 'netSales', label: 'Net Sales', definition: 'Gross Sales minus Refunds.' },
  {
    key: 'platformFees',
    label: 'Platform Fees',
    definition:
      'Platform fees attached to approved transactions within the selected date range, before refund deductions.',
  },
  {
    key: 'averageOrderValue',
    label: 'Average Order Value',
    definition: 'Gross Sales divided by Successful Transactions.',
  },
  {
    key: 'averageSpendPerPayingUser',
    label: 'Average Spend per Paying User',
    definition:
      'Gross Sales divided by unique paying identities; account id is preferred and normalized guest email is used only for guest transactions.',
  },
  {
    key: 'averageCustomerAge',
    label: 'Average Customer Age',
    definition:
      'Average completed age as of the report end date among non-admin, non-test customer accounts with a valid birthday.',
  },
  {
    key: 'ageDataCoverage',
    label: 'Age Data Coverage',
    definition: 'Percentage of included customer accounts with a valid birthday.',
  },
] as const;

type Granularity = 'day' | 'week' | 'month';

@Injectable()
export class ExecutiveAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  getDefinitions() {
    return {
      version: '2.1',
      currency: 'PHP',
      businessTimeZone: 'Asia/Manila',
      refreshTargetMinutes: 15,
      definitions: EXECUTIVE_METRIC_DEFINITIONS,
    };
  }

  private parseRange(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 29 * 86_400_000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new BadRequestException('from and to must be valid ISO dates');
    }
    if (start > end) throw new BadRequestException('from must be before to');
    if (end.getTime() - start.getTime() > 5 * 366 * 86_400_000) {
      throw new BadRequestException('Executive analytics range cannot exceed five years');
    }
    return { start, end };
  }

  private chooseGranularity(start: Date, end: Date, requested?: string): Granularity {
    if (requested && requested !== 'auto') {
      if (!['day', 'week', 'month'].includes(requested))
        throw new BadRequestException('granularity must be auto, day, week, or month');
      return requested as Granularity;
    }
    const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
    return days <= 45 ? 'day' : days <= 180 ? 'week' : 'month';
  }

  private bucketKey(date: Date, granularity: Granularity) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    if (granularity === 'month') return `${year}-${String(month).padStart(2, '0')}`;
    const local = new Date(Date.UTC(year, month - 1, day));
    if (granularity === 'week') {
      const mondayOffset = (local.getUTCDay() + 6) % 7;
      local.setUTCDate(local.getUTCDate() - mondayOffset);
    }
    return local.toISOString().slice(0, 10);
  }

  private completedAge(birthday: Date, at: Date) {
    const atParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(at);
    const atYear = Number(atParts.find((part) => part.type === 'year')?.value);
    const atMonth = Number(atParts.find((part) => part.type === 'month')?.value);
    const atDay = Number(atParts.find((part) => part.type === 'day')?.value);
    const birthdayYear = birthday.getUTCFullYear();
    const birthdayMonth = birthday.getUTCMonth() + 1;
    const birthdayDay = birthday.getUTCDate();
    let age = atYear - birthdayYear;
    if (atMonth < birthdayMonth || (atMonth === birthdayMonth && atDay < birthdayDay)) age -= 1;
    return age;
  }

  async getSnapshot(from?: string, to?: string, requestedGranularity?: string) {
    const { start, end } = this.parseRange(from, to);
    const granularity = this.chooseGranularity(start, end, requestedGranularity);
    const transactionWindow = { gte: start, lte: end };

    const [organizations, events, customerUsers, orders, registrations] = await Promise.all([
      this.prisma.organization.findMany({
        where: { approvalStatus: 'approved', isTest: false, createdAt: { lte: end } },
        select: {
          id: true,
          events: {
            where: { isTest: false, createdAt: { lte: end } },
            select: { status: true, startsAt: true, endsAt: true },
          },
        },
      }),
      this.prisma.event.findMany({
        where: { isTest: false, createdAt: { lte: end } },
        select: { id: true, status: true, startsAt: true, endsAt: true },
      }),
      this.prisma.user.findMany({
        where: { isAdmin: false, isTest: false, createdAt: { lte: end } },
        select: { id: true, birthday: true },
      }),
      this.prisma.order.findMany({
        where: {
          status: { in: ['paid', 'refunded'] },
          createdAt: transactionWindow,
          event: { isTest: false },
          user: { isTest: false },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          total: true,
          fees: true,
          createdAt: true,
          event: { select: { organization: { select: { id: true, name: true } } } },
          tickets: { where: { status: { not: 'cancelled' } }, select: { id: true } },
        },
      }),
      this.prisma.registration.findMany({
        where: {
          status: 'verified',
          verifiedAt: transactionWindow,
          event: { isTest: false },
          OR: [{ userId: null }, { user: { isTest: false } }],
        },
        select: {
          id: true,
          userId: true,
          guestEmail: true,
          total: true,
          fees: true,
          verifiedAt: true,
          event: { select: { organization: { select: { id: true, name: true } } } },
          attendees: { select: { id: true } },
        },
      }),
    ]);

    const isActiveEvent = (event: { status: string; startsAt: Date; endsAt: Date | null }) =>
      ['on_sale', 'sold_out'].includes(event.status) &&
      (event.endsAt ?? new Date(event.startsAt.getTime() + 86_400_000)) >= end;
    const isFinishedEvent = (event: { status: string; startsAt: Date; endsAt: Date | null }) =>
      event.status === 'completed' ||
      (event.status !== 'cancelled' &&
        (event.endsAt ?? new Date(event.startsAt.getTime() + 86_400_000)) < end);

    const activeOrganizers = organizations.filter((org) => org.events.some(isActiveEvent)).length;
    const successfulTransactions = orders.length + registrations.length;
    const grossSales =
      orders.reduce((sum, item) => sum + Number(item.total), 0) +
      registrations.reduce((sum, item) => sum + Number(item.total), 0);
    const refunds = orders
      .filter((item) => item.status === 'refunded')
      .reduce((sum, item) => sum + Number(item.total), 0);
    const platformFees =
      orders.reduce((sum, item) => sum + Number(item.fees), 0) +
      registrations.reduce((sum, item) => sum + Number(item.fees), 0);
    const payerKeys = new Set<string>([
      ...orders.map((item) => `user:${item.userId}`),
      ...registrations.map((item) =>
        item.userId
          ? `user:${item.userId}`
          : `guest:${item.guestEmail?.trim().toLowerCase() ?? item.id}`,
      ),
    ]);
    const validAges = customerUsers.flatMap((user) => {
      if (!user.birthday) return [];
      const age = this.completedAge(user.birthday, end);
      return age >= 0 && age <= 120 ? [age] : [];
    });

    const buckets = new Map<
      string,
      {
        grossSales: number;
        refunds: number;
        platformFees: number;
        transactions: number;
        ticketsIssued: number;
      }
    >();
    const add = (
      date: Date,
      value: { gross: number; refund: number; fees: number; tickets: number },
    ) => {
      const key = this.bucketKey(date, granularity);
      const bucket = buckets.get(key) ?? {
        grossSales: 0,
        refunds: 0,
        platformFees: 0,
        transactions: 0,
        ticketsIssued: 0,
      };
      bucket.grossSales += value.gross;
      bucket.refunds += value.refund;
      bucket.platformFees += value.fees;
      bucket.transactions += 1;
      bucket.ticketsIssued += value.tickets;
      buckets.set(key, bucket);
    };
    orders.forEach((item) =>
      add(item.createdAt, {
        gross: Number(item.total),
        refund: item.status === 'refunded' ? Number(item.total) : 0,
        fees: Number(item.fees),
        tickets: item.tickets.length,
      }),
    );
    registrations.forEach((item) =>
      add(item.verifiedAt!, {
        gross: Number(item.total),
        refund: 0,
        fees: Number(item.fees),
        tickets: item.attendees.length,
      }),
    );

    const organizerBuckets = new Map<
      string,
      {
        organizerId: string;
        organizerName: string;
        successfulTransactions: number;
        ticketsIssued: number;
        grossSales: number;
        refunds: number;
      }
    >();
    const addOrganizerPerformance = (
      organization: { id: string; name: string } | null,
      value: { transactions: number; tickets: number; gross: number; refunds: number },
    ) => {
      if (!organization) return;
      const row = organizerBuckets.get(organization.id) ?? {
        organizerId: organization.id,
        organizerName: organization.name,
        successfulTransactions: 0,
        ticketsIssued: 0,
        grossSales: 0,
        refunds: 0,
      };
      row.successfulTransactions += value.transactions;
      row.ticketsIssued += value.tickets;
      row.grossSales += value.gross;
      row.refunds += value.refunds;
      organizerBuckets.set(organization.id, row);
    };
    orders.forEach((item) =>
      addOrganizerPerformance(item.event.organization, {
        transactions: 1,
        tickets: item.tickets.length,
        gross: Number(item.total),
        refunds: item.status === 'refunded' ? Number(item.total) : 0,
      }),
    );
    registrations.forEach((item) =>
      addOrganizerPerformance(item.event.organization, {
        transactions: 1,
        tickets: item.attendees.length,
        gross: Number(item.total),
        refunds: 0,
      }),
    );

    return {
      contractVersion: '2.1',
      generatedAt: new Date().toISOString(),
      range: {
        from: start.toISOString(),
        to: end.toISOString(),
        granularity,
        timeZone: 'Asia/Manila',
      },
      metrics: {
        totalOrganizers: organizations.length,
        activeOrganizers,
        inactiveOrganizers: organizations.length - activeOrganizers,
        overallEvents: events.length,
        activeEvents: events.filter(isActiveEvent).length,
        finishedEvents: events.filter(isFinishedEvent).length,
        totalUserAccounts: customerUsers.length,
        successfulTransactions,
        ticketsIssued:
          orders.reduce((sum, item) => sum + item.tickets.length, 0) +
          registrations.reduce((sum, item) => sum + item.attendees.length, 0),
        grossSales,
        refunds,
        netSales: grossSales - refunds,
        platformFees,
        averageOrderValue: successfulTransactions ? grossSales / successfulTransactions : 0,
        averageSpendPerPayingUser: payerKeys.size ? grossSales / payerKeys.size : 0,
        averageCustomerAge: validAges.length
          ? validAges.reduce((sum, age) => sum + age, 0) / validAges.length
          : null,
        ageDataCoverage: customerUsers.length ? validAges.length / customerUsers.length : 0,
      },
      timeline: [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, value]) => ({
          period,
          ...value,
          netSales: value.grossSales - value.refunds,
        })),
      organizerPerformance: [...organizerBuckets.values()]
        .map((row) => ({ ...row, netSales: row.grossSales - row.refunds }))
        .sort(
          (left, right) =>
            right.netSales - left.netSales ||
            right.successfulTransactions - left.successfulTransactions ||
            left.organizerName.localeCompare(right.organizerName),
        ),
    };
  }

  private escapeCsv(value: string | number | null) {
    const clean = String(value ?? '');
    const protectedValue = /^[=+\-@\t\r]/.test(clean) ? `\t${clean}` : clean;
    return `"${protectedValue.replace(/"/g, '""')}"`;
  }

  async exportSnapshot(
    performedById: string,
    from?: string,
    to?: string,
    requestedGranularity?: string,
  ) {
    const snapshot = await this.getSnapshot(from, to, requestedGranularity);
    const metricRows = Object.entries(snapshot.metrics).map(([metric, value]) =>
      [this.escapeCsv(metric), this.escapeCsv(value)].join(','),
    );
    const organizerRows = snapshot.organizerPerformance.map((row) =>
      [
        this.escapeCsv(row.organizerId),
        this.escapeCsv(row.organizerName),
        this.escapeCsv(row.successfulTransactions),
        this.escapeCsv(row.ticketsIssued),
        this.escapeCsv(row.grossSales),
        this.escapeCsv(row.refunds),
        this.escapeCsv(row.netSales),
      ].join(','),
    );
    const csv = [
      'Axon Tickets Executive Analytics Contract,2.1',
      `Range From,${this.escapeCsv(snapshot.range.from)}`,
      `Range To,${this.escapeCsv(snapshot.range.to)}`,
      `Timezone,${this.escapeCsv(snapshot.range.timeZone)}`,
      '',
      'Metric,Value',
      ...metricRows,
      '',
      'Organizer ID,Organizer,Successful Transactions,Tickets Issued,Gross Sales (PHP),Refunds (PHP),Net Sales (PHP)',
      ...organizerRows,
    ].join('\n');
    await this.audit.log({
      action: 'EXECUTIVE_ANALYTICS_EXPORTED',
      entityType: 'Platform',
      entityId: 'executive-analytics',
      performedById,
      metadata: {
        scope: 'platform_aggregates',
        filters: {
          from: snapshot.range.from,
          to: snapshot.range.to,
          granularity: snapshot.range.granularity,
        },
        result: 'success',
        contractVersion: snapshot.contractVersion,
      },
    });
    return csv;
  }
}
