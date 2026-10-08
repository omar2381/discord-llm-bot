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
  }
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
      throw new OllamaError(
        `Ollama returned ${response.status} ${response.statusText}`,
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
