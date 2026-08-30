'use client';

import { useParams } from 'next/navigation';
import { IcebreakerTab } from '@/components/icebreaker';

export default function IcebreakerPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Icebreaker</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Pick a random attendee for prizes, questions, or team activities.
          Names are auto-populated from checked-in attendees.
        </p>
      </div>
      <IcebreakerTab eventId={id} />
    </div>
  );
}
