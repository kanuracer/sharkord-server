import { OWNER_ROLE_ID, Permission } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { getRole, getUserRoleIds } from '../../db/queries/roles';
import { rolePermissions, roles, userRoles, users } from '../../db/schema';

const grant = async (...permissions: Permission[]) => {
  for (const permission of permissions) {
    await tdb
      .insert(rolePermissions)
      .values({ roleId: 2, permission, createdAt: Date.now() })
      .onConflictDoNothing();
  }
};
const update = (roleId: number, permissions: Permission[]) => ({
  roleId,
  name: 'Managed role',
  color: '#123456',
  permissions,
  weight: 42,
  mentionable: true,
  storageQuotaOverrideEnabled: false,
  storageSpaceQuota: 0
});

describe('authorization guards', () => {
  test('nonowner with every permission still cannot grant Owner via the default role', async () => {
    await grant(...Object.values(Permission));
    const { caller } = await initTest(2);
    await expect(
      caller.roles.setDefault({ roleId: OWNER_ROLE_ID })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await getRole(2))?.isDefault).toBe(true);
  });

  test('member cannot clear or replace server logo', async () => {
    const { caller } = await initTest(2);
    await expect(caller.others.changeLogo({})).rejects.toMatchObject({
      code: 'FORBIDDEN'
    });
    await expect(
      caller.others.changeLogo({ fileId: 'untrusted-file' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  test('owner and settings manager can change logo', async () => {
    const { caller: owner } = await initTest();
    await owner.others.changeLogo({});
    await grant(Permission.MANAGE_SETTINGS);
    const { caller } = await initTest(2);
    await caller.others.changeLogo({});
  });
  for (const action of [
    'ban',
    'kick',
    'delete',
    'addRole',
    'removeRole'
  ] as const) {
    test(`nonowner user manager cannot ${action} owner`, async () => {
      await grant(Permission.MANAGE_USERS);
      await tdb
        .insert(userRoles)
        .values({ userId: 1, roleId: 2, createdAt: Date.now() });
      const { caller } = await initTest(2);
      const operation =
        action === 'ban'
          ? caller.users.ban({ userId: 1 })
          : action === 'kick'
            ? caller.users.kick({ userId: 1 })
            : action === 'delete'
              ? caller.users.delete({ userId: 1, wipe: false })
              : action === 'addRole'
                ? caller.users.addRole({ userId: 1, roleId: 3 })
                : caller.users.removeRole({ userId: 1, roleId: 2 });
      await expect(operation).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(
        (await tdb.select().from(users).where(eq(users.id, 1)).get())?.banned
      ).toBe(false);
      expect(await getUserRoleIds(1)).toContain(OWNER_ROLE_ID);
      expect(await getUserRoleIds(1)).toContain(2);
    });
  }
  test('moderator can ban a regular member', async () => {
    await grant(Permission.MANAGE_USERS);
    const { caller } = await initTest(2);
    await caller.users.ban({ userId: 3 });
    expect(
      (await tdb.select().from(users).where(eq(users.id, 3)).get())?.banned
    ).toBe(true);
  });
  test('owner with implied permissions can moderate another owner', async () => {
    await tdb.delete(rolePermissions).where(eq(rolePermissions.roleId, 1));
    await tdb
      .insert(userRoles)
      .values({ userId: 3, roleId: 1, createdAt: Date.now() });
    const { caller } = await initTest();
    await caller.users.ban({ userId: 3 });
    expect(
      (await tdb.select().from(users).where(eq(users.id, 3)).get())?.banned
    ).toBe(true);
  });
  test('role manager cannot grant an unowned permission or partially update metadata', async () => {
    await grant(Permission.MANAGE_ROLES);
    const before = await getRole(3);
    const { caller } = await initTest(2);
    await expect(
      caller.roles.update(update(3, [Permission.MANAGE_SETTINGS]))
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await getRole(3)).toEqual(before);
  });
  test('new role starts empty and cannot be used to mint permissions', async () => {
    await grant(Permission.MANAGE_ROLES);
    const { caller } = await initTest(2);
    const id = await caller.roles.add();
    expect((await getRole(id))?.permissions).toEqual([]);
    await expect(
      caller.roles.update(update(id, [Permission.MANAGE_USERS]))
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await getRole(id))?.permissions).toEqual([]);
  });
  test('role manager can retain existing permissions and remove them without acquiring them', async () => {
    await grant(Permission.MANAGE_ROLES);
    await tdb.insert(rolePermissions).values({
      roleId: 3,
      permission: Permission.MANAGE_SETTINGS,
      createdAt: Date.now()
    });
    const { caller } = await initTest(2);
    await caller.roles.update(update(3, [Permission.MANAGE_SETTINGS]));
    expect((await getRole(3))?.weight).toBe(42);
    await caller.roles.update(update(3, []));
    expect((await getRole(3))?.permissions).toEqual([]);
  });
  test('permissions from multiple actor roles may be granted', async () => {
    await grant(Permission.MANAGE_ROLES);
    await tdb.insert(rolePermissions).values({
      roleId: 3,
      permission: Permission.MANAGE_SETTINGS,
      createdAt: Date.now()
    });
    await tdb
      .insert(userRoles)
      .values({ userId: 2, roleId: 3, createdAt: Date.now() });
    const { caller } = await initTest(2);
    const id = await caller.roles.add();
    await caller.roles.update(update(id, [Permission.MANAGE_SETTINGS]));
    expect((await getRole(id))?.permissions).toEqual([
      Permission.MANAGE_SETTINGS
    ]);
  });
  for (const target of [2, 3]) {
    test(`user manager cannot grant higher-privileged role to user ${target}`, async () => {
      await grant(Permission.MANAGE_USERS);
      await tdb.insert(rolePermissions).values({
        roleId: 3,
        permission: Permission.MANAGE_SETTINGS,
        createdAt: Date.now()
      });
      const before = await getUserRoleIds(target);
      const { caller } = await initTest(2);
      await expect(
        caller.users.addRole({ userId: target, roleId: 3 })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await getUserRoleIds(target)).toEqual(before);
    });
  }
  test('user manager can assign subset role regardless of display weight', async () => {
    await grant(Permission.MANAGE_USERS);
    await tdb.update(roles).set({ weight: 0 }).where(eq(roles.id, 3));
    const { caller } = await initTest(2);
    await caller.users.addRole({ userId: 3, roleId: 3 });
    expect(await getUserRoleIds(3)).toContain(3);
  });
  test('nonowner cannot assign or remove owner role', async () => {
    await grant(Permission.MANAGE_USERS);
    const { caller } = await initTest(2);
    await expect(
      caller.users.addRole({ userId: 3, roleId: 1 })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller.users.removeRole({ userId: 1, roleId: 1 })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  test('implied-all owner may create edit assign and remove roles', async () => {
    await tdb.delete(rolePermissions).where(eq(rolePermissions.roleId, 1));
    const { caller } = await initTest();
    const id = await caller.roles.add();
    await caller.roles.update(update(id, Object.values(Permission)));
    await caller.users.addRole({ userId: 3, roleId: id });
    await caller.users.removeRole({ userId: 3, roleId: id });
    await caller.users.addRole({ userId: 3, roleId: 1 });
    expect((await getRole(1))?.permissions).toEqual(Object.values(Permission));
  });
  test('role manager cannot grant unowned permissions through default-role selection', async () => {
    await grant(Permission.MANAGE_ROLES);
    await tdb.insert(rolePermissions).values({
      roleId: 3,
      permission: Permission.MANAGE_SETTINGS,
      createdAt: Date.now()
    });
    const { caller } = await initTest(2);
    await expect(caller.roles.setDefault({ roleId: 3 })).rejects.toMatchObject({
      code: 'FORBIDDEN'
    });
    expect((await getRole(2))?.isDefault).toBe(true);
  });
  test('role manager may select subset default role', async () => {
    await grant(Permission.MANAGE_ROLES);
    const { caller } = await initTest(2);
    await caller.roles.setDefault({ roleId: 3 });
    expect((await getRole(3))?.isDefault).toBe(true);
  });
});
