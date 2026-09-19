import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import '../config/env.js';
import { hookCommand } from './setup-codex-hooks.js';

const workspace = resolve(fileURLToPath(new URL('../', import.meta.url)));
const roots = process.platform === 'win32' ? [...new Set([workspace[0].toUpperCase() + workspace.slice(1), workspace[0].toLowerCase() + workspace.slice(1)])] : [workspace];
const executable = process.env.SYSTRUDEL_CODEX_EXECUTABLE ?? 'codex';
const child = spawn(executable, ['app-server'], { cwd: workspace, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.resume();
const lines = createInterface({ input: child.stdout });
const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);

try {
  const result = await new Promise((resolveResult, reject) => {
    const timeout = setTimeout(() => reject(new Error('Codex hook inspection timed out')), 15000);
    const finish = (error, result) => { clearTimeout(timeout); error ? reject(error) : resolveResult(result); };
    child.on('error', error => finish(new Error(`Could not start the local Codex backend (${error.code}). Set SYSTRUDEL_CODEX_EXECUTABLE to its executable path.`)));
    child.on('exit', code => finish(new Error(`Codex backend exited before answering (${code})`)));
    lines.on('line', line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      if (message.id === 1) {
        if (message.error) return finish(new Error(message.error.message));
        send({ method: 'initialized', params: {} });
        send({ id: 2, method: 'hooks/list', params: { cwds: roots } });
      }
      if (message.id === 2) message.error ? finish(new Error(message.error.message)) : finish(null, message.result);
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'systrudel_diagnostics', version: '1.0.0' }, capabilities: { experimentalApi: true } } });
  });
  const normalizeCommand = command => process.platform === 'win32' ? command?.toLowerCase() : command;
  const expectedCommands = [hookCommand(workspace), `node ${workspace.replaceAll('\\', '/')}/scripts/codex-hook.js`].map(normalizeCommand);
  const reports = (result.data ?? []).map(entry => ({
    cwd: entry.cwd,
    hooks: (entry.hooks ?? []).filter(hook => expectedCommands.includes(normalizeCommand(hook.command))).map(hook => ({ key: hook.key, event: hook.eventName, enabled: hook.enabled, trust: hook.trustStatus, hash: hook.currentHash, sourcePath: hook.sourcePath })),
    errorCount: entry.errors?.length ?? 0,
  }));
  for (const report of reports) {
    console.log(`${report.cwd}: ${report.hooks.filter(h => h.enabled && h.trust === 'trusted').length}/${report.hooks.length} hooks enabled and trusted`);
    if (!report.hooks.length) console.log('  Project hooks were not discovered for this workspace.');
    for (const hook of report.hooks.filter(h => !h.enabled || h.trust !== 'trusted')) console.log(`  ${hook.event}: ${hook.enabled ? hook.trust : 'disabled'}`);
  }
  if (reports.length > 1 && reports[0].hooks.length && reports[0].hooks.some(h => h.trust !== 'trusted') && reports[1].hooks.every(h => h.trust === 'trusted')) console.log('Windows path casing changes trust lookup. Existing lowercase-path approval is not being recognized for the uppercase path.');
  const reportFile = new URL('../.local/codex-hook-check.json', import.meta.url);
  await mkdir(new URL('./', reportFile), { recursive: true });
  const definitionHash = createHash('sha256').update(await readFile(new URL('../.codex/hooks.json', import.meta.url))).digest('hex');
  await writeFile(reportFile, JSON.stringify({ checkedAt: Date.now(), workspace, definitionHash, reports }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { lines.close(); child.kill(); }
