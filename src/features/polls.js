export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;
export const MAX_ANSWER_LENGTH = 55;
export const MIN_HOURS = 1;
export const MAX_HOURS = 168;

/**
 * Split "a | b | c" into poll answers, or explain what is wrong with it.
 * Returns { options } or { error }.
 */
export function parsePollOptions(input) {
  const options = String(input)
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  if (options.length < MIN_OPTIONS) {
    return { error: `Give at least ${MIN_OPTIONS} options, separated by \`|\`.` };
  }
  if (options.length > MAX_OPTIONS) {
    return { error: `Discord polls allow at most ${MAX_OPTIONS} options.` };
  }

  const tooLong = options.find((option) => option.length > MAX_ANSWER_LENGTH);
  if (tooLong) {
    return {
      error: `"${tooLong.slice(0, 30)}..." is too long; keep each option under ${MAX_ANSWER_LENGTH} characters.`,
    };
  }

  const seen = new Set();
  for (const option of options) {
    const key = option.toLowerCase();
    if (seen.has(key)) return { error: `"${option}" appears twice.` };
    seen.add(key);
  }

  return { options };
}

export function buildPoll({ question, options, hours, multi }) {
  return {
    question: { text: question },
    answers: options.map((text) => ({ text })),
    duration: hours,
    allowMultiselect: Boolean(multi),
  };
}
