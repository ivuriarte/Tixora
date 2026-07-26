import Link from 'next/link';

export default async function GuestRegistrationCompletePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-16">
      <section className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          ✓
        </div>
        <h1 className="axon-display mt-5 text-4xl text-gray-900">Details submitted</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Your payment proof and attendee information are now pending organizer approval. We will
          send status updates and your ticket to the email address you provided.
        </p>
        <div className="mt-5 rounded-xl bg-gray-50 p-4 text-left text-xs leading-5 text-gray-500">
          No Axon account was created. Keep using this browser session if you need to revisit the
          secure registration link.
        </div>
        <Link href={`/events/${slug}`} className="axon-pill mt-6 inline-flex bg-primary text-sm text-white">
          Return to event
        </Link>
      </section>
    </main>
  );
}
