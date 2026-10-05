import { z } from 'zod';

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord ID (17-20 digits)');

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: snowflake,
  DEV_GUILD_ID: snowflake.optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_PATH: z.string().min(1).default('./data/bot.db'),
  OWNER_ID: snowflake.optional(),
  OLLAMA_URL: z.url().optional(),
  OLLAMA_MODEL: z.string().min(1).default('qwen2.5:3b'),
  AI_MAX_HISTORY: z.coerce.number().int().min(0).max(50).default(12),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
  AI_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(5),
  AI_ALLOWED_CHANNEL_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .pipe(z.array(snowflake)),
});

export class ConfigError extends Error {
  name = 'ConfigError';
}

/**
 * Parse and validate configuration from environment variables.
 * Empty strings are treated as unset, so blank lines copied from .env.example work.
 * @param {Record<string, string | undefined>} env
 */
export function loadConfig(env = process.env) {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );

  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => {
        const key = issue.path.join('.') || '(root)';
        const missing = issue.code === 'invalid_type' && cleaned[key] === undefined;
        return `  - ${key}: ${missing ? 'is required' : issue.message}`;
      })
      .join('\n');
    throw new ConfigError(`Invalid configuration (check your .env file):\n${problems}`);
  }

  const e = result.data;
  return Object.freeze({
    discord: Object.freeze({
      token: e.DISCORD_TOKEN,
      clientId: e.CLIENT_ID,
      devGuildId: e.DEV_GUILD_ID,
    }),
    logLevel: e.LOG_LEVEL,
    databasePath: e.DATABASE_PATH,
    ownerId: e.OWNER_ID,
    ai: Object.freeze({
      enabled: Boolean(e.OLLAMA_URL),
      url: e.OLLAMA_URL,
      model: e.OLLAMA_MODEL,
      maxHistory: e.AI_MAX_HISTORY,
      timeoutMs: e.AI_TIMEOUT_MS,
      rateLimitPerMin: e.AI_RATE_LIMIT_PER_MIN,
      allowedChannelIds: Object.freeze(e.AI_ALLOWED_CHANNEL_IDS),
    }),
  });
}
