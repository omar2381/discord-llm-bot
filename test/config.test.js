import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig } from '../src/config.js';

const valid = {
  DISCORD_TOKEN: 'token',
  CLIENT_ID: '123456789012345678',
  DEV_GUILD_ID: '876543210987654321',
};

test('defaults are filled in and AI is off without a URL', () => {
  const config = buildConfig(valid);
  assert.equal(config.ai.enabled, false);
  assert.equal(config.ai.model, 'qwen2.5:3b');
  assert.equal(config.logLevel, 'info');
  assert.equal(config.databasePath, './data/bot.db');
  assert.equal(config.devGuildId, '876543210987654321');
  assert.equal(config.ownerId, null);
});

test('AI turns on when a URL is given', () => {
  const config = buildConfig({ ...valid, OLLAMA_URL: 'http://localhost:11434' });
  assert.equal(config.ai.enabled, true);
  assert.equal(config.ai.url, 'http://localhost:11434');
});

test('the error names the variable that is wrong', () => {
  assert.throws(() => buildConfig({ ...valid, DISCORD_TOKEN: '' }), /DISCORD_TOKEN/);
  assert.throws(() => buildConfig({ ...valid, CLIENT_ID: 'nope' }), /CLIENT_ID/);
  assert.throws(() => buildConfig({ ...valid, OLLAMA_URL: 'not-a-url' }), /OLLAMA_URL/);
});

test('allowed channel ids are split and trimmed', () => {
  const config = buildConfig({ ...valid, AI_ALLOWED_CHANNEL_IDS: ' 111, 222 ,, 333 ' });
  assert.deepEqual([...config.ai.allowedChannelIds], ['111', '222', '333']);
});

test('the config cannot be changed after it is built', () => {
  const config = buildConfig(valid);
  assert.throws(() => {
    config.token = 'other';
  }, TypeError);
});
