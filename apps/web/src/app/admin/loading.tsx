import { SkeletonNavbar, SkeletonBlock, SkeletonAdminTable } from '@/components/Skeleton';

/**
 * Shown for any admin page while data is loading.
 * Matches the admin dashboard layout: header + stats + table.
 */
export default function Loading() {
  return (
    <>
      <SkeletonNavbar />
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        {/* Page header */}
        <div className="space-y-2" aria-hidden="true">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" aria-hidden="true">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-7 w-16" />
            </div>
          ))}
        </div>
        <SkeletonAdminTable rows={8} />
      </main>
    </>
  );
}
