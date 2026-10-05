import pino from 'pino';

/**
 * Pretty, human-readable logs in an interactive terminal; JSON lines otherwise
 * (production, docker, CI), so pino-pretty is only needed in development.
 * @param {string} level
 */
export function createLogger(level = 'info') {
  const pretty = process.stdout.isTTY && process.env.NODE_ENV !== 'production';
  return pino({
    level,
    ...(pretty && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    }),
  });
}
