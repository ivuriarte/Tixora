'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

type OrganizerRole = 'owner' | 'co_owner' | 'manager' | 'member';

interface OrganizerTeamAccess {
  currentRole: OrganizerRole;
  canManage: boolean;
}

export function useOrganizerAccess() {
  const { user, isHydrating } = useAuthStore();
  const shouldLoadTeam = Boolean(user?.isOrganizer && !user?.isAdmin);
  const query = useQuery<OrganizerTeamAccess>({
    queryKey: ['organization-team-access'],
    enabled: shouldLoadTeam,
    retry: false,
    staleTime: 60_000,
    queryFn: () =>
      api
        .get<{ data: OrganizerTeamAccess }>('/organizations/me/members')
        .then((response) => response.data.data),
  });

  return {
    role: user?.isAdmin ? null : query.data?.currentRole ?? null,
    canCreateEvents: Boolean(user?.isAdmin || query.data?.currentRole === 'owner'),
    isCheckingEventOwnership: isHydrating || (shouldLoadTeam && query.isLoading),
  };
}
