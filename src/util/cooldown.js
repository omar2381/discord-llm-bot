/**
 * Per-user, per-key cooldowns kept in memory.
 * `now` is injectable so tests don't depend on the real clock.
 */
export class Cooldowns {
  #expiresAt = new Map();
  #now;

  constructor({ now = Date.now } = {}) {
    this.#now = now;
  }

  /**
   * If the user is still cooling down, return the milliseconds remaining.
   * Otherwise start a new cooldown and return 0.
   */
  hit(key, userId, seconds) {
    if (!seconds) return 0;
    const id = `${key}:${userId}`;
    const now = this.#now();
    const expiresAt = this.#expiresAt.get(id) ?? 0;
    if (expiresAt > now) return expiresAt - now;

    this.#expiresAt.set(id, now + seconds * 1000);
    if (this.#expiresAt.size > 10_000) this.#sweep(now);
    return 0;
  }

  #sweep(now) {
    for (const [id, expiresAt] of this.#expiresAt) {
      if (expiresAt <= now) this.#expiresAt.delete(id);
    }
  }
}
