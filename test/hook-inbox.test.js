import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAgentState } from '../server/agent-state.js';
import { normalizeHook } from '../server/codex-events.js';
import { enqueueHookEvents, createHookInbox, MAX_HOOK_AGE_MS } from '../server/hook-inbox.js';

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'photosynth-hook-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test('counter-only hooks survive an offline companion and replay in event order', async t => {
  const directory = await setup(t), at = 1700000000000;
  const hook = event => normalizeHook({ session_id: 'private-session', hook_event_name: event, tool_input: 'private input', transcript_path: 'private transcript' });
  await enqueueHookEvents(hook('UserPromptSubmit'), { directory, now: at });
  const [name] = await readdir(directory);
  const serialized = await readFile(join(directory, name), 'utf8');
  assert.ok(!serialized.includes('private'));
  const agents = createAgentState(), inbox = createHookInbox({ directory, agents, now: () => at + 60000 });
  await inbox.poll();
  assert.equal(agents.snapshot(at + 60000).status, 'working');
  assert.equal(agents.snapshot(at + 60000).workingSeconds, 60);
  assert.equal(inbox.snapshot().processed, 1); assert.deepEqual(await readdir(directory), []);
  await enqueueHookEvents(hook('Stop'), { directory, now: at + 60001 });
  await inbox.poll(); assert.equal(agents.snapshot(at + 60002).status, 'idle');
  await inbox.poll(); assert.equal(inbox.snapshot().processed, 2);
});
test('inbox drops expired, malformed and oversized files without reviving stale work', async t => {
  const directory = await setup(t), at = 1700000000000;
  await enqueueHookEvents([{ source: 'codex-hook-test', kind: 'turn_start' }], { directory, now: at });
  await writeFile(join(directory, `${at}-invalid.json`), '{');
  await writeFile(join(directory, `${at}-large.json`), ' '.repeat(17000));
  const agents = createAgentState(), inbox = createHookInbox({ directory, agents, now: () => at + MAX_HOOK_AGE_MS + 1 });
  await inbox.poll();
  assert.equal(agents.snapshot(at + MAX_HOOK_AGE_MS + 1).status, 'waiting');
  assert.equal(inbox.snapshot().expired, 1); assert.equal(inbox.snapshot().invalid, 2);
  assert.deepEqual(await readdir(directory), []);
});
test('uncommitted temporary files never become agent events', async t => {
  const directory = await setup(t), agents = createAgentState();
  await writeFile(join(directory, '1700000000000-incomplete.json.tmp'), '{');
  const inbox = createHookInbox({ directory, agents });
  await inbox.poll();
  assert.equal(inbox.snapshot().processed, 0); assert.equal(agents.snapshot().status, 'waiting');
});
test('the actual IDE hook command delivers without HTTP credentials or a running companion', async t => {
  const directory = await setup(t);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/codex-hook.js', import.meta.url))], { windowsHide: true, env: { ...process.env, PHOTOSYNTH_HOOK_INBOX: directory }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  const exited = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  child.stdin.end(JSON.stringify({ session_id: 'isolated-fixture', hook_event_name: 'UserPromptSubmit', prompt: 'Do not retain this text' }));
  assert.equal(await exited, 0); assert.equal(output, '');
  const agents = createAgentState(), inbox = createHookInbox({ directory, agents });
  await inbox.poll();
  assert.equal(agents.snapshot().status, 'working'); assert.equal(inbox.snapshot().processed, 1);
});
