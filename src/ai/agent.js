import { AI_DISABLED_MESSAGE, systemPrompt } from './prompts.js';
import { TOOLS_BY_NAME, memberMayUse, toolSchemas } from './tools.js';
import { recallFacts } from './memory.js';
import { RECALL_LIMIT } from './memory.js';

export const MAX_ITERATIONS = 4;
export const MAX_HISTORY_CHARS = 500;

export { AI_DISABLED_MESSAGE };

/**
 * Run one exchange: build the context, let the model call tools, and return the
 * text to send plus anything needing confirmation.
 *
 * Returns { content, pending: [{ id, description }] }.
 */
export async function runAgent({
  ollama,
  db,
  config,
  pending,
  guild,
  channel,
  member,
  prompt,
  history = [],
  botName,
  now = () => new Date(),
}) {
  const memories = recallFacts(db, {
    guildId: guild.id,
    userId: member.id,
    limit: RECALL_LIMIT,
  });

  const messages = [
    {
      role: 'system',
      content: systemPrompt({
        botName,
        serverName: guild.name,
        speaker: { id: member.id, displayName: member.displayName },
        memories,
        today: now().toISOString().slice(0, 10),
      }),
    },
    ...history.slice(-config.ai.maxHistory).map((entry) => ({
      role: entry.fromBot ? 'assistant' : 'user',
      content: entry.fromBot
        ? entry.content.slice(0, MAX_HISTORY_CHARS)
        : `${entry.authorName}: ${entry.content.slice(0, MAX_HISTORY_CHARS)}`,
    })),
    { role: 'user', content: prompt },
  ];

  const toolCtx = {
    db,
    guild,
    channel,
    member,
    guildId: guild.id,
    channelId: channel.id,
  };
  const confirmations = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const reply = await ollama.chat({ messages, tools: toolSchemas() });

    if (!reply.toolCalls.length) {
      return { content: reply.content, pending: confirmations };
    }

    messages.push({
      role: 'assistant',
      content: reply.content,
      tool_calls: reply.toolCalls.map((call) => ({
        function: { name: call.name, arguments: call.arguments },
      })),
    });

    for (const call of reply.toolCalls) {
      const result = await runToolCall({
        call,
        toolCtx,
        pending,
        confirmations,
        member,
        channel,
      });
      messages.push({ role: 'tool', content: JSON.stringify(result) });
    }
  }

  // The model kept calling tools. Say what was done rather than looping on.
  return {
    content: confirmations.length
      ? 'That needs confirming first.'
      : 'I got stuck working that out. Try asking more simply.',
    pending: confirmations,
  };
}

async function runToolCall({ call, toolCtx, pending, confirmations, member, channel }) {
  const tool = TOOLS_BY_NAME.get(call.name);
  if (!tool) return { error: `There is no tool called ${call.name}.` };

  // The permission belongs to the person who asked, never to the model.
  if (!memberMayUse(tool, { member, channel })) {
    return { error: 'The person asking does not have permission for that.' };
  }

  const parsed = tool.schema.safeParse(call.arguments);
  if (!parsed.success) {
    // Hand the validation error back so the model can correct itself.
    return {
      error: 'Those arguments are not valid.',
      details: parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    };
  }

  if (tool.destructive) {
    const description = await tool.describe?.(parsed.data, toolCtx);
    const id = pending.add({
      requesterId: member.id,
      toolName: tool.name,
      args: parsed.data,
      description: description ?? tool.name,
    });
    confirmations.push({ id, description: description ?? tool.name });
    return { status: 'pending_confirmation', description };
  }

  try {
    return await tool.execute(parsed.data, toolCtx);
  } catch (error) {
    return { error: `That did not work: ${error.message}` };
  }
}

/** Run a destructive tool after the asker pressed Confirm. */
export async function executeConfirmed({ action, toolCtx, member, channel }) {
  const tool = TOOLS_BY_NAME.get(action.toolName);
  if (!tool) return { error: 'That action no longer exists.' };

  // Permissions are re-checked here: they may have changed since the ask.
  if (!memberMayUse(tool, { member, channel })) {
    return { error: 'You no longer have permission for that.' };
  }
  return tool.execute(action.args, toolCtx);
}
