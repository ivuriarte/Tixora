import Navbar from '@/components/Navbar';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { formatManila } from '@axon-tickets/utils';
import TierSelector from '@/components/TierSelector';
import RegistrationPanel from '@/components/RegistrationPanel';

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

interface AgendaItem { time: string; title: string; description?: string; }
interface Sponsor { name: string; logoUrl?: string; tier?: string; }
interface Faq { question: string; answer: string; }

interface Event {
  id: string;
  slug: string;
  title: string;
  description: string;
  venue: string;
  address?: string | null;
  landmark?: string | null;
  city: string;
  startsAt: string;
  endsAt?: string | null;
  imageUrl?: string | null;
  status: string;
  maxPerUser: number;
  tiers: Tier[];
  // Conference fields
  speakerName?: string | null;
  agenda?: AgendaItem[] | null;
  sponsors?: Sponsor[] | null;
  faqs?: Faq[] | null;
  // Payment
  allowManualPayment?: boolean;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  gcashNumber?: string | null;
  paymentMethods?: Array<{
    type: string;
    name?: string;
    accountName?: string;
    accountNumber?: string;
    qrImageUrl?: string;
  }> | null;
}

async function getEvent(slug: string): Promise<Event | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  try {
    const res = await fetch(`${baseUrl}/events/${slug}`, { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const event = await getEvent(params.slug);
  if (!event) return {};
  return {
    title: `${event.title} — Axon Tickets`,
    description: event.description?.slice(0, 150),
    openGraph: { title: event.title, images: event.imageUrl ? [event.imageUrl] : [] },
  };
}

export default async function EventPage({ params, searchParams }: { params: { slug: string }; searchParams: { preview?: string } }) {
  const event = await getEvent(params.slug);
  if (!event) notFound();

  const isPreview = searchParams.preview === '1';
  const isSoldOut = event.status === 'sold_out';
  const isCancelled = event.status === 'cancelled';

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {isPreview && (
          <div className="mb-6 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-amber-800">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-sm font-medium">Admin Preview — registration is disabled</span>
            </div>
            <a href="/admin/event-previews" className="text-sm text-amber-700 hover:underline font-medium">← Back to Event Previews</a>
          </div>
        )}
        <div className="lg:grid lg:grid-cols-3 lg:gap-10">
          {/* Left: Details */}
          <div className="lg:col-span-2 space-y-8">
            {event.imageUrl && (
              <div className="relative rounded-2xl overflow-hidden h-64 sm:h-80">
                <Image src={event.imageUrl} alt={event.title} fill className="object-cover" sizes="800px" />
              </div>
            )}

            <div>
              {isCancelled && (
                <span className="inline-block mb-3 bg-red-100 text-red-700 text-sm font-semibold px-3 py-1 rounded-full">
                  Event Cancelled
                </span>
              )}
              {isSoldOut && !isCancelled && (
                <span className="inline-block mb-3 bg-violet-100 text-violet-700 text-sm font-semibold px-3 py-1 rounded-full">
                  Sold Out
                </span>
              )}
              <h1 className="text-3xl font-bold text-gray-900">{event.title}</h1>
              {event.speakerName && (
                <p className="mt-2 text-lg text-purple-700 font-medium">{event.speakerName}</p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-xs font-medium">Date</p>
                <p className="font-medium mt-0.5">{formatManila(new Date(event.startsAt))}</p>
                {event.endsAt && (
                  <p className="text-xs text-gray-500 mt-0.5">to {formatManila(new Date(event.endsAt))}</p>
                )}
              </div>
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-xs font-medium">Venue</p>
                <p className="font-medium mt-0.5">{event.venue}</p>
                {event.address && (
                  <p className="text-xs text-gray-500 mt-0.5">{event.address}</p>
                )}
                {event.landmark && (
                  <p className="text-xs text-gray-400 mt-0.5">Near: {event.landmark}</p>
                )}
              </div>
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-xs font-medium">City</p>
                <p className="font-medium mt-0.5">{event.city}</p>
              </div>
            </div>

            {event.description && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">About this event</h2>
                <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{event.description}</p>
              </div>
            )}

            {/* Agenda */}
            {Array.isArray(event.agenda) && event.agenda.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Program / Agenda</h2>
                <div className="space-y-3">
                  {event.agenda.map((item, i) => (
                    <div key={i} className="flex gap-4 p-4 bg-violet-50 rounded-xl">
                      <div className="text-primary font-bold text-sm whitespace-nowrap min-w-[80px]">{item.time}</div>
                      <div>
                        <p className="font-semibold text-gray-900">{item.title}</p>
                        {item.description && <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sponsors */}
            {Array.isArray(event.sponsors) && event.sponsors.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Sponsors &amp; Partners</h2>
                <div className="flex flex-wrap gap-6 items-center">
                  {event.sponsors.map((s, i) => (
                    <div key={i} className="text-center">
                      {s.logoUrl ? (
                        <img src={s.logoUrl} alt={s.name} className="h-10 object-contain" />
                      ) : (
                        <span className="inline-block bg-gray-100 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm">{s.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FAQs */}
            {Array.isArray(event.faqs) && event.faqs.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Frequently Asked Questions</h2>
                <div className="space-y-3">
                  {event.faqs.map((faq, i) => (
                    <details key={i} className="group bg-gray-50 rounded-xl">
                      <summary className="flex justify-between items-center cursor-pointer p-4 font-medium text-gray-900 select-none">
                        {faq.question}
                        <svg className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>
                      <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed">{faq.answer}</div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Tier selector / Registration panel */}
          <div className="mt-8 lg:mt-0">
            {(event.paymentMethods?.length || event.allowManualPayment) ? (
              <RegistrationPanel
                eventSlug={event.slug}
                tiers={event.tiers}
                bankName={event.bankName ?? null}
                gcashNumber={event.gcashNumber ?? null}
                paymentMethods={event.paymentMethods ?? null}
                disabled={isPreview || isSoldOut || isCancelled}
              />
            ) : (
              <TierSelector
                eventId={event.id}
                eventSlug={event.slug}
                maxPerUser={event.maxPerUser}
                tiers={event.tiers}
                disabled={isPreview || isSoldOut || isCancelled}
              />
            )}
          </div>
        </div>
      </main>
    </>
  );
}

