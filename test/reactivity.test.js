import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateEngine, smooth } from '../src/reactivity/engine.js';
import { profiles, mapProfile } from '../src/reactivity/profiles.js';
import { reactiveState, publishState, createControlSignals } from '../src/reactivity/template-api.js';

const start = new Date('2026-09-19T12:00:00+09:00').getTime();
function fixture(now, changes = {}) {
  return {
    system: { sampledAt: now, ioSampledAt: now, cpu: 2, gpu: 0, ram: 40, networkRx: 0, networkTx: 0, diskRead: 0, diskWrite: 0, ...changes },
    context: { energy: .5, drive: .5, focus: .5 },
    human: { scope: 'windows', keysPerSecond: 0, clicksPerSecond: 0, scrollPerSecond: 0 },
    agent: { connected: false },
  };
}
function replay(changes, mutate = () => {}) {
  const engine = createStateEngine(); let state;
  for (let t = 0; t <= 90000; t += 250) { const input = fixture(start + t, changes); mutate(input); state = engine.update(input, start + t); }
  return state;
}

test('exponential smoothing is independent of update cadence', () => {
  let frequent = 0, sparse = 0;
  for (let i = 0; i < 40; i++) frequent = smooth(frequent, 1, 250, 4000);
  for (let i = 0; i < 10; i++) sparse = smooth(sparse, 1, 1000, 4000);
  assert.ok(Math.abs(frequent - sparse) < 1e-12);
});
test('sustained real-world workload fixtures become distinct states', () => {
  const idle = replay({}), compile = replay({ cpu: 95, diskWrite: 1e6 }), gpu = replay({ gpu: 98, cpu: 20 }), transfer = replay({ networkRx: 25e6 }), disk = replay({ diskWrite: 250e6 });
  assert.equal(idle.workload, 'idle'); assert.equal(compile.workload, 'compute-heavy'); assert.equal(gpu.workload, 'GPU-heavy'); assert.equal(transfer.workload, 'network-heavy'); assert.equal(disk.workload, 'disk-heavy');
  assert.ok(compile.derived.compute_intensity > idle.derived.compute_intensity + .4);
  assert.ok(transfer.derived.density > compile.derived.density + .1);
  assert.ok(gpu.derived.tension > idle.derived.tension);
});
test('short spikes cannot switch the slow workload category', () => {
  const engine = createStateEngine(); let state;
  for (let t = 0; t <= 45000; t += 250) state = engine.update(fixture(start + t, { cpu: t > 44000 ? 100 : 2 }), start + t);
  assert.equal(state.workload, 'idle');
});
test('disconnected metrics are unavailable and energy decays safely', () => {
  const engine = createStateEngine();
  engine.update(fixture(start, { cpu: 100, gpu: 100 }), start);
  const state = engine.update(fixture(start, { cpu: 100 }), start + 31000);
  assert.equal(state.workload, 'unavailable'); assert.equal(state.availability.system, false); assert.equal(state.availability.io, false);
  for (const value of Object.values(state.derived)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
});
test('missing optional context remains marked missing', () => {
  const state = createStateEngine().update({}, start);
  assert.equal(state.availability.visual, false); assert.equal(state.availability.weather, false); assert.equal(state.availability.agent, false);
  assert.equal(state.derived.human_agent_balance, .5);
});
test('human and agent performers have independent dominance', () => {
  const human = replay({}, input => { input.human.keysPerSecond = 8; });
  const agent = replay({}, input => { input.agent = { connected: true, charactersPerSecond: 100 }; });
  const both = replay({}, input => { input.human.keysPerSecond = 8; input.agent = { connected: true, charactersPerSecond: 100 }; });
  assert.equal(human.interaction, 'human-leading'); assert.equal(agent.interaction, 'agent-leading'); assert.equal(both.interaction, 'interaction peak');
  assert.ok(human.derived.human_agent_balance < .1); assert.ok(agent.derived.human_agent_balance > .9);
  assert.ok(both.derived.density > human.derived.density);
});
test('IDE turn lifecycle alone supports activity without inventing token or reasoning data', () => {
  const state = replay({}, input => { input.agent = { connected: true, activeTurns: 1, charactersPerSecond: null, tokensPerSecond: null, thinking: false, thinkingSeconds: null }; });
  assert.equal(state.interaction, 'agent-leading');
  assert.ok(state.performers.agent > .2 && state.performers.agent <= .25);
});

test('typing builds at the existing pace and lingers through a pause before settling', () => {
  const engine = createStateEngine();
  engine.update(fixture(start), start);
  let state;
  for (let t = 250; t <= 4000; t += 250) {
    const input = fixture(start + t); input.human.keysPerSecond = 4;
    state = engine.update(input, start + t);
  }
  const peak = state.performers.human, density = state.controls.density;
  assert.ok(peak > .6 && peak < .7, 'typing must still rise within a few seconds');
  for (let t = 4250; t <= 10000; t += 250) state = engine.update(fixture(start + t), start + t);
  assert.ok(state.performers.human > peak * .55, 'a six-second pause should retain most of the activity');
  assert.ok(state.performers.human < peak * .7, 'activity should still fade during a pause');
  assert.ok(state.controls.density > density * .55);
  for (let t = 10250; t <= 64000; t += 250) state = engine.update(fixture(start + t), start + t);
  assert.ok(state.performers.human < .01, 'idle activity must eventually settle');
});

test('an open agent turn adds one 0.2 bonus and closing or losing the feed removes it', () => {
  const engine = createStateEngine();
  const input = fixture(start);
  input.agent = { connected: true, activeTurns: 0, charactersPerSecond: 100 };
  const baseline = engine.update(input, start);
  // The same timestamp holds smoothed inputs fixed to isolate lifecycle changes.
  input.agent.activeTurns = 1;
  const open = engine.update(input, start);
  for (const key of ['energy', 'density']) assert.ok(Math.abs(open.controls[key] - baseline.controls[key] - .2) < 1e-12);
  input.agent.activeTurns = 3;
  assert.deepEqual(engine.update(input, start).controls, open.controls);
  input.agent.activeTurns = 0;
  assert.deepEqual(engine.update(input, start).controls, baseline.controls);
  input.agent = { connected: false, activeTurns: 1 };
  assert.deepEqual(engine.update(input, start).controls, baseline.controls);
});

test('the open-turn bonus cannot push busy musical controls above one', () => {
  const state = replay({ cpu: 100, gpu: 100, ram: 100, networkRx: 100e6, diskWrite: 300e6 }, input => {
    input.context = { energy: 1, drive: 1, focus: .5 };
    input.human.keysPerSecond = 4;
    input.agent = { connected: true, activeTurns: 2, charactersPerSecond: 100 };
  });
  assert.equal(state.controls.energy, 1);
  assert.equal(state.controls.density, 1);
});
test('slow context does not jump when light or user energy changes', () => {
  const engine = createStateEngine();
  const first = engine.update({ context: { visualBrightness: 0, energy: 0, drive: 0 } }, start);
  const second = engine.update({ context: { visualBrightness: 1, energy: 1, drive: 1 } }, start + 250);
  assert.ok(Math.abs(first.derived.ambient_brightness - second.derived.ambient_brightness) < .01);
  assert.ok(Math.abs(first.derived.energy - second.derived.energy) < .01);
});
test('all profile properties consume derived controls and template signals read the latest state', () => {
  const state = replay({ cpu: 85 });
  for (const profile of profiles) for (const value of Object.values(mapProfile(profile, state))) assert.ok(value >= 0 && value <= 1);
  const signals = createControlSignals(fn => fn);
  let calls = 0; const stop = reactiveState.subscribe(() => calls++);
  publishState(state); assert.equal(signals.energy(), state.derived.energy); assert.equal(calls, 1);
  stop(); publishState({ ...state, derived: { ...state.derived, energy: .1 } }); assert.equal(calls, 1); assert.equal(signals.energy(), .1);
});
