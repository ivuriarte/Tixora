import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { WheelParticipantsResponse } from './types';

export function useWheelParticipants(eventId: string) {
  return useQuery<WheelParticipantsResponse>({
    queryKey: ['wheel-participants', eventId],
    queryFn: async () => {
      const { data } = await api.get<{ data: WheelParticipantsResponse }>(
        `/admin/events/${eventId}/wheel-participants`,
      );
      return data.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
