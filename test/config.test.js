import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../config/env.js';
import { startCompanion } from '../server/server.js';

test('configuration supports defaults and custom distinct ports', () => {
  assert.deepEqual(readConfig({}), { uiPort: 5173, companionPort: 4317, previewPort: 4173 });
  assert.deepEqual(readConfig({ SYSTRUDEL_UI_PORT: '6001', SYSTRUDEL_COMPANION_PORT: '6002', SYSTRUDEL_PREVIEW_PORT: '6003' }), { uiPort: 6001, companionPort: 6002, previewPort: 6003 });
  for (const value of ['0', '-1', '65536', '1.5', 'NaN', '5e3', 'port']) {
    assert.throws(() => readConfig({ SYSTRUDEL_UI_PORT: value }), /SYSTRUDEL_UI_PORT/);
  }
  assert.throws(() => readConfig({ SYSTRUDEL_UI_PORT: '4317' }), /must be different/);
});

test('custom UI and preview origins work without allowing arbitrary local ports', async t => {
  let enabled = false;
  const companion = await startCompanion({ port: 0, uiPort: 6001, previewPort: 6003, sessionFile: null, hookDirectory: null, collectors: {
    snapshot: () => ({}), setHuman: value => { enabled = value; }, close() {},
  } });
  t.after(() => companion.close());
  const post = origin => fetch(`http://127.0.0.1:${companion.port}/api/human`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-systrudel': '1' }, body: JSON.stringify({ enabled: true }),
  });
  assert.equal((await post('http://localhost:6001')).status, 200);
  assert.equal((await post('http://127.0.0.1:6003')).status, 200);
  assert.equal(enabled, true);
  assert.equal((await post('http://localhost:5173')).status, 403);
  assert.equal((await post('http://localhost:9999')).status, 403);
  assert.equal((await post('https://example.com')).status, 403);
});
