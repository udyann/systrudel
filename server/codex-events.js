import { createHash } from 'node:crypto';
const opaque = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
const toolTypes = new Set(['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'webSearch', 'collabToolCall']);

// Raw text is inspected for length only, never included in the normalized events.
export function createCodexAdapter(source = `codex-${process.pid}`) {
  const lengths = new Map();
  const streamed = new Set();
  const tokenTotals = new Map();
  return raw => {
    const result = [];
    const emit = (kind, extra = {}) => result.push({ source, kind, ...extra });
    const method = raw.method ?? raw.type;
    const p = raw.params ?? raw;
    const item = p.item;
    const thread = p.threadId ?? '';
    const key = `${thread}:${item?.id ?? p.itemId ?? ''}`;
    const id = opaque(key);
    if (['thread.started', 'thread/started'].includes(method)) emit('heartbeat');
    if (['turn.started', 'turn/started'].includes(method)) { lengths.clear(); streamed.clear(); emit('turn_start'); }
    if (['turn.completed', 'turn.failed', 'turn/completed'].includes(method)) {
      if (Number.isSafeInteger(raw.usage?.output_tokens)) emit('tokens', { count: raw.usage.output_tokens });
      emit('turn_end'); lengths.clear(); streamed.clear();
    }
    if (method === 'thread/tokenUsage/updated') {
      const total = p.tokenUsage?.total?.outputTokens;
      if (Number.isSafeInteger(total)) {
        const previous = tokenTotals.get(thread);
        if (previous !== undefined) emit('tokens', { count: Math.max(0, total - previous) });
        tokenTotals.set(thread, total);
      }
    }
    if (method === 'item/agentMessage/delta' && typeof p.delta === 'string') {
      streamed.add(key); emit('output', { count: p.delta.length });
    }
    if (item && ['item.started', 'item/started', 'item.updated', 'item.completed', 'item/completed'].includes(method)) {
      const started = method.endsWith('started'), completed = method.endsWith('completed');
      if (toolTypes.has(item.type)) {
        if (started) emit('tool_start', { id });
        if (completed) emit('tool_end', { id });
      }
      if (item.type === 'reasoning') {
        if (started) emit('thinking_start', { id });
        if (completed) emit('thinking_end', { id });
      }
      if (['agent_message', 'agentMessage'].includes(item.type) && typeof item.text === 'string' && !streamed.has(key)) {
        const previous = lengths.get(key) ?? 0;
        emit('output', { count: Math.max(0, item.text.length - previous) });
        lengths.set(key, item.text.length);
      }
      if (completed) { lengths.delete(key); streamed.delete(key); }
    }
    // Bound bookkeeping if an upstream client never sends completion notifications.
    if (lengths.size > 4096) lengths.clear();
    if (streamed.size > 4096) streamed.clear();
    return result;
  };
}

export function normalizeHook(raw) {
  if (typeof raw.session_id !== 'string') return [];
  const source = `codex-hook-${opaque(raw.session_id)}`;
  const mapping = { SessionStart: 'session_start', UserPromptSubmit: 'turn_start', PreToolUse: 'tool_start', PostToolUse: 'tool_end', SubagentStart: 'subagent_start', SubagentStop: 'subagent_end', Stop: 'turn_end', Interrupt: 'turn_end', SessionEnd: 'disconnect' };
  const kind = mapping[raw.hook_event_name];
  if (!kind) return [];
  const event = { source, kind };
  if (kind.startsWith('tool_') || kind.startsWith('subagent_')) {
    const rawId = raw.tool_use_id ?? raw.agent_id;
    if (typeof rawId !== 'string') return [];
    event.id = opaque(rawId);
  }
  return [event];
}
