const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const PART = /(\d+)\s*([smhd])/gi;

export const MIN_DURATION_MS = 60 * 1000;
export const MAX_DURATION_MS = 365 * 86400000;

/**
 * Parse "30s", "10m", "2h30m", "1d" into milliseconds. Returns null when the
 * input does not parse at all; range checking is the caller's job so it can
 * explain which limit was hit.
 */
export function parseDuration(input) {
  const text = String(input).trim().toLowerCase();
  if (!text) return null;

  let total = 0;
  let matched = 0;
  let consumed = 0;

  PART.lastIndex = 0;
  for (const match of text.matchAll(PART)) {
    total += Number(match[1]) * UNITS[match[2]];
    matched++;
    consumed += match[0].length;
  }

  if (!matched) return null;
  // Reject trailing or interleaved junk such as "10m please" or "1h2x".
  if (consumed !== text.replace(/\s+/g, '').length) return null;
  if (!Number.isFinite(total) || total <= 0) return null;

  return total;
}

/** Render milliseconds back as "2h 30m", for confirmations and listings. */
export function formatDuration(ms) {
  if (ms < 1000) return '0s';
  const parts = [];
  let left = Math.floor(ms / 1000);

  const days = Math.floor(left / 86400);
  if (days) parts.push(`${days}d`);
  left -= days * 86400;

  const hours = Math.floor(left / 3600);
  if (hours) parts.push(`${hours}h`);
  left -= hours * 3600;

  const minutes = Math.floor(left / 60);
  if (minutes) parts.push(`${minutes}m`);
  left -= minutes * 60;

  if (left) parts.push(`${left}s`);
  return parts.join(' ');
}
