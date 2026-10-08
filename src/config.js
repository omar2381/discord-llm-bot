import 'dotenv/config';
import { z } from 'zod';

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord ID');

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'is required'),
  CLIENT_ID: snowflake,
  DEV_GUILD_ID: snowflake.optional().or(z.literal('')),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_PATH: z.string().default('./data/bot.db'),
  OWNER_ID: snowflake.optional().or(z.literal('')),

  OLLAMA_URL: z.string().url().optional().or(z.literal('')),
  OLLAMA_MODEL: z.string().default('qwen2.5:3b'),
  AI_MAX_HISTORY: z.coerce.number().int().min(0).max(50).default(12),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
  AI_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(5),
  AI_NUM_CTX: z.coerce.number().int().min(1024).max(32768).default(8192),
  AI_ALLOWED_CHANNEL_IDS: z.string().default(''),
});

/**
 * Parse process.env and return a frozen config, or exit with a readable message.
 * Exported separately from the parsing so tests can pass their own env.
 */
export function buildConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  ${issue.path.join('.') || '(root)'} ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  const env_ = result.data;

  return Object.freeze({
    token: env_.DISCORD_TOKEN,
    clientId: env_.CLIENT_ID,
    devGuildId: env_.DEV_GUILD_ID || null,
    ownerId: env_.OWNER_ID || null,
    logLevel: env_.LOG_LEVEL,
    databasePath: env_.DATABASE_PATH,
    ai: Object.freeze({
      enabled: Boolean(env_.OLLAMA_URL),
      url: env_.OLLAMA_URL || null,
      model: env_.OLLAMA_MODEL,
      maxHistory: env_.AI_MAX_HISTORY,
      timeoutMs: env_.AI_TIMEOUT_MS,
      rateLimitPerMin: env_.AI_RATE_LIMIT_PER_MIN,
      numCtx: env_.AI_NUM_CTX,
      allowedChannelIds: Object.freeze(
        env_.AI_ALLOWED_CHANNEL_IDS.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    }),
  });
}

let cached = null;

/** The process-wide config. Built on first use so importing this file is cheap. */
export function getConfig() {
  cached ??= buildConfig();
  return cached;
}
