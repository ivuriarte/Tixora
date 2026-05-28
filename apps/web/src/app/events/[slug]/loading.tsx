import {
  SkeletonNavbar,
  SkeletonEventDetail,
  SkeletonRegistrationPanel,
} from '@/components/Skeleton';

/**
 * Shown while the event detail Server Component is streaming from the API.
 * Mirrors the 2/3 + 1/3 grid layout of the actual event page.
 */
export default function Loading() {
  return (
    <>
      <SkeletonNavbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="lg:grid lg:grid-cols-3 lg:gap-10">
          <div className="lg:col-span-2">
            <SkeletonEventDetail />
          </div>
          <div className="mt-8 lg:mt-0">
            <SkeletonRegistrationPanel />
          </div>
        </div>
      </main>
    </>
  );
}
