import { getConfig } from '../src/config.js';
import { createOllama } from '../src/ai/ollama.js';

const config = getConfig();

if (!config.ai.enabled) {
  console.log('AI is off: OLLAMA_URL is not set in .env.');
  process.exit(0);
}

console.log(`Server: ${config.ai.url}`);
console.log(`Model:  ${config.ai.model}\n`);

const ollama = createOllama({
  url: config.ai.url,
  model: config.ai.model,
  timeoutMs: config.ai.timeoutMs,
});

const health = await ollama.health();
if (!health.ok) {
  console.error(`Cannot reach Ollama: ${health.reason}`);
  console.error('Is it running? Try: ollama serve');
  process.exit(1);
}

console.log(`Reachable. ${health.models.length} model(s) installed:`);
for (const name of health.models) console.log(`  ${name}`);

if (!health.hasModel) {
  console.error(
    `\n${config.ai.model} is not pulled. Run:\n  ollama pull ${config.ai.model}`,
  );
  process.exit(1);
}

console.log('\nRunning a test prompt...');
const started = Date.now();
const reply = await ollama.chat({
  messages: [
    { role: 'system', content: 'Answer in one short sentence.' },
    { role: 'user', content: 'Say hello and name yourself.' },
  ],
});
const seconds = ((Date.now() - started) / 1000).toFixed(1);

console.log(`\n${reply.content.trim()}\n`);
console.log(`Took ${seconds}s. Under about 20s is usable on CPU; if it is much slower,`);
console.log('try a smaller model such as qwen2.5:1.5b.');
