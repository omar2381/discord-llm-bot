import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import {
  askerMayChangeRole,
  memberMayUse,
  modlogActionFor,
  TOOLS_BY_NAME,
} from '../../src/ai/tools.js';
import { confirmationNotice } from '../../src/ai/index.js';

const person = (id, position) => ({ id, roles: { highest: { position } } });

test('the asker cannot hand out a role at or above their own highest', () => {
  const mod = person('mod', 5);
  assert.equal(
    askerMayChangeRole({ actor: mod, target: mod, role: { position: 10 }, ownerId: 'o' })
      .ok,
    false,
  );
  assert.equal(
    askerMayChangeRole({ actor: mod, target: mod, role: { position: 5 }, ownerId: 'o' })
      .ok,
    false,
  );
  assert.equal(
    askerMayChangeRole({ actor: mod, target: mod, role: { position: 4 }, ownerId: 'o' })
      .ok,
    true,
  );
});

test('the asker cannot change the roles of someone who outranks them', () => {
  const mod = person('mod', 5);
  const admin = person('admin', 20);
  const member = person('m', 1);
  assert.equal(
    askerMayChangeRole({ actor: mod, target: admin, role: { position: 2 }, ownerId: 'o' })
      .ok,
    false,
  );
  assert.equal(
    askerMayChangeRole({
      actor: mod,
      target: member,
      role: { position: 2 },
      ownerId: 'o',
    }).ok,
    true,
  );
});

test('the server owner outranks everyone', () => {
  const owner = person('o', 1);
  assert.equal(
    askerMayChangeRole({
      actor: owner,
      target: person('admin', 20),
      role: { position: 15 },
      ownerId: 'o',
    }).ok,
    true,
  );
});

test('role tools read the server-wide permission, not a channel overwrite', () => {
  // A channel overwrite granting "Manage Permissions" sets the ManageRoles bit
  // in that channel only.
  const member = { permissions: { has: () => false } };
  const channel = {
    permissionsFor: () => ({ has: (flag) => flag === PermissionFlagsBits.ManageRoles }),
  };
  assert.equal(memberMayUse(TOOLS_BY_NAME.get('add_role'), { member, channel }), false);
  assert.equal(
    memberMayUse(TOOLS_BY_NAME.get('remove_role'), { member, channel }),
    false,
  );
  // Message tools still follow the channel, where Manage Messages lives.
  const messages = { permissionsFor: () => ({ has: () => true }) };
  assert.equal(
    memberMayUse(TOOLS_BY_NAME.get('delete_messages'), { member, channel: messages }),
    true,
  );
});

test('the bot, not the model, says what each button will do', () => {
  assert.equal(confirmationNotice([]), '');
  const one = confirmationNotice([
    { id: 'a', description: 'delete the last **100** messages here' },
  ]);
  assert.match(one, /^\*\*Waiting for your confirmation\*\*/);
  assert.match(one, /delete the last \*\*100\*\* messages here/);
  const two = confirmationNotice([
    { id: 'a', description: 'give **VIP** to <@1>' },
    { id: 'b', description: 'take **VIP** away from <@2>' },
  ]);
  assert.match(two, /1\. give/);
  assert.match(two, /2\. take/);
});

test('a confirmed AI action is logged under its own heading, never as automod', () => {
  assert.equal(modlogActionFor('timeout_member'), 'timeout');
  assert.equal(modlogActionFor('delete_messages'), 'purge');
  assert.equal(modlogActionFor('add_role'), 'role');
  assert.equal(modlogActionFor('remove_role'), 'role');
  assert.equal(modlogActionFor('unknown_tool'), 'AI action');
  for (const tool of TOOLS_BY_NAME.values()) {
    if (tool.destructive) assert.ok(tool.modlogAction, `${tool.name} has a heading`);
  }
});
