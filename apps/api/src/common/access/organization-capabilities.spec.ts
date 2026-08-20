import {
  normalizeOrganizationRole,
  organizationCapabilities,
  organizationRoleCan,
  workspaceRoleForOrganizationRole,
} from './organization-capabilities';

describe('organization capabilities', () => {
  it('treats legacy Admin memberships as Managers without granting event mutation', () => {
    const role = normalizeOrganizationRole('admin');
    expect(role).toBe('manager');
    expect(organizationRoleCan(role, 'workspace.manage')).toBe(true);
    expect(organizationRoleCan(role, 'events.manage')).toBe(false);
  });

  it('reserves event mutation for the Owner role', () => {
    expect(organizationRoleCan('owner', 'events.manage')).toBe(true);
    expect(organizationRoleCan('co_owner', 'events.manage')).toBe(false);
    expect(organizationRoleCan('manager', 'events.manage')).toBe(false);
    expect(organizationRoleCan('member', 'events.manage')).toBe(false);
  });

  it('lets Co-owners and Managers manage Workspace while Members update assigned tasks only', () => {
    expect(organizationRoleCan('co_owner', 'workspace.manage')).toBe(true);
    expect(organizationRoleCan('manager', 'workspace.manage')).toBe(true);
    expect(organizationRoleCan('member', 'workspace.manage')).toBe(false);
    expect(organizationRoleCan('member', 'workspace.task.update_assigned')).toBe(true);
  });

  it('limits Co-owner appointment to a capability held only by the Owner', () => {
    expect(organizationCapabilities('owner')).toContain('organization.co_owners.manage');
    expect(organizationCapabilities('co_owner')).not.toContain('organization.co_owners.manage');
  });

  it('maps Members to read-only Workspace viewer snapshots', () => {
    expect(workspaceRoleForOrganizationRole('owner')).toBe('manager');
    expect(workspaceRoleForOrganizationRole('co_owner')).toBe('manager');
    expect(workspaceRoleForOrganizationRole('manager')).toBe('manager');
    expect(workspaceRoleForOrganizationRole('member')).toBe('viewer');
  });
});
