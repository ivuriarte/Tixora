import type { MetadataRoute } from 'next';
import { solutionCategories } from '@/lib/solutions';

export const dynamic = 'force-dynamic';

interface SitemapEvent {
  slug: string;
  startsAt: string;
}

interface EventsPage {
  data: SitemapEvent[];
  meta: { totalPages: number };
}

async function fetchEventsPage(page: number): Promise<EventsPage | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.axontickets.online/api/v1';
  try {
    const response = await fetch(`${apiUrl}/events?page=${page}&limit=50`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const json = await response.json();
    return json.data ?? json;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.NEXT_PUBLIC_APP_ENV === 'uat') return [];

  const siteUrl = 'https://axontickets.online';
  const firstPage = await fetchEventsPage(1);
  const remainingPages = firstPage && firstPage.meta.totalPages > 1
    ? await Promise.all(
        Array.from({ length: firstPage.meta.totalPages - 1 }, (_, index) => fetchEventsPage(index + 2)),
      )
    : [];
  const events = [firstPage, ...remainingPages]
    .filter((page): page is EventsPage => page !== null)
    .flatMap((page) => page.data);

  return [
    { url: siteUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/organizers`, changeFrequency: 'monthly', priority: 0.8 },
    ...solutionCategories.map((category) => ({
      url: `${siteUrl}/solutions/${category.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...events.map((event) => ({
      url: `${siteUrl}/events/${event.slug}`,
      lastModified: new Date(event.startsAt),
      changeFrequency: 'daily' as const,
      priority: 0.9,
    })),
  ];
}
