'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

type OrganizerRole = 'owner' | 'co_owner' | 'manager' | 'member';

interface OrganizerTeamAccess {
  currentRole: OrganizerRole;
  capabilities: string[];
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

  const capabilities = query.data?.capabilities ?? [];
  const hasCap = (cap: string) => capabilities.includes(cap);

  return {
    role: user?.isAdmin ? null : query.data?.currentRole ?? null,
    capabilities,
    canCreateEvents: Boolean(user?.isAdmin || hasCap('events.manage')),
    canViewAnalytics: Boolean(user?.isAdmin || hasCap('analytics.read')),
    canExport: Boolean(user?.isAdmin || hasCap('exports.read')),
    canViewTeam: Boolean(user?.isAdmin || hasCap('organization.members.read')),
    canManageTeam: Boolean(user?.isAdmin || hasCap('organization.members.manage')),
    canViewInclusions: Boolean(user?.isAdmin || hasCap('inclusions.read')),
    isCheckingEventOwnership: isHydrating || (shouldLoadTeam && query.isLoading),
  };
}
