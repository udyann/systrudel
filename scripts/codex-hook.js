import { normalizeHook } from '../server/codex-events.js';
import { enqueueHookEvents } from '../server/hook-inbox.js';
// Advisory hooks always exit successfully and never print model context.
try {
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024 * 1024) process.exit(0); }
  const events = normalizeHook(JSON.parse(input));
  await enqueueHookEvents(events, { directory: process.env.PHOTOSYNTH_HOOK_INBOX });
} catch { /* Music telemetry must never block the user's agent task. */ }
