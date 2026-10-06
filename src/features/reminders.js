import { formatDuration } from '../util/duration.js';

export const MAX_PER_USER = 25;

export function createReminder(db, { userId, channelId, guildId, message, dueAt }) {
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM reminders WHERE user_id = ?')
    .get(userId).n;
  if (count >= MAX_PER_USER) return null;

  const result = db
    .prepare(
      `INSERT INTO reminders (user_id, channel_id, guild_id, message, due_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, channelId, guildId ?? null, message, dueAt, Date.now());

  return result.lastInsertRowid;
}

export function listReminders(db, userId) {
  return db
    .prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY due_at')
    .all(userId);
}

export function cancelReminder(db, userId, id) {
  return (
    db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(id, userId)
      .changes > 0
  );
}

/**
 * Everything already due. Reminders that came due while the bot was offline are
 * included, because the query is "due_at <= now" rather than a timer.
 */
export function dueReminders(db, now = Date.now()) {
  return db.prepare('SELECT * FROM reminders WHERE due_at <= ? ORDER BY due_at').all(now);
}

export function deleteReminder(db, id) {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
}

export function formatReminderLine(reminder, now = Date.now()) {
  const left = reminder.due_at - now;
  const when = left > 0 ? `in ${formatDuration(left)}` : 'due now';
  return `\`${reminder.id}\` ${when} - ${reminder.message}`;
}

/**
 * Poll for due reminders and deliver them. Returns a stop function. The sender
 * is injected so the loop can be tested without a Discord client.
 */
export function startReminderLoop({ db, logger, send, intervalMs = 30000 }) {
  const tick = async () => {
    for (const reminder of dueReminders(db)) {
      try {
        await send(reminder);
      } catch (error) {
        logger?.warn({ err: error, id: reminder.id }, 'could not deliver reminder');
      }
      deleteReminder(db, reminder.id);
    }
  };

  const timer = setInterval(() => {
    tick().catch((error) => logger?.error({ err: error }, 'reminder loop failed'));
  }, intervalMs);
  timer.unref?.();

  tick().catch((error) => logger?.error({ err: error }, 'reminder catch-up failed'));

  return () => clearInterval(timer);
}
