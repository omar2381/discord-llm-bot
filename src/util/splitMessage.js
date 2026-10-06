export const DISCORD_LIMIT = 2000;

/**
 * Split text into chunks Discord will accept, preferring to break at blank
 * lines, then line breaks, then spaces, and only cutting mid-word when a single
 * run of characters is longer than the limit on its own.
 */
export function splitMessage(text, limit = DISCORD_LIMIT) {
  const input = String(text ?? '').trim();
  if (!input) return [];
  if (input.length <= limit) return [input];

  const chunks = [];
  let rest = input;

  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = -1;

    for (const separator of ['\n\n', '\n', ' ']) {
      cut = window.lastIndexOf(separator);
      if (cut > limit * 0.3) {
        cut += separator.length;
        break;
      }
      cut = -1;
    }

    if (cut === -1) cut = limit;

    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}
