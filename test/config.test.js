import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from '../src/config.js';

const base = { DISCORD_TOKEN: 'token', CLIENT_ID: '123456789012345678' };

test('applies defaults and disables AI when OLLAMA_URL is unset', () => {
  const config = loadConfig(base);
  assert.equal(config.discord.token, 'token');
  assert.equal(config.discord.clientId, '123456789012345678');
  assert.equal(config.discord.devGuildId, undefined);
  assert.equal(config.logLevel, 'info');
  assert.equal(config.databasePath, './data/bot.db');
  assert.equal(config.ai.enabled, false);
  assert.equal(config.ai.model, 'qwen2.5:3b');
  assert.equal(config.ai.maxHistory, 12);
  assert.deepEqual(config.ai.allowedChannelIds, []);
});

test('treats empty strings (as copied from .env.example) as unset', () => {
  const config = loadConfig({ ...base, DEV_GUILD_ID: '', OLLAMA_URL: '  ', LOG_LEVEL: '' });
  assert.equal(config.discord.devGuildId, undefined);
  assert.equal(config.ai.enabled, false);
  assert.equal(config.logLevel, 'info');
});

test('enables AI and parses numbers and channel lists', () => {
  const config = loadConfig({
    ...base,
    OLLAMA_URL: 'http://localhost:11434',
    AI_TIMEOUT_MS: '30000',
    AI_ALLOWED_CHANNEL_IDS: '111111111111111111, 222222222222222222',
  });
  assert.equal(config.ai.enabled, true);
  assert.equal(config.ai.url, 'http://localhost:11434');
  assert.equal(config.ai.timeoutMs, 30000);
  assert.deepEqual(config.ai.allowedChannelIds, ['111111111111111111', '222222222222222222']);
});

test('names every invalid variable in one error', () => {
  assert.throws(
    () => loadConfig({ CLIENT_ID: 'abc', OLLAMA_URL: 'not a url', AI_MAX_HISTORY: 'lots' }),
    (err) => {
      assert.ok(err instanceof ConfigError);
      for (const key of ['DISCORD_TOKEN', 'CLIENT_ID', 'OLLAMA_URL', 'AI_MAX_HISTORY']) {
        assert.match(err.message, new RegExp(key));
      }
      return true;
    },
  );
});

test('never includes the token in the error message', () => {
  assert.throws(
    () => loadConfig({ DISCORD_TOKEN: 'super-secret-token', CLIENT_ID: 'bad' }),
    (err) => !err.message.includes('super-secret-token'),
  );
});

test('returns a frozen object', () => {
  const config = loadConfig(base);
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.ai));
});
