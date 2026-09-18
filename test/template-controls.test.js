import test from 'node:test';
import assert from 'node:assert/strict';
import { Pattern, sequence } from '@strudel/core/pattern.mjs';
import { note } from '@strudel/core/controls.mjs';
import { signal } from '@strudel/core/signal.mjs';
import State from '@strudel/core/state.mjs';
import TimeSpan from '@strudel/core/timespan.mjs';
import { CONTROL_DEFAULTS, CONTROL_NAMES, normalizeControls } from '../src/reactivity/controls.js';
import { createStateEngine } from '../src/reactivity/engine.js';
import { reactiveState, publishState, createControlSignals } from '../src/reactivity/template-api.js';
import { createReactivePattern } from '../src/music/reactive-pattern.js';

test('templates start with the six agreed names and draft values', () => {
  assert.equal(reactiveState.getSnapshot(), null);
  assert.deepEqual(reactiveState.getControls(), {
    energy: .3, density: .5, tension: .5, balance: .5, intensity: .2, ambience: .4,
  });
  assert.deepEqual(Object.keys(createControlSignals(signal)), CONTROL_NAMES);
});

test('numeric controls are finite, bounded and read-only, preserving real zeroes', () => {
  const controls = normalizeControls({ energy: 2, density: -1, tension: NaN, balance: Infinity, intensity: 0, ambience: '0.8', extra: 1 });
  assert.deepEqual(controls, { energy: 1, density: 0, tension: .5, balance: .5, intensity: 0, ambience: .4 });
  assert.throws(() => { controls.energy = .2; }, TypeError);
  assert.deepEqual(normalizeControls(null), CONTROL_DEFAULTS);
});

test('engine, subscribers and live Strudel signals share the same six controls', () => {
  const engine = createStateEngine();
  const first = engine.update({}, 1000);
  assert.deepEqual(first.controls, {
    energy: first.derived.energy, density: first.derived.density, tension: first.derived.tension,
    balance: first.derived.human_agent_balance, intensity: first.derived.compute_intensity, ambience: first.derived.ambient_brightness,
  });
  let received;
  const unsubscribe = reactiveState.subscribe(state => { received = state.controls; });
  const signals = createControlSignals(signal);
  const patterns = Object.fromEntries(CONTROL_NAMES.map(key => [key, note(60).gain(signals[key])]));
  publishState(first);
  for (const key of CONTROL_NAMES) assert.equal(patterns[key].queryArc(0, 1)[0].value.gain, received[key]);
  const updated = { energy: .9, density: .8, tension: .7, balance: 1, intensity: .6, ambience: 0 };
  publishState({ controls: updated });
  updated.energy = 0; // A publisher cannot mutate the numbers after publication.
  assert.equal(received.energy, .9);
  assert.equal(reactiveState.getControls(), received);
  for (const key of CONTROL_NAMES) assert.equal(patterns[key].queryArc(1, 2)[0].value.gain, received[key]);
  unsubscribe();
});

test('ordinary numeric arithmetic reacts next cycle and partial queries stay consistent', () => {
  let controls = { ...CONTROL_DEFAULTS }, builds = 0;
  const { pattern } = createReactivePattern({ Pattern }, values => {
    builds++;
    assert.ok(Object.values(values).every(value => typeof value === 'number'));
    return note(60).fast(Math.max(1, Math.round(values.density * 8))).gain(values.energy);
  }, { readControls: () => controls });
  assert.equal(pattern.queryArc(0, 1).length, 4);
  controls = { ...controls, density: 1, energy: .9 };
  assert.equal(pattern.queryArc(.25, .75).length, 2);
  assert.ok(pattern.queryArc(.25, .75).every(event => event.value.gain === .3));
  assert.equal(builds, 1);
  const next = pattern.queryArc(1, 2);
  assert.equal(next.length, 8);
  assert.ok(next.every(event => event.value.gain === .9));
  assert.equal(builds, 2);
  assert.deepEqual(pattern.queryArc(.75, 1.25).map(event => event.value.gain), [.3, .9, .9]);
});

test('live snapshots preserve multi-cycle phrase position and can update every four cycles', () => {
  let energy = .2, builds = 0;
  const { pattern, reset } = createReactivePattern({ Pattern }, values => {
    builds++;
    return note(sequence(60, 64)).slow(2).gain(values.energy);
  }, { readControls: () => ({ energy }), updateEveryCycles: 4 });
  assert.equal(pattern.queryArc(0, 1)[0].value.note, 60);
  energy = .8;
  assert.equal(pattern.queryArc(1, 2)[0].value.note, 64);
  assert.equal(pattern.queryArc(3, 4)[0].value.gain, .2);
  assert.equal(builds, 1);
  assert.equal(pattern.queryArc(4, 5)[0].value.gain, .8);
  assert.equal(builds, 2);
  reset();
  assert.equal(pattern.queryArc(0, 1)[0].value.gain, .8);
});

test('template configuration and missing pattern returns fail clearly', () => {
  assert.throws(() => createReactivePattern({ Pattern }, null), /buildPattern/);
  for (const updateEveryCycles of [0, -1, 1.5, Infinity]) {
    assert.throws(() => createReactivePattern({ Pattern }, () => note(60), { updateEveryCycles }), /positive integer/);
  }
  const { pattern } = createReactivePattern({ Pattern }, () => undefined);
  assert.throws(() => pattern.query(new State(new TimeSpan(0, 1))), /return a Strudel pattern/);
});
