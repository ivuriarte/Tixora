import { ScreenSkeleton } from '@/components/ScreenState';

export default function Loading() {
  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-lg px-4">
        <ScreenSkeleton rows={3} compact />
      </div>
    </main>
  );
}
