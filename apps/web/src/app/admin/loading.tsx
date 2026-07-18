import { SkeletonBlock, SkeletonAdminTable } from '@/components/Skeleton';

export default function Loading() {
  return (
    <main className="axon-admin-page space-y-8">
        {/* Page header */}
        <div className="space-y-2" aria-hidden="true">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" aria-hidden="true">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-[#e4dcf4] bg-white p-4">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-7 w-16" />
            </div>
          ))}
        </div>
        <SkeletonAdminTable rows={8} />
    </main>
  );
}
