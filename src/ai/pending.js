import { randomUUID } from 'node:crypto';

export const PENDING_TTL_MS = 2 * 60 * 1000;

/**
 * Destructive tool calls waiting for the asker to press Confirm. In memory on
 * purpose: a confirmation that survives a restart is a confirmation nobody
 * remembers agreeing to.
 */
export class PendingActions {
  #now;
  #ttl;
  #items = new Map();

  constructor({ now = () => Date.now(), ttlMs = PENDING_TTL_MS } = {}) {
    this.#now = now;
    this.#ttl = ttlMs;
  }

  add({ requesterId, toolName, args, description }) {
    const id = randomUUID();
    this.#items.set(id, {
      id,
      requesterId,
      toolName,
      args,
      description,
      expiresAt: this.#now() + this.#ttl,
    });
    return id;
  }

  /** Take an action if it exists, has not expired, and belongs to this user. */
  claim(id, userId) {
    const item = this.#items.get(id);
    if (!item) return { error: 'expired' };
    if (this.#now() > item.expiresAt) {
      this.#items.delete(id);
      return { error: 'expired' };
    }
    if (item.requesterId !== userId) return { error: 'not_yours' };
    this.#items.delete(id);
    return { action: item };
  }

  cancel(id, userId) {
    const item = this.#items.get(id);
    if (!item) return { error: 'expired' };
    if (item.requesterId !== userId) return { error: 'not_yours' };
    this.#items.delete(id);
    return { action: item };
  }

  sweep() {
    const now = this.#now();
    for (const [id, item] of this.#items) {
      if (now > item.expiresAt) this.#items.delete(id);
    }
  }

  get size() {
    return this.#items.size;
  }
}
