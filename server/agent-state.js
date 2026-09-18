const kinds = new Set(['heartbeat', 'session_start', 'turn_start', 'turn_end', 'output', 'tokens', 'tool_start', 'tool_end', 'thinking_start', 'thinking_end', 'subagent_start', 'subagent_end', 'subagents', 'disconnect']);
export const HOOK_WORK_TIMEOUT_MS = 15 * 60 * 1000;
const hasOpenWork = source => source.active || source.tools.size > 0 || source.children.size > 0 || source.thinking.size > 0;
export function validateEvent(event) {
  if (!event || !kinds.has(event.kind)) throw new Error('Unknown event kind');
  const allowed = new Set(['kind', 'source', 'id', 'count']);
  if (Object.keys(event).some(key => !allowed.has(key))) throw new Error('Only counter fields are accepted');
  if (typeof event.source !== 'string' || !/^[\w-]{1,80}$/.test(event.source)) throw new Error('Invalid source');
  if (event.id !== undefined && (typeof event.id !== 'string' || event.id.length > 160)) throw new Error('Invalid item id');
  if (['output', 'tokens', 'subagents'].includes(event.kind) && (!Number.isSafeInteger(event.count) || event.count < 0 || event.count > 10000000)) throw new Error('Invalid count');
  if (['tool_start', 'tool_end', 'thinking_start', 'thinking_end', 'subagent_start', 'subagent_end'].includes(event.kind) && !event.id) throw new Error('Item id required');
  return event;
}

export function createAgentState() {
  const sources = new Map();
  let lastEventAt = null, lastEventKind = null;
  function prune(now) {
    for (const [key, value] of sources) if (now - value.seen > (value.hook ? 60 * 60 * 1000 : 30000)) sources.delete(key);
  }
  return {
    ingest(raw, now = Date.now()) {
      const e = validateEvent(raw); prune(now);
      if (e.kind !== 'heartbeat' || lastEventAt === null) {
        if (lastEventAt === null || now >= lastEventAt) { lastEventAt = now; lastEventKind = e.kind; }
      }
      if (e.kind === 'disconnect') { sources.delete(e.source); return; }
      if (!sources.has(e.source)) {
        if (sources.size >= 32) throw new Error('Too many sources');
        const hook = e.source.startsWith('codex-hook-');
        sources.set(e.source, { hook, seen: now, tools: new Set(), thinking: new Map(), thinkingKnown: false, children: new Set(), subagents: hook ? 0 : null, tokensKnown: false, outputKnown: false, events: [], active: false, startedAt: null });
      }
      const s = sources.get(e.source);
      if (now < s.seen) return;
      s.seen = now;
      if (e.kind === 'turn_start' || e.kind === 'tool_start') {
        if (!s.active) s.startedAt = now;
        s.active = true;
      }
      if (e.kind === 'turn_end') { s.active = false; s.startedAt = null; s.tools.clear(); s.thinking.clear(); s.children.clear(); s.subagents = s.subagents === null ? null : 0; }
      if (e.kind === 'tool_start' && !s.tools.has(e.id) && s.tools.size < 256) { s.tools.add(e.id); s.events.push({ at: now, kind: 'tool', count: 1 }); }
      if (e.kind === 'tool_end') s.tools.delete(e.id);
      if (e.kind === 'thinking_start' && !s.thinking.has(e.id) && s.thinking.size < 256) { s.thinking.set(e.id, now); s.thinkingKnown = true; }
      if (e.kind === 'thinking_end') s.thinking.delete(e.id);
      if (e.kind === 'subagents') s.subagents = Math.min(128, e.count);
      if (e.kind === 'subagent_start' && s.children.size < 128) { s.children.add(e.id); s.subagents = s.children.size; }
      if (e.kind === 'subagent_end') { s.children.delete(e.id); s.subagents = s.children.size; }
      if (e.kind === 'output' || e.kind === 'tokens') { s.events.push({ at: now, kind: e.kind, count: e.count }); if (e.kind === 'tokens') s.tokensKnown = true; else s.outputKnown = true; }
      s.events = s.events.filter(e => now - e.at < 10000).slice(-2000);
    },
    snapshot(now = Date.now()) {
      prune(now);
      const retained = [...sources.values()];
      const all = retained.filter(s => !s.hook || !hasOpenWork(s) || now - s.seen <= HOOK_WORK_TIMEOUT_MS);
      const total = kind => all.reduce((sum, s) => sum + s.events.filter(e => e.kind === kind && now - e.at < 10000).reduce((n, e) => n + e.count, 0), 0) / 10;
      const thinking = all.flatMap(s => [...s.thinking.values()]);
      const working = all.filter(hasOpenWork);
      const status = working.length ? 'working' : retained.length !== all.length ? 'unknown' : all.length || ['turn_end', 'disconnect'].includes(lastEventKind) ? 'idle' : lastEventAt === null ? 'waiting' : 'unknown';
      const starts = working.map(s => s.startedAt ?? s.seen);
      return {
        status, lastEventAt, lastEventKind,
        lastEventAgeSeconds: lastEventAt === null ? null : Math.max(0, (now - lastEventAt) / 1000),
        workingSeconds: starts.length ? Math.max(0, (now - Math.min(...starts)) / 1000) : null,
        activityBasis: working.some(s => s.hook) ? 'open-turn' : working.length ? 'event-stream' : null,
        connected: all.length > 0, sources: all.length, activeTurns: all.filter(s => s.active).length,
        charactersPerSecond: all.some(s => s.outputKnown) ? total('output') : null, tokensPerSecond: all.some(s => s.tokensKnown) ? total('tokens') : null,
        toolsPerSecond: total('tool'), activeTools: all.reduce((n, s) => n + s.tools.size, 0),
        toolPulse: Math.max(0, ...all.flatMap(s => s.events.filter(e => e.kind === 'tool' && now - e.at < 2000).map(e => Math.exp(-(now - e.at) / 250)))),
        activeSubagents: all.some(s => s.subagents !== null) ? all.reduce((n, s) => n + (s.subagents ?? 0), 0) : null,
        thinking: thinking.length > 0, thinkingSeconds: all.some(s => s.thinkingKnown) ? (thinking.length ? (now - Math.min(...thinking)) / 1000 : 0) : null,
      };
    },
  };
}
