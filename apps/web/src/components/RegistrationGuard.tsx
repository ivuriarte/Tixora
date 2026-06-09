'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import RegistrationPanel from '@/components/RegistrationPanel';
import TierSelector from '@/components/TierSelector';

interface Tier {
  id: string;
  name: string;
  price: number;
  availableQuantity: number;
  totalQuantity: number;
  maxPerOrder: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
}

interface ExistingReg {
  id: string;
  referenceNumber: string;
  status: string;
  tierName: string | null;
}

interface CheckResponse {
  hasRegistration: boolean;
  registration: ExistingReg | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment:  'Pending Payment',
  proof_submitted:  'Under Review',
  verified:         'Verified',
};

interface Props {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  tiers: Tier[];
  maxPerUser: number;
  // RegistrationPanel props
  useManualPayment: boolean;
  bankName?: string | null;
  gcashNumber?: string | null;
  paymentMethods?: Array<{
    type: string;
    name?: string;
    accountName?: string;
    accountNumber?: string;
    qrImageUrl?: string;
  }> | null;
  disabled: boolean;
}

export default function RegistrationGuard({
  eventId,
  eventTitle,
  eventSlug,
  tiers,
  maxPerUser,
  useManualPayment,
  bankName,
  gcashNumber,
  paymentMethods,
  disabled,
}: Props) {
  const { isAuthenticated, isHydrating } = useAuthStore();
  const isHydrated = !isHydrating;

  const { data, isLoading } = useQuery<CheckResponse>({
    queryKey: ['registration-check', eventId],
    queryFn: () =>
      api
        .get<{ data: CheckResponse }>(`/registrations/check?eventId=${eventId}`)
        .then((r) => r.data.data),
    // Only run when auth is ready and user is logged in
    enabled: isHydrated && isAuthenticated,
    staleTime: 60_000,
    retry: false,
  });

  // While auth is still hydrating or check is in-flight, show a subtle skeleton
  // so the panel doesn't flash between states
  if (!isHydrated || (isAuthenticated && isLoading)) {
    return (
      <div className="sticky top-6 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-3 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3" />
        <div className="h-14 bg-gray-100 rounded-xl" />
        <div className="h-14 bg-gray-100 rounded-xl" />
        <div className="h-11 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  // User already has an active registration for this event
  if (isAuthenticated && data?.hasRegistration && data.registration) {
    const reg = data.registration;
    const statusLabel = STATUS_LABELS[reg.status] ?? reg.status;
    const isVerified = reg.status === 'verified';

    return (
      <div className="sticky top-6 space-y-3">
        {/* Already-registered banner */}
        <div className="bg-white border-2 border-emerald-200 rounded-2xl shadow-sm p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">You&apos;re already registered</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                You have an active registration for this event. To avoid duplicates, you cannot register again.
              </p>
            </div>
          </div>

          {/* Registration summary */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-xs">
            {reg.tierName && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Tier</span>
                <span className="font-medium text-gray-900">{reg.tierName}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Status</span>
              <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full ${
                isVerified
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isVerified ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {statusLabel}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Ref #</span>
              <span className="font-mono text-gray-700">{reg.referenceNumber}</span>
            </div>
          </div>

          {/* CTA */}
          <Link
            href={`/registrations/${reg.id}`}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
          >
            {isVerified ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h14a2 2 0 012 2v1.5a2 2 0 100 4V16a2 2 0 01-2 2H5a2 2 0 01-2-2v-1.5a2 2 0 100-4V9z"/>
                </svg>
                View My Tickets
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
                View Registration
              </>
            )}
          </Link>
        </div>

        {/* Also check My Events shortcut */}
        <p className="text-center text-xs text-gray-400">
          Manage all your tickets in{' '}
          <Link href="/account/tickets" className="text-primary hover:underline font-medium">
            My Events
          </Link>
        </p>
      </div>
    );
  }

  // No active registration — render the correct panel
  if (useManualPayment) {
    return (
      <RegistrationPanel
        eventId={eventId}
        eventTitle={eventTitle}
        eventSlug={eventSlug}
        tiers={tiers}
        bankName={bankName ?? null}
        gcashNumber={gcashNumber ?? null}
        paymentMethods={paymentMethods ?? null}
        disabled={disabled}
      />
    );
  }

  return (
    <TierSelector
      eventId={eventId}
      eventSlug={eventSlug}
      maxPerUser={maxPerUser}
      tiers={tiers}
      disabled={disabled}
    />
  );
}
