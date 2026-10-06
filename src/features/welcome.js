export const DEFAULT_WELCOME =
  'Welcome {user} to {server}. You are member {memberCount}.';

/**
 * Fill {user}, {username}, {server} and {memberCount} in a welcome template.
 * Unknown placeholders are left alone so a typo is visible rather than silently
 * becoming an empty string.
 */
export function renderWelcome(template, { userId, username, serverName, memberCount }) {
  return String(template ?? DEFAULT_WELCOME)
    .replaceAll('{user}', `<@${userId}>`)
    .replaceAll('{username}', username)
    .replaceAll('{server}', serverName)
    .replaceAll('{memberCount}', String(memberCount));
}

export const MAX_MENU_ROLES = 25;
const BUTTONS_PER_ROW = 5;

/** Discord allows five buttons per row and five rows, so chunk accordingly. */
export function chunkButtons(items, perRow = BUTTONS_PER_ROW) {
  const rows = [];
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }
  return rows;
}
