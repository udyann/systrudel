import { randomUUID } from 'node:crypto';
import { createCodexAdapter } from '../server/codex-events.js';
import { createAgentClient } from './agent-client.js';

if (process.stdin.isTTY) {
  console.error('Pipe structured events here: codex exec --json "your task" | npm run agent:codex --silent');
  process.exit(1);
}
const source = `codex-cli-${randomUUID()}`;
const convert = createCodexAdapter(source);
let send;
try { send = await createAgentClient(); } catch { console.error('Start npm run dev (or npm run telemetry) first.'); process.exit(1); }
let connected = false, buffer = '', discarded = false, queue = Promise.resolve(), pending = 0;
function post(event) {
  if (pending >= 1024) return;
  pending++;
  queue = queue.then(() => send(event)).catch(() => { console.error('Telemetry unavailable; events dropped.'); }).finally(() => pending--);
}
function consume(line) {
  try {
    const events = convert(JSON.parse(line.replace(/^\uFEFF/, '')));
    if (events.length) connected = true;
    for (const event of events) post(event);
  } catch { /* Ignore non-JSON terminal diagnostics. */ }
}
const timer = setInterval(() => { if (connected) post({ source, kind: 'heartbeat' }); }, 10000);
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  for (const part of chunk.split(/(?<=\n)/)) {
    if (!discarded) buffer += part;
    if (buffer.length > 1024 * 1024) { buffer = ''; discarded = true; }
    if (part.endsWith('\n')) { if (!discarded) consume(buffer); buffer = ''; discarded = false; }
  }
}
if (buffer && !discarded) consume(buffer);
clearInterval(timer);
// Keep final rates visible for the normal 30-second freshness window.
await queue;
