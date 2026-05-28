import { cn } from '@/lib/utils';

/**
 * Composable skeleton primitives. Use these to build route-level
 * loading skeletons that match the actual page layout — minimises
 * cumulative layout shift (CLS) during navigation.
 */

interface SkeletonProps {
  className?: string;
}

/** Single pulsing block — the base building block. */
export function SkeletonBlock({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-gray-100', className)}
      aria-hidden="true"
    />
  );
}

/** Full-width text line placeholder. */
export function SkeletonLine({ className }: SkeletonProps) {
  return <SkeletonBlock className={cn('h-4 w-full', className)} />;
}

/** Matches the sticky Navbar (height + border). */
export function SkeletonNavbar() {
  return (
    <div
      className="sticky top-0 z-50 h-16 bg-white border-b border-gray-200 shadow-sm"
      aria-hidden="true"
    />
  );
}

/** Matches an EventCard grid item. */
export function SkeletonEventCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white shadow" aria-hidden="true">
      <SkeletonBlock className="h-44 w-full rounded-none" />
      <div className="p-4 space-y-2">
        <SkeletonLine className="w-2/3" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-4/5" />
        <SkeletonBlock className="h-5 w-1/3 mt-2" />
      </div>
    </div>
  );
}

/** Matches the sticky Registration panel on the event detail page. */
export function SkeletonRegistrationPanel() {
  return (
    <div
      className="sticky top-6 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4"
      aria-hidden="true"
    >
      <SkeletonLine className="w-1/3 h-5" />
      <div className="space-y-2">
        <SkeletonBlock className="h-14 w-full" />
        <SkeletonBlock className="h-14 w-full" />
      </div>
      <SkeletonBlock className="h-11 w-full" />
    </div>
  );
}

/** Matches the event detail page hero image + title + description area. */
export function SkeletonEventDetail() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <SkeletonBlock className="h-64 sm:h-80 w-full rounded-2xl" />
      <div className="space-y-3">
        <SkeletonLine className="w-2/3 h-8" />
        <SkeletonLine className="w-1/3 h-5" />
      </div>
      <div className="space-y-2">
        <SkeletonLine />
        <SkeletonLine />
        <SkeletonLine className="w-4/5" />
      </div>
      <SkeletonBlock className="h-48 w-full rounded-2xl" />
    </div>
  );
}

/** Matches an admin table row. */
export function SkeletonTableRow() {
  return (
    <tr aria-hidden="true">
      {[...Array(5)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonLine className={i === 0 ? 'w-28' : i === 4 ? 'w-16' : 'w-full'} />
        </td>
      ))}
    </tr>
  );
}

/** Matches an admin table with filter controls. */
export function SkeletonAdminTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {/* Filter bar */}
      <div className="flex gap-3 flex-wrap">
        <SkeletonBlock className="h-9 w-48" />
        <SkeletonBlock className="h-9 w-36" />
        <SkeletonBlock className="h-9 w-36" />
      </div>
      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {[...Array(5)].map((_, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <SkeletonLine className="w-20 h-3" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...Array(rows)].map((_, i) => (
              <SkeletonTableRow key={i} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Matches a 2-column registration form (order summary + attendee fields). */
export function SkeletonRegistrationForm() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <SkeletonBlock className="h-24 w-full rounded-2xl" />
      <SkeletonBlock className="h-48 w-full rounded-2xl" />
      <SkeletonBlock className="h-48 w-full rounded-2xl" />
      <SkeletonBlock className="h-12 w-full rounded-xl" />
    </div>
  );
}
