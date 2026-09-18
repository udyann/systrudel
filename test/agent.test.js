import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentState, validateEvent, HOOK_WORK_TIMEOUT_MS } from '../server/agent-state.js';
import { agentPresentation } from '../src/reactivity/agent-view.js';
import { createCodexAdapter, normalizeHook } from '../server/codex-events.js';

test('agent source expiry clears stuck tools, thinking and subagents', () => {
  const state = createAgentState();
  for (const kind of ['tool_start', 'thinking_start', 'subagent_start']) state.ingest({ source: 'test', kind, id: 'item' }, 0);
  state.ingest({ source: 'test', kind: 'tool_start', id: 'item' }, 1);
  const live = state.snapshot(5000);
  assert.equal(live.activeTools, 1); assert.equal(live.toolsPerSecond, .1); assert.equal(live.activeSubagents, 1); assert.equal(live.thinkingSeconds, 5);
  assert.equal(live.tokensPerSecond, null); assert.equal(live.charactersPerSecond, null);
  const expired = state.snapshot(30002);
  assert.equal(expired.connected, false); assert.equal(expired.activeTools, 0); assert.equal(expired.thinkingSeconds, null);
});
test('turn end releases activity and rolling rates expire without new events', () => {
  const state = createAgentState();
  state.ingest({ source: 'test', kind: 'output', count: 200 }, 0);
  state.ingest({ source: 'test', kind: 'tool_start', id: 'tool' }, 0);
  state.ingest({ source: 'test', kind: 'turn_end' }, 100);
  assert.equal(state.snapshot(200).charactersPerSecond, 20); assert.equal(state.snapshot(200).activeTools, 0);
  assert.equal(state.snapshot(11000).charactersPerSecond, 0);
});
test('tool accents decay on the fast timescale independently of rolling tool rate', () => {
  const state = createAgentState();
  state.ingest({ source: 'test', kind: 'tool_start', id: 'tool' }, 0);
  assert.equal(state.snapshot(0).toolPulse, 1);
  assert.ok(state.snapshot(1000).toolPulse < .02);
  assert.equal(state.snapshot(1000).toolsPerSecond, .1);
});
test('ingestion rejects arbitrary content and unbounded counter data', () => {
  assert.throws(() => validateEvent({ source: 'x', kind: 'output', count: -1 }));
  assert.throws(() => validateEvent({ source: 'x', kind: 'output', count: 10, text: 'secret' }));
  assert.throws(() => validateEvent({ source: 'x', kind: 'tool_start' }));
  assert.throws(() => validateEvent({ source: 'x', kind: 'output', count: Infinity }));
});
test('Codex CLI cumulative messages count only additions; only reported tokens are counted', () => {
  const adapter = createCodexAdapter('test');
  assert.deepEqual(adapter({ type: 'turn.started' }), [{ source: 'test', kind: 'turn_start' }]);
  assert.equal(adapter({ type: 'item.updated', item: { id: '1', type: 'agent_message', text: 'hello' } })[0].count, 5);
  assert.equal(adapter({ type: 'item.completed', item: { id: '1', type: 'agent_message', text: 'hello world' } })[0].count, 6);
  assert.deepEqual(adapter({ type: 'turn.completed', usage: { output_tokens: 7 } }), [{ source: 'test', kind: 'tokens', count: 7 }, { source: 'test', kind: 'turn_end' }]);
});
test('app-server deltas are not counted twice at message completion', () => {
  const adapter = createCodexAdapter('test');
  const event = adapter({ method: 'item/agentMessage/delta', params: { threadId: 'a', itemId: '1', delta: 'secret phrase' } });
  assert.equal(event[0].count, 13); assert.ok(!JSON.stringify(event).includes('secret'));
  assert.deepEqual(adapter({ method: 'item/completed', params: { threadId: 'a', item: { id: '1', type: 'agentMessage', text: 'secret phrase' } } }), []);
});
test('app-server cumulative token usage skips historical baseline', () => {
  const adapter = createCodexAdapter('test');
  const message = total => ({ method: 'thread/tokenUsage/updated', params: { threadId: 'a', tokenUsage: { total: { outputTokens: total } } } });
  assert.deepEqual(adapter(message(10000)), []);
  assert.equal(adapter(message(10042))[0].count, 42);
});
test('Codex hooks discard prompts, commands and transcript paths', () => {
  const events = normalizeHook({ session_id: 'private-session', hook_event_name: 'PreToolUse', tool_use_id: 'private-tool', tool_input: { command: 'secret command' }, transcript_path: '/private/history' });
  assert.equal(events[0].kind, 'tool_start');
  assert.ok(!JSON.stringify(events).includes('private')); assert.ok(!JSON.stringify(events).includes('secret'));
  const state = createAgentState();
  state.ingest(events[0]);
  assert.equal(state.snapshot().activeTools, 1);
  assert.equal(state.snapshot().thinkingSeconds, null);
});

test('IDE hooks keep quiet open turns working beyond the former 30-second cutoff', () => {
  const state = createAgentState(), source = 'codex-hook-test';
  state.ingest({ source, kind: 'turn_start' }, 0);
  const quiet = state.snapshot(120000);
  assert.equal(quiet.status, 'working'); assert.equal(quiet.connected, true);
  assert.equal(quiet.activeTurns, 1); assert.equal(quiet.workingSeconds, 120);
  assert.equal(quiet.charactersPerSecond, null); assert.equal(quiet.thinkingSeconds, null);
  state.ingest({ source, kind: 'turn_end' }, 120001);
  assert.equal(state.snapshot(240000).status, 'idle');
  assert.equal(state.snapshot(240000).activeTurns, 0);
});

test('missing hook completion eventually becomes unknown instead of permanent working or false idle', () => {
  const state = createAgentState(), source = 'codex-hook-test';
  state.ingest({ source, kind: 'turn_start' }, 0);
  const lost = state.snapshot(HOOK_WORK_TIMEOUT_MS + 1);
  assert.equal(lost.status, 'unknown'); assert.equal(lost.connected, false); assert.equal(lost.activeTurns, 0);
  state.ingest({ source, kind: 'turn_end' }, HOOK_WORK_TIMEOUT_MS + 2);
  assert.equal(state.snapshot(HOOK_WORK_TIMEOUT_MS + 3).status, 'idle');
});

test('a tool event can recover a turn whose initial hook was missed', () => {
  const state = createAgentState();
  state.ingest({ source: 'codex-hook-test', kind: 'tool_start', id: 'tool' }, 0);
  assert.equal(state.snapshot(60000).status, 'working');
  assert.equal(state.snapshot(60000).activeTurns, 1);
});

test('IDE presentation omits unavailable metrics and distinguishes missing events from idle', () => {
  const state = createAgentState();
  assert.equal(agentPresentation(state.snapshot()).title, 'Waiting for IDE activity');
  assert.deepEqual(agentPresentation(state.snapshot()).readings, []);
  state.ingest({ source: 'codex-hook-test', kind: 'turn_start' }, 0);
  const view = agentPresentation(state.snapshot(60000));
  assert.equal(view.title, 'Working');
  assert.ok(view.detail.includes('1m'));
  assert.deepEqual(view.readings.map(([name]) => name), ['Open turns', 'Running tools', 'Tool calls / 10 sec', 'Observed subagents']);
  assert.ok(!JSON.stringify(view).match(/Unavailable|tokens|reasoning|Output/));
  assert.equal(agentPresentation(state.snapshot(), false).title, 'Companion offline');
});
