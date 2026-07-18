import { SkeletonBlock } from './Skeleton';

export function ScreenSkeleton({ rows = 5, compact = false }: { rows?: number; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-3 py-4' : 'space-y-4 py-8'} role="status" aria-label="Loading content">
      {!compact && (
        <div className="grid gap-4 sm:grid-cols-3" aria-hidden="true">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-[#e4dcf4] bg-white p-4" aria-hidden="true">
        <SkeletonBlock className="mb-4 h-10 w-full" />
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, index) => (
            <SkeletonBlock key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[#d3c8e8] bg-white px-6 py-12 text-center">
      <h2 className="axon-section-title text-lg">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#6b5b8a]">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Unable to load this screen', message, action }: { title?: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center" role="alert">
      <h2 className="axon-section-title text-lg text-red-800">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-red-700">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
