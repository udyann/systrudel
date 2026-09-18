import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEvent } from './agent-state.js';

export const hookInboxDirectory = fileURLToPath(new URL('../.local/codex-inbox/', import.meta.url));
export const MAX_HOOK_AGE_MS = 15 * 60 * 1000;
const MAX_FILES = 512;
const eventFiles = names => names.filter(name => /^\d{13}-[\w-]+\.json$/.test(name)).sort();

// The trusted hook writes counters locally, without needing a server token or network access.
export async function enqueueHookEvents(events, { directory = hookInboxDirectory, now = Date.now() } = {}) {
  if (!events.length) return;
  events.forEach(validateEvent);
  await mkdir(directory, { recursive: true });
  const names = eventFiles(await readdir(directory));
  for (const name of names.slice(0, Math.max(0, names.length - MAX_FILES + 1))) await unlink(join(directory, name)).catch(() => {});
  const destination = join(directory, `${now}-${randomUUID()}.json`);
  const temporary = `${destination}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, at: now, events }), { mode: 0o600 });
    await rename(temporary, destination);
  } finally { await unlink(temporary).catch(() => {}); }
}

export function createHookInbox({ agents, directory = hookInboxDirectory, now = Date.now } = {}) {
  let busy = false;
  const diagnostics = { processed: 0, expired: 0, invalid: 0, lastReceivedAt: null, problem: null };
  async function poll() {
    if (busy) return;
    busy = true;
    try {
      await mkdir(directory, { recursive: true });
      const names = eventFiles(await readdir(directory)).slice(0, 64);
      for (const name of names) {
        const path = join(directory, name);
        try {
          if ((await stat(path)).size > 16384) throw new Error('oversized');
          const envelope = JSON.parse(await readFile(path, 'utf8'));
          const time = now();
          if (envelope.version !== 1 || !Number.isSafeInteger(envelope.at) || !Array.isArray(envelope.events) || !envelope.events.length || envelope.events.length > 16) throw new Error('invalid');
          envelope.events.forEach(event => {
            validateEvent(event);
            if (!event.source.startsWith('codex-hook-')) throw new Error('invalid source');
          });
          if (time - envelope.at > MAX_HOOK_AGE_MS || envelope.at > time + 5000) diagnostics.expired++;
          else {
            for (const event of envelope.events) agents.ingest(event, envelope.at);
            diagnostics.processed += envelope.events.length;
            diagnostics.lastReceivedAt = time;
          }
        } catch { diagnostics.invalid++; }
        await unlink(path).catch(() => {});
      }
      diagnostics.problem = null;
    } catch { diagnostics.problem = 'Local hook inbox could not be read'; }
    finally { busy = false; }
  }
  return { poll, snapshot: () => ({ ...diagnostics }) };
}
