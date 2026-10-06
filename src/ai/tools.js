import { PermissionFlagsBits } from 'discord.js';
import { z } from 'zod';
import {
  canModerate,
  botCanManageRole,
  isDangerousRole,
} from '../features/permissions.js';
import { createReminder } from '../features/reminders.js';
import { parseDuration, MAX_DURATION_MS, MIN_DURATION_MS } from '../util/duration.js';
import { buildPoll, parsePollOptions } from '../features/polls.js';
import { forgetFacts, recallFacts, rememberFact } from './memory.js';

/**
 * Tools the model may call.
 *
 * The security rule: the model never decides who is acting. `ctx.member` is the
 * person who addressed the bot, and every permission check runs against them,
 * so a prompt-injected instruction from someone else's message cannot borrow a
 * moderator's authority. Destructive tools do not act at all; they return a
 * pending confirmation for the asker to click.
 */

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a user or role id');

function jsonSchemaFor(name, description, properties, required = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required },
    },
  };
}

export const TOOLS = [
  {
    name: 'remember_fact',
    description:
      'Remember a short fact about the person you are talking to, so you can use it in later conversations.',
    schema: z.object({ fact: z.string().min(1).max(200) }),
    jsonSchema: jsonSchemaFor(
      'remember_fact',
      'Remember a short fact about the person you are talking to.',
      { fact: { type: 'string', description: 'The fact, under 200 characters' } },
      ['fact'],
    ),
    destructive: false,
    execute({ fact }, ctx) {
      const result = rememberFact(ctx.db, {
        guildId: ctx.guildId,
        userId: ctx.member.id,
        fact,
      });
      return result.ok ? { status: 'remembered', fact } : { error: result.reason };
    },
  },

  {
    name: 'forget_fact',
    description: 'Forget facts about the person you are talking to that match some text.',
    schema: z.object({ query: z.string().min(1).max(200) }),
    jsonSchema: jsonSchemaFor(
      'forget_fact',
      'Forget remembered facts matching some text.',
      { query: { type: 'string', description: 'Text to match against stored facts' } },
      ['query'],
    ),
    destructive: false,
    execute({ query }, ctx) {
      const removed = forgetFacts(ctx.db, {
        guildId: ctx.guildId,
        userId: ctx.member.id,
        query,
      });
      return { status: 'forgotten', count: removed };
    },
  },

  {
    name: 'list_facts',
    description: 'List what you remember about the person you are talking to.',
    schema: z.object({}),
    jsonSchema: jsonSchemaFor('list_facts', 'List remembered facts.', {}),
    destructive: false,
    execute(_args, ctx) {
      const facts = recallFacts(ctx.db, { guildId: ctx.guildId, userId: ctx.member.id });
      return { facts: facts.map((row) => row.fact) };
    },
  },

  {
    name: 'set_reminder',
    description: 'Remind the person later, in this channel.',
    schema: z.object({
      in: z.string().min(1).max(40),
      message: z.string().min(1).max(500),
    }),
    jsonSchema: jsonSchemaFor(
      'set_reminder',
      'Set a reminder for the person you are talking to.',
      {
        in: { type: 'string', description: 'How long from now, e.g. 10m, 2h30m, 1d' },
        message: { type: 'string', description: 'What to remind them about' },
      },
      ['in', 'message'],
    ),
    destructive: false,
    execute(args, ctx) {
      const ms = parseDuration(args.in);
      if (ms === null) return { error: `I cannot read the duration "${args.in}".` };
      if (ms < MIN_DURATION_MS) return { error: 'The shortest reminder is one minute.' };
      if (ms > MAX_DURATION_MS) return { error: 'The longest reminder is a year.' };

      const id = createReminder(ctx.db, {
        userId: ctx.member.id,
        channelId: ctx.channelId,
        guildId: ctx.guildId,
        message: args.message,
        dueAt: Date.now() + ms,
      });
      if (id === null) return { error: 'They already have too many reminders pending.' };
      return { status: 'reminder_set', id, in: args.in };
    },
  },

  {
    name: 'create_poll',
    description: 'Post a poll in this channel.',
    schema: z.object({
      question: z.string().min(1).max(300),
      options: z.array(z.string().min(1)).min(2).max(10),
      hours: z.number().int().min(1).max(168).optional(),
    }),
    jsonSchema: jsonSchemaFor(
      'create_poll',
      'Post a poll in this channel.',
      {
        question: { type: 'string' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '2 to 10 answers',
        },
        hours: { type: 'integer', description: 'How long it runs, 1 to 168' },
      },
      ['question', 'options'],
    ),
    requiredPermission: PermissionFlagsBits.SendPolls,
    destructive: false,
    async execute(args, ctx) {
      const { options, error } = parsePollOptions(args.options.join(' | '));
      if (error) return { error };

      await ctx.channel.send({
        poll: buildPoll({
          question: args.question,
          options,
          hours: args.hours ?? 24,
          multi: false,
        }),
      });
      return { status: 'poll_posted', question: args.question };
    },
  },

  {
    name: 'get_server_info',
    description: 'Facts about this server: name, member count, when it was created.',
    schema: z.object({}),
    jsonSchema: jsonSchemaFor('get_server_info', 'Facts about this server.', {}),
    destructive: false,
    execute(_args, ctx) {
      const guild = ctx.guild;
      return {
        name: guild.name,
        members: guild.memberCount,
        channels: guild.channels.cache.size,
        roles: guild.roles.cache.size,
        created: guild.createdAt.toISOString().slice(0, 10),
      };
    },
  },

  {
    name: 'get_user_info',
    description: 'Public facts about a member of this server.',
    schema: z.object({ user_id: snowflake }),
    jsonSchema: jsonSchemaFor(
      'get_user_info',
      'Public facts about a member.',
      { user_id: { type: 'string', description: "The member's user id" } },
      ['user_id'],
    ),
    destructive: false,
    async execute({ user_id: userId }, ctx) {
      const member = await ctx.guild.members.fetch(userId).catch(() => null);
      if (!member) return { error: 'No such member in this server.' };
      return {
        id: member.id,
        displayName: member.displayName,
        joined: member.joinedAt?.toISOString().slice(0, 10) ?? null,
        roles: member.roles.cache
          .filter((role) => role.id !== ctx.guild.id)
          .map((role) => role.name),
        isBot: member.user.bot,
      };
    },
  },

  {
    name: 'timeout_member',
    description: 'Stop a member talking for a number of minutes. Needs confirmation.',
    schema: z.object({
      user_id: snowflake,
      minutes: z.number().int().min(1).max(40320),
      reason: z.string().max(400).optional(),
    }),
    jsonSchema: jsonSchemaFor(
      'timeout_member',
      'Time a member out for some minutes.',
      {
        user_id: { type: 'string' },
        minutes: { type: 'integer', description: '1 to 40320 (28 days)' },
        reason: { type: 'string' },
      },
      ['user_id', 'minutes'],
    ),
    requiredPermission: PermissionFlagsBits.ModerateMembers,
    destructive: true,
    async describe(args, ctx) {
      const member = await ctx.guild.members.fetch(args.user_id).catch(() => null);
      return `time out ${member ? `**${member.displayName}**` : args.user_id} for ${args.minutes} minute(s)${args.reason ? ` (${args.reason})` : ''}`;
    },
    async execute(args, ctx) {
      const target = await ctx.guild.members.fetch(args.user_id).catch(() => null);
      const check = canModerate({
        actor: ctx.member,
        target,
        me: ctx.guild.members.me,
        permission: PermissionFlagsBits.ModerateMembers,
        guildOwnerId: ctx.guild.ownerId,
      });
      if (!check.ok) return { error: check.reason };

      await target.timeout(
        args.minutes * 60000,
        `${ctx.member.user.tag} via AI: ${args.reason ?? 'no reason'}`,
      );
      return { status: 'timed_out', user_id: args.user_id, minutes: args.minutes };
    },
  },

  {
    name: 'delete_messages',
    description: 'Delete the most recent messages in this channel. Needs confirmation.',
    schema: z.object({
      count: z.number().int().min(1).max(100),
      user_id: snowflake.optional(),
    }),
    jsonSchema: jsonSchemaFor(
      'delete_messages',
      'Delete recent messages in this channel.',
      {
        count: { type: 'integer', description: '1 to 100' },
        user_id: { type: 'string', description: 'Only delete this member’s messages' },
      },
      ['count'],
    ),
    requiredPermission: PermissionFlagsBits.ManageMessages,
    destructive: true,
    describe(args) {
      return `delete ${args.count} message(s)${args.user_id ? ` from <@${args.user_id}>` : ''}`;
    },
    async execute(args, ctx) {
      const fetched = await ctx.channel.messages.fetch({ limit: args.count });
      const candidates = args.user_id
        ? fetched.filter((message) => message.author.id === args.user_id)
        : fetched;
      const deleted = await ctx.channel.bulkDelete(candidates, true);
      return { status: 'deleted', count: deleted.size };
    },
  },

  {
    name: 'add_role',
    description: 'Give a member a role. Needs confirmation.',
    schema: z.object({ user_id: snowflake, role_id: snowflake }),
    jsonSchema: jsonSchemaFor(
      'add_role',
      'Give a member a role.',
      { user_id: { type: 'string' }, role_id: { type: 'string' } },
      ['user_id', 'role_id'],
    ),
    requiredPermission: PermissionFlagsBits.ManageRoles,
    destructive: true,
    describe(args, ctx) {
      const role = ctx.guild.roles.cache.get(args.role_id);
      return `give <@${args.user_id}> the role **${role?.name ?? args.role_id}**`;
    },
    execute(args, ctx) {
      return changeRole(args, ctx, 'add');
    },
  },

  {
    name: 'remove_role',
    description: 'Take a role away from a member. Needs confirmation.',
    schema: z.object({ user_id: snowflake, role_id: snowflake }),
    jsonSchema: jsonSchemaFor(
      'remove_role',
      'Take a role away from a member.',
      { user_id: { type: 'string' }, role_id: { type: 'string' } },
      ['user_id', 'role_id'],
    ),
    requiredPermission: PermissionFlagsBits.ManageRoles,
    destructive: true,
    describe(args, ctx) {
      const role = ctx.guild.roles.cache.get(args.role_id);
      return `take **${role?.name ?? args.role_id}** away from <@${args.user_id}>`;
    },
    execute(args, ctx) {
      return changeRole(args, ctx, 'remove');
    },
  },
];

async function changeRole({ user_id: userId, role_id: roleId }, ctx, action) {
  const role = ctx.guild.roles.cache.get(roleId);
  if (!role) return { error: 'No such role.' };
  if (isDangerousRole(role)) {
    return { error: 'That role carries permissions I will not hand out.' };
  }
  const manageable = botCanManageRole({ me: ctx.guild.members.me, role });
  if (!manageable.ok) return { error: manageable.reason };

  const member = await ctx.guild.members.fetch(userId).catch(() => null);
  if (!member) return { error: 'No such member.' };

  await member.roles[action](role, `${ctx.member.user.tag} via AI`);
  return { status: action === 'add' ? 'role_added' : 'role_removed', role: role.name };
}

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function toolSchemas() {
  return TOOLS.map((tool) => tool.jsonSchema);
}

/**
 * Does the member who addressed the bot hold the permission this tool needs,
 * in this channel? Checked before the tool runs and again before a confirmed
 * destructive action, since permissions can change in between.
 */
export function memberMayUse(tool, { member, channel }) {
  if (!tool.requiredPermission) return true;
  const permissions = channel?.permissionsFor?.(member) ?? member.permissions;
  return permissions.has(tool.requiredPermission);
}
