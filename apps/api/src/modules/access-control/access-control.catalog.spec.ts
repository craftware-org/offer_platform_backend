import {
  ADMIN_ASSIGNABLE_ROLES,
  Permission,
  PERMISSION_DESCRIPTIONS,
  Role,
  ROLE_DEFINITIONS,
} from './access-control.catalog.js';

describe('access-control catalog', () => {
  it('describes every permission', () => {
    expect(Object.keys(PERMISSION_DESCRIPTIONS).sort()).toEqual(Object.values(Permission).sort());
  });

  it('defines every role', () => {
    expect(Object.keys(ROLE_DEFINITIONS).sort()).toEqual(Object.values(Role).sort());
  });

  it('gives SUPER_ADMIN every ADMIN permission plus role assignment', () => {
    const admin = ROLE_DEFINITIONS.ADMIN.permissions;
    const superAdmin = ROLE_DEFINITIONS.SUPER_ADMIN.permissions;
    expect(superAdmin).toEqual(expect.arrayContaining(admin));
    expect(superAdmin).toContain(Permission.ROLES_ASSIGN);
    expect(admin).not.toContain(Permission.ROLES_ASSIGN);
  });

  it('gives customers and business roles no global permissions (they are scoped per business)', () => {
    expect(ROLE_DEFINITIONS.CUSTOMER.permissions).toEqual([]);
    expect(ROLE_DEFINITIONS.BUSINESS_OWNER.permissions).toEqual([]);
    expect(ROLE_DEFINITIONS.BUSINESS_STAFF.permissions).toEqual([]);
  });

  it('only allows administrative roles to be assigned through the admin API', () => {
    expect([...ADMIN_ASSIGNABLE_ROLES].sort()).toEqual([Role.ADMIN, Role.SUPER_ADMIN]);
  });
});
