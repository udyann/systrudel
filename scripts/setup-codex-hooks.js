import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const workspace = resolve(fileURLToPath(new URL('../', import.meta.url)));

export function hookCommand(root, platform = process.platform) {
  const path = `${root.replaceAll('\\', '/').replace(/\/$/, '')}/scripts/codex-hook.js`;
  // Windows hooks can run through different shells. Reject expansion characters
  // rather than generating a command that can change meaning in another shell.
  if (platform === 'win32') {
    if (/["`$%!\r\n]/.test(path)) throw new Error('For Codex hooks, use a checkout path without quotes, backticks, $, %, ! or newlines. Spaces and Unicode are supported.');
    return `node "${path}"`;
  }
  return `node '${path.replaceAll("'", "'\\''")}'`;
}

export async function setupHooks(root = workspace) {
  const definition = JSON.parse(await readFile(new URL('../integrations/codex/hooks.example.json', import.meta.url), 'utf8'));
  const command = hookCommand(root);
  for (const groups of Object.values(definition.hooks)) {
    for (const group of groups) for (const hook of group.hooks) hook.command = command;
  }
  const directory = join(root, '.codex');
  await mkdir(directory, { recursive: true });
  try {
    // Never overwrite existing hooks or invalidate an existing trust decision.
    await writeFile(join(directory, 'hooks.json'), `${JSON.stringify(definition, null, 2)}\n`, { flag: 'wx' });
    return true;
  } catch (error) { if (error.code === 'EEXIST') return false; throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const created = await setupHooks();
    console.log(created ? 'Created .codex/hooks.json for this checkout. Review and trust the hooks in Codex, then reload your IDE session.' : 'Existing .codex/hooks.json left unchanged. To combine configurations, use integrations/codex/hooks.example.json as a reference.');
    console.log('Setup guide: integrations/codex/README.md');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
