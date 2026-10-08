import { DM_TOOLS_BY_NAME, dmToolSchemas } from './tools.js';
import { OPENING_PROMPT, SUMMARY_PROMPT, dmSystemPrompt } from './prompt.js';
import {
  addLog,
  buildContext,
  logAsMessages,
  needsSummary,
  recentLog,
  setSummary,
} from '../../features/dnd/campaigns.js';
import { partyFor } from '../../features/dnd/characters.js';

export const DM_MAX_ITERATIONS = 6;

/** The bot's own d20. The model is never allowed to produce this number. */
export function makeD20(random = Math.random) {
  return () => Math.floor(random() * 20) + 1;
}

/**
 * Play one turn.
 *
 * `action` is what a player just did, or null to open the scene. Returns the
 * narration plus the dice rolled and the things that changed, so the caller can
 * show them separately from the prose. Rolls are shown because a dungeon master
 * who rolls in secret is not trusted, and here the rolling is the part the model
 * cannot fake.
 */
export async function playTurn({
  ollama,
  db,
  campaign,
  action = null,
  actor = null,
  random = Math.random,
}) {
  const party = partyFor(db, campaign.id);

  if (action) {
    addLog(db, campaign.id, {
      kind: 'action',
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      content: action,
    });
  }

  const toolCtx = {
    db,
    campaign,
    party,
    roll20: makeD20(random),
    rolls: [],
    events: [],
  };

  const messages = [
    {
      role: 'system',
      content: dmSystemPrompt({
        context: buildContext(db, campaign),
        playerNames: party.map((character) => character.name),
      }),
    },
    ...logAsMessages(recentLog(db, campaign.id)),
    {
      role: 'user',
      content: action ? `${actor?.name ?? 'A player'}: ${action}` : OPENING_PROMPT,
    },
  ];

  let narration = '';

  for (let iteration = 0; iteration < DM_MAX_ITERATIONS; iteration++) {
    const reply = await ollama.chat({ messages, tools: dmToolSchemas() });

    if (!reply.toolCalls.length) {
      narration = reply.content.trim();
      break;
    }

    messages.push({
      role: 'assistant',
      content: reply.content,
      tool_calls: reply.toolCalls.map((call) => ({
        function: { name: call.name, arguments: call.arguments },
      })),
    });

    for (const call of reply.toolCalls) {
      messages.push({
        role: 'tool',
        content: JSON.stringify(runDmTool(call, toolCtx)),
      });
    }

    // Keep whatever prose came alongside the tool calls, in case the model
    // stops calling tools without producing anything further.
    if (reply.content.trim()) narration = reply.content.trim();
  }

  if (!narration) {
    narration = toolCtx.events.length
      ? toolCtx.events.join(' ')
      : 'The dungeon master pauses, losing the thread. Try saying what you do more plainly.';
  }

  addLog(db, campaign.id, { kind: 'narration', content: narration });

  return { narration, rolls: toolCtx.rolls, events: toolCtx.events };
}

function runDmTool(call, ctx) {
  const tool = DM_TOOLS_BY_NAME.get(call.name);
  if (!tool) return { error: `There is no tool called ${call.name}.` };

  const parsed = tool.schema.safeParse(call.arguments);
  if (!parsed.success) {
    return {
      error: 'Those arguments are not valid.',
      details: parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    };
  }

  try {
    return tool.execute(parsed.data, ctx);
  } catch (error) {
    return { error: `That did not work: ${error.message}` };
  }
}

/**
 * Fold the recent log into the campaign summary, so the prompt stays a constant
 * size however long the campaign runs. Without this a long game eventually
 * overflows the context window and the dungeon master forgets the first act.
 */
export async function summariseCampaign({ ollama, db, campaign }) {
  const entries = recentLog(db, campaign.id, 60);
  if (!entries.length) return null;

  const transcript = entries
    .map((entry) => `${entry.actor_name ?? entry.kind}: ${entry.content}`)
    .join('\n');

  const reply = await ollama.chat({
    messages: [
      { role: 'system', content: SUMMARY_PROMPT },
      {
        role: 'user',
        content: [
          campaign.summary ? `Previously: ${campaign.summary}` : null,
          'Then:',
          transcript,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  });

  const summary = reply.content.trim();
  if (summary) setSummary(db, campaign.id, summary);
  return summary;
}

export { needsSummary };
