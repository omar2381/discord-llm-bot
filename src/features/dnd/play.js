import { OllamaBusyError } from '../../ai/ollama.js';
import { playTurn, summariseCampaign } from '../../ai/dm/index.js';
import { getCampaign, needsSummary } from './campaigns.js';
import { partyFor } from './characters.js';
import { splitMessage } from '../../util/splitMessage.js';

/**
 * One dungeon-master turn, from a player's action to messages on screen.
 *
 * Shared by /begin and by plain talking in the thread, so both behave the same.
 * Turns are serialised per campaign: two people typing at once would otherwise
 * run two generations against the same state and the second would overwrite the
 * first's hit points.
 */
const inFlight = new Set();

export function isBusy(campaignId) {
  return inFlight.has(campaignId);
}

export async function takeTurn({ ctx, campaign, action, actor }) {
  if (!ctx.ai.enabled) {
    return { refused: 'The dungeon master needs the AI, which is not configured.' };
  }
  if (campaign.status !== 'active') {
    return {
      refused:
        campaign.status === 'paused'
          ? 'The campaign is paused. `/campaign resume` to carry on.'
          : 'This campaign has ended.',
    };
  }
  if (!partyFor(ctx.db, campaign.id).length) {
    return { refused: 'Nobody has a character yet. `/character create` first.' };
  }
  if (inFlight.has(campaign.id)) {
    return { refused: 'One at a time - I am still writing the last bit.' };
  }

  inFlight.add(campaign.id);
  try {
    const result = await playTurn({
      ollama: ctx.ai.ollama,
      db: ctx.db,
      campaign,
      action,
      actor,
    });

    // Compress the log occasionally so the prompt stays a constant size.
    const after = getCampaign(ctx.db, campaign.id);
    if (after && needsSummary(after)) {
      summariseCampaign({ ollama: ctx.ai.ollama, db: ctx.db, campaign: after }).catch(
        (error) => ctx.logger.warn({ err: error }, 'campaign summary failed'),
      );
    }

    return { ...result, chunks: splitMessage(result.narration) };
  } catch (error) {
    if (error instanceof OllamaBusyError) {
      return { refused: 'I am busy. Give me a moment and say it again.' };
    }
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return { refused: 'That took too long. Try saying it more plainly.' };
    }
    ctx.logger.error({ err: error, campaign: campaign.id }, 'dungeon master failed');
    return { refused: 'The dungeon master has lost their notes. Try again.' };
  } finally {
    inFlight.delete(campaign.id);
  }
}

/** Dice and consequences, shown under the narration so nothing is hidden. */
export function footerFor({ rolls, events }) {
  const lines = [...rolls, ...events];
  if (!lines.length) return null;
  return lines.map((line) => `-# ${line}`).join('\n');
}
