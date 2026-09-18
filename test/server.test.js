import test from 'node:test';
import assert from 'node:assert/strict';
import { startCompanion } from '../server/server.js';

test('companion serves counters, streams updates and guards mutations', async t => {
  let enabled = false, closed = false;
  const companion = await startCompanion({ port: 0, sessionFile: null, hookDirectory: null, collectors: {
    snapshot: () => ({ system: { cpu: 42 }, human: null, humanStatus: enabled ? 'on' : 'off' }),
    setHuman: value => { enabled = value; }, close: () => { closed = true; },
  } });
  t.after(async () => { await companion.close(); assert.equal(closed, true); });
  const base = `http://127.0.0.1:${companion.port}`;
  const post = (path, data, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof data === 'string' ? data : JSON.stringify(data) });
  assert.equal((await (await fetch(`${base}/api/snapshot`)).json()).system.cpu, 42);
  assert.equal((await fetch(`${base}/api/snapshot`, { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await post('/api/agent', { source: 'test', kind: 'heartbeat' })).status, 403);
  const auth = { Authorization: `Bearer ${companion.token}` };
  assert.equal((await post('/api/agent', { source: 'test', kind: 'output', count: 42 }, auth)).status, 200);
  assert.equal((await post('/api/agent', { source: 'test', kind: 'output', count: 42, prompt: 'secret' }, auth)).status, 400);
  assert.equal((await post('/api/agent', ' '.repeat(17000), auth)).status, 413);
  assert.equal((await post('/api/human', { enabled: true }, { Origin: 'http://localhost:5173', 'X-PhotoSynthRudel': '1' })).status, 200);
  assert.equal(enabled, true);
  assert.equal((await post('/api/human', { enabled: false }, { Origin: 'https://example.com', 'X-PhotoSynthRudel': '1' })).status, 403);
  const controller = new AbortController();
  const stream = await fetch(`${base}/api/events`, { signal: controller.signal });
  const reader = stream.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.ok(first.startsWith('data: ')); assert.ok(first.includes('"connected":true')); assert.ok(!first.includes(companion.token));
  controller.abort();
});
