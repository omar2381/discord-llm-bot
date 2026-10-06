/**
 * Per-key rate limiter. The clock is injectable so tests do not have to wait.
 */
export class Cooldown {
  #seconds;
  #now;
  #last = new Map();

  constructor(seconds, now = () => Date.now()) {
    this.#seconds = seconds;
    this.#now = now;
  }

  /**
   * Returns 0 if the key may act now (and records the attempt), otherwise the
   * whole seconds remaining.
   */
  check(key) {
    const now = this.#now();
    const until = this.#last.get(key) ?? 0;
    if (now < until) return Math.ceil((until - now) / 1000);
    this.#last.set(key, now + this.#seconds * 1000);
    return 0;
  }

  clear(key) {
    this.#last.delete(key);
  }
}
