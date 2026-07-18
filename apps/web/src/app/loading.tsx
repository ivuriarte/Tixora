import { SkeletonNavbar, SkeletonBlock, SkeletonEventCard } from '@/components/Skeleton';

/**
 * Global route-level loading UI.
 * Shown by Next.js App Router while the root page (homepage) is streaming.
 * Matches the Netflix-style hero + event-card grid layout.
 */
export default function Loading() {
  return (
    <>
      <SkeletonNavbar />
      {/* Hero skeleton */}
      <div
        className="h-72 animate-pulse bg-[#1a0533] sm:h-80"
        aria-hidden="true"
      />
      {/* Event grid skeleton */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <SkeletonBlock className="h-7 w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <SkeletonEventCard key={i} />
          ))}
        </div>
      </main>
    </>
  );
}
