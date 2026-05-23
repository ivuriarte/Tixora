'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth';
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
  allowManualPayment?: boolean;
  paymentMethods?: PaymentMethod[] | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  paymentInstructions?: string | null;
}

export default function RegisterPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tierId?: string; qty?: string };
}) {
  const router = useRouter();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);

  const qty = Math.max(1, parseInt(searchParams.qty ?? '1', 10));

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/auth/login?redirect=/events/${params.slug}/register`);
      return;
    }
    const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://api-tau-six-59.vercel.app/api/v1');
    fetch(`${baseUrl}/events/${params.slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) { router.replace(`/events/${params.slug}`); return; }
        setEvent(json.data);
      })
      .catch(() => router.replace(`/events/${params.slug}`))
      .finally(() => setLoading(false));
  }, [params.slug, router]);

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
          paymentMethods={event.paymentMethods ?? null}
          bankName={event.bankName ?? null}
          bankAccountName={event.bankAccountName ?? null}
          bankAccountNumber={event.bankAccountNumber ?? null}
          paymentInstructions={event.paymentInstructions ?? null}
        />
      </div>
    </main>
  );
}

