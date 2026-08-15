'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWheelParticipants } from './useWheelParticipants';
import WheelMode from './WheelMode';
import RaffleMode from './RaffleMode';
import { ErrorState, ScreenSkeleton } from '@/components/ScreenState';
import type { IcebreakerMode } from './types';

interface IcebreakerTabProps {
  eventId: string;
}

export default function IcebreakerTab({ eventId }: IcebreakerTabProps) {
  const [mode, setMode] = useState<IcebreakerMode>('wheel');
  const { data, isLoading, error } = useWheelParticipants(eventId);
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wheel-participants', eventId] });
  }, [queryClient, eventId]);

  if (isLoading) {
    return <ScreenSkeleton />;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load participants"
        message="Check your connection and try again."
      />
    );
  }

  const names = data?.participants.map((p) => p.name) ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Mode switcher + refresh */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex gap-1.5">
          <button
            onClick={() => setMode('wheel')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              mode === 'wheel'
                ? 'bg-primary text-white'
                : 'bg-transparent text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            Wheel
          </button>
          <button
            onClick={() => setMode('raffle')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              mode === 'raffle'
                ? 'bg-primary text-white'
                : 'bg-transparent text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
            </svg>
            Raffle
          </button>
        </div>

        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          title="Refresh participant list from latest check-ins"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Mode content */}
      {mode === 'wheel' ? (
        <WheelMode names={names} />
      ) : (
        <RaffleMode names={names} />
      )}
    </div>
  );
}
