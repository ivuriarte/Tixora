import Navbar from '@/components/Navbar';
import EventCard from '@/components/EventCard';
import Link from 'next/link';

interface EventSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: string;
  imageUrl?: string | null;
  lowestPrice?: number | null;
  status: string;
}

async function getEvents(page = 1): Promise<{ data: EventSummary[]; meta: { total: number; totalPages: number } }> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  try {
    const res = await fetch(`${baseUrl}/events?page=${page}&limit=12`, { next: { revalidate: 60 } });
    if (!res.ok) return { data: [], meta: { total: 0, totalPages: 0 } };
    const json = await res.json();
    return json.data;
  } catch {
    return { data: [], meta: { total: 0, totalPages: 0 } };
  }
}

export default async function HomePage({ searchParams }: { searchParams: { page?: string } }) {
  const page = parseInt(searchParams.page ?? '1', 10) || 1;
  const { data: events, meta } = await getEvents(page);

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Upcoming Events</h1>
          <p className="text-gray-500 mt-1">Find and book tickets to the best events in the Philippines</p>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No events available yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="flex justify-center gap-3 mt-10">
            {page > 1 && (
              <Link href={`/?page=${page - 1}`} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:border-gray-400 transition-colors">
                ← Previous
              </Link>
            )}
            <span className="px-4 py-2 text-sm text-gray-500">
              Page {page} of {meta.totalPages}
            </span>
            {page < meta.totalPages && (
              <Link href={`/?page=${page + 1}`} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:border-gray-400 transition-colors">
                Next →
              </Link>
            )}
          </div>
        )}
      </main>
    </>
  );
}
