import { SkeletonNavbar, SkeletonBlock, SkeletonRegistrationForm } from '@/components/Skeleton';

/**
 * Shown while the registration page is authenticating and fetching event data.
 * Matches the CheckoutStepper + form layout.
 */
export default function Loading() {
  return (
    <>
      <SkeletonNavbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        {/* CheckoutStepper skeleton */}
        <div className="flex items-center gap-3" aria-hidden="true">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 flex-1">
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse shrink-0" />
              {i < 2 && <div className="flex-1 h-0.5 bg-gray-200 animate-pulse" />}
            </div>
          ))}
        </div>
        <SkeletonBlock className="h-7 w-56" />
        <SkeletonRegistrationForm />
      </main>
    </>
  );
}
