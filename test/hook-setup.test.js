import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { hookCommand, setupHooks } from '../scripts/setup-codex-hooks.js';

test('hook setup handles spaces and preserves existing local definitions', async t => {
  const temporaryRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(temporaryRoot, 'systrudel setup '));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(temporaryRoot + sep));
    await rm(directory, { recursive: true, force: true });
  });
  assert.equal(await setupHooks(directory), true);
  const path = join(directory, '.codex', 'hooks.json');
  const original = await readFile(path, 'utf8');
  const definition = JSON.parse(original);
  assert.equal(Object.keys(definition.hooks).length, 9);
  for (const groups of Object.values(definition.hooks)) {
    for (const group of groups) for (const hook of group.hooks) {
      assert.equal(hook.command, hookCommand(directory));
      assert.ok(!hook.command.includes('__SYSTRUDEL_ROOT__'));
    }
  }
  assert.equal(await setupHooks(directory), false);
  assert.equal(await readFile(path, 'utf8'), original);
});

test('hook commands quote paths and reject Windows shell expansions', () => {
  assert.equal(hookCommand('C:/a folder/음악', 'win32'), 'node "C:/a folder/음악/scripts/codex-hook.js"');
  for (const path of ['C:/a$var', 'C:/a%var%', 'C:/a!var!', 'C:/a`var', 'C:/a"var']) {
    assert.throws(() => hookCommand(path, 'win32'), /checkout path/);
  }
  assert.equal(hookCommand("/tmp/it's music", 'linux'), "node '/tmp/it'\\''s music/scripts/codex-hook.js'");
});
