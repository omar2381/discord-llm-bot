import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  OllamaBusyError,
  OllamaError,
  SerialQueue,
  createOllama,
  normaliseMessage,
} from '../../src/ai/ollama.js';

function mockFetch(handler) {
  mock.method(globalThis, 'fetch', handler);
}

test.afterEach(() => mock.restoreAll());

test('tool arguments arrive as an object or a JSON string, and both work', () => {
  const asObject = normaliseMessage({
    tool_calls: [{ function: { name: 'x', arguments: { a: 1 } } }],
  });
  const asString = normaliseMessage({
    tool_calls: [{ function: { name: 'x', arguments: '{"a":1}' } }],
  });
  assert.deepEqual(asObject.toolCalls[0].arguments, { a: 1 });
  assert.deepEqual(asString.toolCalls[0].arguments, { a: 1 });
});

test('unparsable arguments do not throw', () => {
  const message = normaliseMessage({
    tool_calls: [{ function: { name: 'x', arguments: '{not json' } }],
  });
  assert.deepEqual(message.toolCalls[0].arguments, { __unparsable: '{not json' });
});

test('a plain reply has no tool calls', () => {
  const message = normaliseMessage({ role: 'assistant', content: 'hello' });
  assert.equal(message.content, 'hello');
  assert.deepEqual(message.toolCalls, []);
});

test('chat posts to /api/chat and returns the message', async () => {
  let seen;
  mockFetch(async (url, init) => {
    seen = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ message: { content: 'hi' } }), { status: 200 });
  });

  const ollama = createOllama({ url: 'http://host:11434/', model: 'm' });
  const reply = await ollama.chat({ messages: [{ role: 'user', content: 'yo' }] });

  assert.equal(seen.url, 'http://host:11434/api/chat', 'the trailing slash is handled');
  assert.equal(seen.body.model, 'm');
  assert.equal(seen.body.stream, false);
  assert.equal(reply.content, 'hi');
});

test('tools are only sent when there are some', async () => {
  const bodies = [];
  mockFetch(async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ message: { content: '' } }), { status: 200 });
  });

  const ollama = createOllama({ url: 'http://host', model: 'm' });
  await ollama.chat({ messages: [], tools: [] });
  await ollama.chat({ messages: [], tools: [{ type: 'function' }] });

  assert.equal('tools' in bodies[0], false);
  assert.equal(bodies[1].tools.length, 1);
});

test('an HTTP error becomes an OllamaError carrying the status', async () => {
  mockFetch(
    async () => new Response('nope', { status: 500, statusText: 'Server Error' }),
  );
  const ollama = createOllama({ url: 'http://host', model: 'm' });

  await assert.rejects(
    () => ollama.chat({ messages: [] }),
    (error) => {
      assert.ok(error instanceof OllamaError);
      assert.equal(error.status, 500);
      return true;
    },
  );
});

test('health reports reachability and whether the model is pulled', async () => {
  mockFetch(
    async () =>
      new Response(JSON.stringify({ models: [{ name: 'qwen2.5:3b' }] }), { status: 200 }),
  );

  const present = await createOllama({
    url: 'http://host',
    model: 'qwen2.5:3b',
  }).health();
  assert.equal(present.ok, true);
  assert.equal(present.hasModel, true);

  const missing = await createOllama({
    url: 'http://host',
    model: 'llama3.2:3b',
  }).health();
  assert.equal(missing.hasModel, false);
});

test('health reports a down server rather than throwing', async () => {
  mockFetch(async () => {
    throw new Error('connect ECONNREFUSED');
  });
  const health = await createOllama({ url: 'http://host', model: 'm' }).health();
  assert.equal(health.ok, false);
  assert.match(health.reason, /ECONNREFUSED/);
});

test('the queue runs one task at a time', async () => {
  const queue = new SerialQueue();
  let running = 0;
  let peak = 0;

  const task = async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
  };

  await Promise.all([queue.run(task), queue.run(task), queue.run(task)]);
  assert.equal(peak, 1, 'never two at once');
});

test('the queue refuses callers once the waiting list is full', async () => {
  // maxWaiting counts those still queued, so one running plus two waiting is
  // the most it will hold; the fourth caller is told to come back.
  const queue = new SerialQueue(2);
  const slow = () => new Promise((resolve) => setTimeout(resolve, 20));

  const running = queue.run(slow);
  const waiting = [queue.run(slow), queue.run(slow)];
  await assert.rejects(() => queue.run(slow), OllamaBusyError);

  await Promise.all([running, ...waiting]);
  assert.equal(await queue.run(async () => 'room again'), 'room again');
});

test('a failing task does not wedge the queue', async () => {
  const queue = new SerialQueue();
  await assert.rejects(() =>
    queue.run(async () => {
      throw new Error('boom');
    }),
  );
  assert.equal(await queue.run(async () => 'still works'), 'still works');
});
