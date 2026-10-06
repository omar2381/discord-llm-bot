import test from 'node:test';
import assert from 'node:assert/strict';
import {
  botCanManageRole,
  canModerate,
  isDangerousRole,
} from '../../src/features/permissions.js';

const member = (id, position, permissions = []) => ({
  id,
  roles: { highest: { position } },
  permissions: { has: (flag) => permissions.includes(flag) },
});

const me = member('bot', 50);
const owner = 'owner';

test('a moderator above the target may act', () => {
  const result = canModerate({
    actor: member('mod', 20, ['kick']),
    target: member('victim', 10),
    me,
    permission: 'kick',
    guildOwnerId: owner,
  });
  assert.deepEqual(result, { ok: true });
});

test('without the permission, nothing happens', () => {
  const result = canModerate({
    actor: member('plain', 20, []),
    target: member('victim', 10),
    me,
    permission: 'kick',
    guildOwnerId: owner,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /do not have permission/);
});

test('you cannot act on someone at or above your own level', () => {
  for (const position of [20, 30]) {
    const result = canModerate({
      actor: member('mod', 20, ['kick']),
      target: member('peer', position),
      me,
      permission: 'kick',
      guildOwnerId: owner,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /as high as yours/);
  }
});

test('the bot must outrank the target too', () => {
  const result = canModerate({
    actor: member('mod', 90, ['kick']),
    target: member('high', 80),
    me,
    permission: 'kick',
    guildOwnerId: owner,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /above me/);
});

test('self, the bot, the owner and a missing member are all refused', () => {
  const actor = member('mod', 40, ['kick']);
  const base = { actor, me, permission: 'kick', guildOwnerId: owner };

  assert.match(canModerate({ ...base, target: actor }).reason, /yourself/);
  assert.match(canModerate({ ...base, target: member('bot', 10) }).reason, /myself/);
  assert.match(
    canModerate({ ...base, target: member(owner, 10) }).reason,
    /server owner/,
  );
  assert.match(canModerate({ ...base, target: null }).reason, /cannot find/);
});

test('the guild owner skips the role comparison but the bot still cannot be outranked', () => {
  assert.equal(
    canModerate({
      actor: member(owner, 1, ['kick']),
      target: member('victim', 30),
      me,
      permission: 'kick',
      guildOwnerId: owner,
    }).ok,
    true,
  );

  assert.equal(
    canModerate({
      actor: member(owner, 1, ['kick']),
      target: member('aboveBot', 60),
      me,
      permission: 'kick',
      guildOwnerId: owner,
    }).ok,
    false,
  );
});

const role = (position, permissions = [], managed = false) => ({
  position,
  managed,
  permissions: { has: (flag) => permissions.includes(flag) },
});

test('roles carrying power, and integration roles, are refused', () => {
  assert.equal(isDangerousRole(role(1, ['Administrator'])), true);
  assert.equal(isDangerousRole(role(1, ['ManageRoles'])), true);
  assert.equal(isDangerousRole(role(1, ['BanMembers'])), true);
  assert.equal(isDangerousRole(role(1, [], true)), true);
  assert.equal(isDangerousRole(role(1, ['AddReactions'])), false);
});

test('the bot can only manage roles below its own, and needs the permission', () => {
  const withPerm = {
    id: 'bot',
    roles: { highest: { position: 50 } },
    permissions: { has: () => true },
  };
  const without = {
    id: 'bot',
    roles: { highest: { position: 50 } },
    permissions: { has: () => false },
  };

  assert.equal(botCanManageRole({ me: withPerm, role: role(10) }).ok, true);
  assert.match(botCanManageRole({ me: withPerm, role: role(60) }).reason, /above mine/);
  assert.match(
    botCanManageRole({ me: withPerm, role: role(10, [], true) }).reason,
    /integration/,
  );
  assert.match(botCanManageRole({ me: without, role: role(10) }).reason, /Manage Roles/);
});
