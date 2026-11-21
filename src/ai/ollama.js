/**
 * A small client for Ollama's /api/chat. No SDK: the endpoint is one POST, and
 * a dependency would only hide the two things that actually matter here, which
 * are the timeout and the queue.
 */

export class OllamaBusyError extends Error {
  constructor() {
    super('busy');
    this.name = 'OllamaBusyError';
  }
}

export class OllamaError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'OllamaError';
    this.status = status;
    // Ollama 0.33+ refuses a prompt longer than num_ctx (it used to truncate).
    this.contextTooSmall = /exceeds the available context size/i.test(message);
  }
}

/**
 * The human-readable reason from an Ollama error body. Ollama wraps it as
 * {"error": "..."}, and for some errors (an over-long prompt) that string is
 * itself the JSON of the runner's error, {"error": {"message": "..."}}.
 */
export function ollamaReason(body) {
  let value = String(body ?? '').trim();
  for (let depth = 0; depth < 3; depth++) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      break;
    }
    const inner = parsed?.error?.message ?? parsed?.error ?? parsed?.message;
    if (typeof inner !== 'string') break;
    value = inner.trim();
  }
  return value.slice(0, 300);
}

/**
 * Run tasks one at a time. A CPU-only host thrashes if two generations overlap,
 * so the queue is the difference between slow and unusable. Waiting callers are
 * capped rather than queued forever, so a busy bot says so instead of going
 * quiet for minutes.
 */
export class SerialQueue {
  #running = false;
  #waiting = [];
  #maxWaiting;

  constructor(maxWaiting = 10) {
    this.#maxWaiting = maxWaiting;
  }

  get size() {
    return this.#waiting.length + (this.#running ? 1 : 0);
  }

  run(task) {
    if (this.#waiting.length >= this.#maxWaiting) {
      return Promise.reject(new OllamaBusyError());
    }
    return new Promise((resolve, reject) => {
      this.#waiting.push({ task, resolve, reject });
      this.#pump();
    });
  }

  async #pump() {
    if (this.#running) return;
    const next = this.#waiting.shift();
    if (!next) return;

    this.#running = true;
    try {
      next.resolve(await next.task());
    } catch (error) {
      next.reject(error);
    } finally {
      this.#running = false;
      this.#pump();
    }
  }
}

export function createOllama({
  url,
  model,
  timeoutMs = 60000,
  maxWaiting = 10,
  numCtx = 4096,
}) {
  const queue = new SerialQueue(maxWaiting);
  const endpoint = String(url).replace(/\/+$/, '');

  async function post(path, body, signal) {
    const response = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      // The body says why ("model not found", "request exceeds the available
      // context size"); the status alone leaves the log useless.
      const reason = ollamaReason(await response.text().catch(() => ''));
      throw new OllamaError(
        `Ollama returned ${response.status}${reason ? `: ${reason}` : ` ${response.statusText}`}`,
        response.status,
      );
    }
    return response.json();
  }

  return {
    get queued() {
      return queue.size;
    },

    /** One turn of conversation. Returns the assistant message, tool calls and all. */
    chat({ messages, tools }) {
      return queue.run(async () => {
        const data = await post(
          '/api/chat',
          {
            model,
            messages,
            ...(tools?.length ? { tools } : {}),
            stream: false,
            keep_alive: '30m',
            options: { temperature: 0.4, num_ctx: numCtx },
          },
          AbortSignal.timeout(timeoutMs),
        );
        return normaliseMessage(data.message ?? {});
      });
    },

    /** Is the server up, and is the model pulled? */
    async health() {
      try {
        const response = await fetch(`${endpoint}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          return { ok: false, reason: `HTTP ${response.status}`, models: [] };
        }
        const data = await response.json();
        const models = (data.models ?? []).map((entry) => entry.name);
        return {
          ok: true,
          models,
          hasModel: models.some((name) => name === model || name === `${model}:latest`),
        };
      } catch (error) {
        return { ok: false, reason: error.message, models: [] };
      }
    },
  };
}

/**
 * Small models return tool-call arguments either as an object or as a JSON
 * string, depending on the model and the day. Normalise to an object here so
 * nothing downstream has to care.
 */
export function normaliseMessage(message) {
  const toolCalls = (message.tool_calls ?? []).map((call) => {
    const fn = call.function ?? {};
    let args = fn.arguments ?? {};
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = { __unparsable: fn.arguments };
      }
    }
    return { name: fn.name, arguments: args };
  });

  return {
    role: message.role ?? 'assistant',
    content: message.content ?? '',
    toolCalls,
  };
}
