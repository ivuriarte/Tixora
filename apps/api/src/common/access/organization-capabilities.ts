export type OrganizationRole = 'owner' | 'co_owner' | 'manager' | 'member';

export function normalizeOrganizationRole(role: string): OrganizationRole {
  return role === 'admin' ? 'manager' : role as OrganizationRole;
}

export type OrganizationCapability =
  | 'events.read'
  | 'events.manage'
  | 'workspace.read'
  | 'workspace.manage'
  | 'workspace.task.update_assigned'
  | 'organization.members.manage'
  | 'organization.co_owners.manage'
  | 'organization.profile.manage';

const ROLE_CAPABILITIES: Record<OrganizationRole, readonly OrganizationCapability[]> = {
  owner: [
    'events.read',
    'events.manage',
    'workspace.read',
    'workspace.manage',
    'workspace.task.update_assigned',
    'organization.members.manage',
    'organization.co_owners.manage',
    'organization.profile.manage',
  ],
  co_owner: [
    'events.read',
    'workspace.read',
    'workspace.manage',
    'workspace.task.update_assigned',
    'organization.members.manage',
    'organization.profile.manage',
  ],
  manager: [
    'events.read',
    'workspace.read',
    'workspace.manage',
    'workspace.task.update_assigned',
  ],
  member: ['events.read', 'workspace.read', 'workspace.task.update_assigned'],
};

export function organizationCapabilities(role: OrganizationRole): OrganizationCapability[] {
  return [...ROLE_CAPABILITIES[role]];
}

export function organizationRoleCan(
  role: OrganizationRole,
  capability: OrganizationCapability,
): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function workspaceRoleForOrganizationRole(
  role: OrganizationRole,
): 'manager' | 'viewer' {
  return role === 'member' ? 'viewer' : 'manager';
}
