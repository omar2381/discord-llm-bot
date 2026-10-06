// Zero-width and invisible characters people paste in to break up a word.
const ZERO_WIDTH = new RegExp('[\\u200B-\\u200D\\uFEFF\\u2060]', 'g');

/**
 * Normalise a message before matching banned words: strip the zero-width
 * characters people paste in to break up a word, collapse every run of the
 * same character to one, and fold to lower case.
 *
 * Collapsing runs completely ("spaaaam" -> "spam", but also "book" -> "bok")
 * is applied to the banned words as well, so both sides agree. That is what
 * makes stretched spellings match. It does mean a word whose only difference
 * from a banned one is a doubled letter will also match, which is the right
 * trade for a filter a server owner curates by hand.
 */
export function normalise(content) {
  return String(content)
    .replace(ZERO_WIDTH, '')
    .toLowerCase()
    .replace(/(.)\1+/g, '$1');
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the first banned word present as a whole word. Whole-word matching
 * matters: a substring match would catch "class" for "ass" and "Scunthorpe"
 * for far worse.
 */
export function findBannedWord(content, words) {
  const text = normalise(content);
  for (const word of words) {
    const normalised = normalise(word);
    if (!normalised) continue;
    const pattern = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapeRegex(normalised)}(?:[^\\p{L}\\p{N}]|$)`,
      'u',
    );
    if (pattern.test(text)) return word;
  }
  return null;
}

/**
 * Sliding-window spam detection. Two rules: too many messages at once, or the
 * same message repeated. The clock is injectable so tests do not sleep.
 */
export class SpamTracker {
  #now;
  #burstCount;
  #burstMs;
  #repeatCount;
  #repeatMs;
  #history = new Map();

  constructor({
    now = () => Date.now(),
    burstCount = 5,
    burstMs = 5000,
    repeatCount = 3,
    repeatMs = 10000,
  } = {}) {
    this.#now = now;
    this.#burstCount = burstCount;
    this.#burstMs = burstMs;
    this.#repeatCount = repeatCount;
    this.#repeatMs = repeatMs;
  }

  /** Record a message. Returns 'burst', 'repeat' or null. */
  check(key, content) {
    const now = this.#now();
    const window = Math.max(this.#burstMs, this.#repeatMs);
    const entries = (this.#history.get(key) ?? []).filter(
      (entry) => now - entry.at <= window,
    );

    entries.push({ at: now, content: normalise(content) });
    this.#history.set(key, entries);

    const recent = entries.filter((entry) => now - entry.at <= this.#burstMs);
    if (recent.length > this.#burstCount) return 'burst';

    const last = entries[entries.length - 1].content;
    const repeats = entries.filter(
      (entry) => entry.content === last && now - entry.at <= this.#repeatMs,
    );
    if (repeats.length >= this.#repeatCount) return 'repeat';

    return null;
  }

  /** Drop history for keys nobody has touched recently, so the map cannot grow forever. */
  sweep() {
    const now = this.#now();
    const window = Math.max(this.#burstMs, this.#repeatMs);
    for (const [key, entries] of this.#history) {
      if (entries.every((entry) => now - entry.at > window)) this.#history.delete(key);
    }
  }
}
