'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth';
import api from '@/lib/api';
import RegistrationForm from '@/components/RegistrationForm';
import CheckoutStepper from '@/components/CheckoutStepper';

interface Tier {
  id: string;
  name: string;
  price: number;
  available: number;
  maxPerOrder: number;
}

interface PaymentMethod {
  name: string;
  type?: string;
  accountName?: string;
  accountNumber?: string;
  instructions?: string;
}

interface EventData {
  id: string;
  slug: string;
  title: string;
  venue: string;
  startsAt: string;
  tiers: Tier[];
  platformFee?: number;
  allowManualPayment?: boolean;
  paymentMethods?: PaymentMethod[] | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  paymentInstructions?: string | null;
}

interface AttendeeFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
}

export default function RegisterPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tierId?: string; qty?: string; registrationId?: string };
}) {
  const router = useRouter();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialAttendees, setInitialAttendees] = useState<AttendeeFields[] | undefined>(undefined);
  const [initialNotes, setInitialNotes] = useState<string | undefined>(undefined);

  const qty = Math.max(1, parseInt(searchParams.qty ?? '1', 10));
  const existingRegistrationId = searchParams.registrationId;

  useEffect(() => {
    if (!getAccessToken()) {
      const redirectUrl = `/events/${params.slug}/register${
        searchParams.tierId ? `?tierId=${searchParams.tierId}&qty=${searchParams.qty ?? '1'}` : ''
      }`;
      router.replace(`/auth/access?redirect=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1');

    const eventFetch = fetch(`${baseUrl}/events/${params.slug}`)
      .then((r) => (r.ok ? r.json() : null));

    const regFetch = existingRegistrationId
      ? api.get(`/registrations/${existingRegistrationId}`).then((r) => r.data?.data ?? r.data).catch(() => null)
      : Promise.resolve(null);

    Promise.all([eventFetch, regFetch])
      .then(([eventJson, regData]) => {
        if (!eventJson) { router.replace(`/events/${params.slug}`); return; }
        setEvent(eventJson.data);

        if (regData?.attendees) {
          // Sort lead first to match the order used by the PATCH endpoint
          const sorted = [...regData.attendees].sort(
            (a: { isLead: boolean }, b: { isLead: boolean }) => (b.isLead ? 1 : 0) - (a.isLead ? 1 : 0),
          );
          setInitialAttendees(
            sorted.map((a: { firstName: string; lastName: string; email: string; phone?: string | null; company?: string | null; jobTitle?: string | null }) => ({
              firstName: a.firstName,
              lastName: a.lastName,
              email: a.email,
              phone: a.phone ?? '',
              company: a.company ?? '',
              jobTitle: a.jobTitle ?? '',
            })),
          );
          setInitialNotes(regData.notes ?? '');
        }
      })
      .catch(() => router.replace(`/events/${params.slug}`))
      .finally(() => setLoading(false));
  }, [params.slug, existingRegistrationId, router]);

  if (loading || !event) {
    return (
      <main className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  const tierId = searchParams.tierId ?? event.tiers[0]?.id;
  const tier = event.tiers.find((t) => t.id === tierId);

  if (!tier) {
    router.replace(`/events/${event.slug}`);
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <CheckoutStepper current={1} />
        <div className="mb-6">
          <a href={`/events/${event.slug}`} className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to event
          </a>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{event.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{event.venue}</p>
        </div>

        <RegistrationForm
          eventId={event.id}
          eventSlug={event.slug}
          tierId={tier.id}
          tierName={tier.name}
          unitPrice={tier.price}
          qty={qty}
          platformFee={event.platformFee ?? 50}
          paymentMethods={event.paymentMethods ?? null}
          bankName={event.bankName ?? null}
          bankAccountName={event.bankAccountName ?? null}
          bankAccountNumber={event.bankAccountNumber ?? null}
          paymentInstructions={event.paymentInstructions ?? null}
          registrationId={existingRegistrationId}
          initialAttendees={initialAttendees}
          initialNotes={initialNotes}
        />
      </div>
    </main>
  );
}

