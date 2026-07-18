import { SkeletonNavbar, SkeletonBlock } from '@/components/Skeleton';

/**
 * Shown while the registration detail page fetches the registration record.
 * Mirrors the actual page layout (status card + attendees + payment proof).
 */
export default function Loading() {
  return (
    <>
      <SkeletonNavbar />
      <main className="min-h-screen bg-gray-50 py-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-4" aria-hidden="true">
          <SkeletonBlock className="h-5 w-24" />
          <SkeletonBlock className="h-36 w-full rounded-lg" />
          <SkeletonBlock className="h-32 w-full rounded-lg" />
          <SkeletonBlock className="h-48 w-full rounded-lg" />
        </div>
      </main>
    </>
  );
}
