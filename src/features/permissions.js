/**
 * Runtime permission checks for moderation.
 *
 * setDefaultMemberPermissions already hides a command from members who may not
 * use it, but that is a client-side convenience: it can be overridden per
 * channel, and the AI tools in phase 5 reach the same actions without going
 * through a slash command at all. So every action re-checks here.
 *
 * Written against plain shapes rather than discord.js classes so it can be
 * tested with objects.
 */

/**
 * Can `actor` moderate `target`, with `me` (the bot) carrying it out?
 * Returns { ok: true } or { ok: false, reason } with a message fit to show.
 */
export function canModerate({ actor, target, me, permission, guildOwnerId }) {
  if (!target) return { ok: false, reason: 'I cannot find that member.' };
  if (target.id === actor.id)
    return { ok: false, reason: 'You cannot do that to yourself.' };
  if (target.id === me.id) return { ok: false, reason: 'I will not do that to myself.' };
  if (target.id === guildOwnerId) {
    return { ok: false, reason: 'That is the server owner.' };
  }

  if (permission && !actor.permissions.has(permission)) {
    return { ok: false, reason: 'You do not have permission to do that.' };
  }

  // The owner outranks everyone, so skip the role comparison for them only.
  if (actor.id !== guildOwnerId && !isAbove(actor, target)) {
    return { ok: false, reason: 'That member has a role as high as yours.' };
  }
  if (!isAbove(me, target)) {
    return {
      ok: false,
      reason: 'That member is above me in the role list, so I cannot act on them.',
    };
  }

  return { ok: true };
}

/** Is `a` strictly higher in the role list than `b`? */
export function isAbove(a, b) {
  return a.roles.highest.position > b.roles.highest.position;
}

const DANGEROUS = [
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'ManageWebhooks',
  'BanMembers',
  'KickMembers',
  'ModerateMembers',
  'MentionEveryone',
];

/**
 * A role the bot should refuse to hand out from a menu or an AI tool, because
 * giving it away would let someone escalate past the person who set it up.
 */
export function isDangerousRole(role) {
  if (role.managed) return true;
  return DANGEROUS.some((flag) => role.permissions.has(flag));
}

/** Can the bot add or remove this role at all? */
export function botCanManageRole({ me, role }) {
  if (!me.permissions.has('ManageRoles')) {
    return { ok: false, reason: 'I do not have Manage Roles.' };
  }
  if (role.managed) {
    return { ok: false, reason: 'That role is managed by an integration.' };
  }
  if (me.roles.highest.position <= role.position) {
    return { ok: false, reason: 'That role is above mine, so I cannot assign it.' };
  }
  return { ok: true };
}
