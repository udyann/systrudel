import test from 'node:test';
import assert from 'node:assert/strict';
// Import the pinned pattern primitives directly: the package's root also
// imports a browser-only REPL, which Node cannot load as a named ESM export.
import { note } from '@strudel/core/controls.mjs';
import { Pattern, sequence } from '@strudel/core/pattern.mjs';
import { signal } from '@strudel/core/signal.mjs';
import { createMusicState } from '../src/music/state.js';
import { MINOR_PULSE } from '../src/music/templates.js';
import { brightnessToCutoff, mapFeaturesToMusic } from '../src/music/mapping.js';
import { createMusicPattern } from '../src/music/pattern.js';
import { createStrudelPlayer } from '../src/music/strudel.js';
import { publishState } from '../src/reactivity/template-api.js';

const core = { Pattern, note, sequence, signal };

test('music controls stay within their bounds and reject non-finite values', () => {
  assert.deepEqual(createMusicState({ tempo: 900, cutoffHz: -5, volume: 1 }), {
    templateId: 'minor-pulse', tempo: 160, cutoffHz: 200, volume: 0.4,
  });
  assert.deepEqual(createMusicState({ tempo: NaN, volume: Infinity }), createMusicState());
  assert.equal(createMusicState({ volume: 0 }).volume, 0);
});

test('brightness mapping is bounded, monotonic, and logarithmic', () => {
  assert.equal(brightnessToCutoff(0), 200);
  assert.equal(brightnessToCutoff(1), 6000);
  assert.equal(brightnessToCutoff(-1), 200);
  assert.equal(brightnessToCutoff(2), 6000);
  assert.equal(brightnessToCutoff(0.5), Math.round(Math.sqrt(200 * 6000)));
  for (let index = 0; index < 100; index += 1) {
    assert.ok(brightnessToCutoff(index / 100) <= brightnessToCutoff((index + 1) / 100));
  }
});

test('image mapping changes only the filter and preserves manual state', () => {
  const manual = Object.freeze(createMusicState({ tempo: 120, cutoffHz: 850, volume: 0.1 }));
  assert.deepEqual(mapFeaturesToMusic({ brightness: 1 }, manual), { ...manual, cutoffHz: 6000 });
  assert.equal(manual.cutoffHz, 850);
  assert.deepEqual(mapFeaturesToMusic(null, manual), manual);
  assert.deepEqual(mapFeaturesToMusic({ brightness: NaN }, manual), manual);
});

test('real Strudel pattern schedules eight expected notes in a four-beat cycle', () => {
  const pattern = createMusicPattern(core, () => createMusicState());
  const events = pattern.queryArc(0, 1);
  assert.deepEqual(events.map(({ value }) => value.note), [...MINOR_PULSE.notes]);
  assert.deepEqual(events.map((event) => Number(event.whole.begin)), [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8]);
  for (const event of events) {
    assert.equal(Number(event.duration), 1 / 8);
    assert.equal(event.value.s, 'sawtooth');
    assert.equal(event.value.cutoff, 1400);
    assert.equal(event.value.gain, 0.15);
  }
});

test('control signals update existing pattern events without changing notes or timing', () => {
  let state = createMusicState();
  const pattern = createMusicPattern(core, () => state);
  const before = pattern.queryArc(0, 1);
  state = createMusicState({ cutoffHz: 6000, volume: 0 });
  const after = pattern.queryArc(0, 1);
  const structure = (events) => events.map((event) => [event.value.note, Number(event.whole.begin), Number(event.duration)]);
  assert.deepEqual(structure(after), structure(before));
  assert.ok(after.every(({ value }) => value.cutoff === 6000 && value.gain === 0));
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function testRuntime({ resume = async () => {}, initAudio = async () => {} } = {}) {
  const calls = { starts: 0, stops: 0, resets: 0, patterns: 0, registers: 0, schedulers: [] };
  const runtime = {
    ...core,
    getAudioContext: () => ({ resume, state: 'running', currentTime: 0 }),
    initAudio,
    registerSynthSounds: () => { calls.registers += 1; },
    getSuperdoughAudioController: () => ({ reset: () => { calls.resets += 1; } }),
    webaudioOutput: async () => {},
    Cyclist: class {
      constructor(options) { this.options = options; calls.schedulers.push(this); }
      async setPattern(pattern) { this.pattern = pattern; calls.patterns += 1; }
      setCps(cps) { this.cps = cps; }
      async start() { calls.starts += 1; }
      stop() { calls.stops += 1; }
    },
  };
  return { runtime, calls };
}

test('Play uses one scheduler; updates preserve the pattern; Stop silences voices', async () => {
  const { runtime, calls } = testRuntime();
  const player = createStrudelPlayer(runtime);
  assert.equal(calls.schedulers.length, 0, 'creating controls must not start audio');
  assert.equal(await player.play(), true);
  assert.equal(await player.play(), false, 'duplicate Play must not layer loops');
  const scheduler = calls.schedulers[0];
  player.update(createMusicState({ tempo: 120, cutoffHz: 2100 }));
  assert.equal(scheduler.cps, 0.5, '120 BPM / four beats / 60 seconds');
  assert.ok(scheduler.pattern.queryArc(0, 1).every(({ value }) => value.cutoff === 2100));
  player.stop();
  assert.equal(calls.resets, 1);
  assert.equal(await player.play(), true);
  assert.equal(calls.schedulers.length, 1);
  assert.equal(calls.patterns, 1);
  assert.equal(calls.registers, 1);
  player.stop();
});

test('Stop during audio initialization prevents late playback', async () => {
  const ready = deferred();
  const { runtime, calls } = testRuntime({ initAudio: () => ready.promise });
  const player = createStrudelPlayer(runtime);
  const pendingPlay = player.play();
  assert.equal(await player.play(), false);
  player.stop();
  ready.resolve();
  assert.equal(await pendingPlay, false);
  assert.equal(calls.starts, 0);
  assert.equal(await player.play(), true);
  player.stop();
});

test('reactive template controls update on one scheduler and refresh after Stop / Play', async () => {
  const { runtime, calls } = testRuntime();
  publishState({ controls: { energy: .3, density: .5 } });
  const player = createStrudelPlayer(runtime, {
    buildPattern: ({ energy, density }) => note(60).fast(Math.max(1, Math.round(density * 8))).gain(energy),
  });
  await player.play();
  const scheduler = calls.schedulers[0];
  assert.equal(scheduler.pattern.queryArc(0, 1).length, 4);
  publishState({ controls: { energy: .7, density: 1 } });
  assert.equal(scheduler.pattern.queryArc(0, 1)[0].value.gain, .3);
  assert.equal(scheduler.pattern.queryArc(1, 2).length, 8);
  assert.equal(scheduler.pattern.queryArc(1, 2)[0].value.gain, .7);
  assert.equal(calls.starts, 1);
  player.stop();
  await player.play();
  assert.equal(scheduler.pattern.queryArc(0, 1)[0].value.gain, .7);
  assert.equal(calls.schedulers.length, 1);
  assert.equal(calls.patterns, 1);
  player.stop();
});

test('failed initialization can be retried', async () => {
  let attempts = 0;
  const { runtime } = testRuntime({ initAudio: async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Audio unavailable');
  } });
  const player = createStrudelPlayer(runtime);
  await assert.rejects(player.play(), /Audio unavailable/);
  assert.equal(await player.play(), true);
  player.stop();
});

test('asset preparation gates playback and master volume preserves layer velocities', async () => {
  const ready = deferred();
  const { runtime, calls } = testRuntime();
  let controls = { energy: .1 }, preparations = 0;
  const player = createStrudelPlayer(runtime, {
    readControls: () => controls,
    buildPattern: ({ energy }) => note(60).gain(.6).velocity(energy),
    prepareAudio: async () => { preparations++; await ready.promise; }, masterGain: true,
  });
  player.update(createMusicState({ templateId: 'base-song', volume: .2 }));
  const pending = player.play();
  assert.equal(calls.starts, 0);
  player.stop(); ready.resolve();
  assert.equal(await pending, false);
  assert.equal(calls.starts, 0, 'Stop while samples load must cancel playback');
  await player.play();
  assert.equal(preparations, 1);
  const scheduler = calls.schedulers[0];
  assert.equal(scheduler.cps, .5);
  assert.equal(scheduler.pattern.queryArc(0, 1)[0].value.gain, .3);
  assert.equal(scheduler.pattern.queryArc(0, 1)[0].value.velocity, .1);
  controls = { energy: .8 };
  assert.equal(scheduler.pattern.queryArc(1, 2)[0].value.velocity, .8);
  player.update(createMusicState({ templateId: 'base-song', volume: 0 }));
  assert.equal(scheduler.pattern.queryArc(2, 3)[0].value.gain, 0);
  player.stop();
});

test('reactive factory errors stop audio and reach the UI error handler', async () => {
  const { runtime, calls } = testRuntime();
  let error;
  publishState({ controls: { density: .5 } });
  const player = createStrudelPlayer(runtime, {
    buildPattern: ({ density }) => density > 0 ? note(60) : undefined,
    onError: reported => { error = reported; },
  });
  await player.play();
  const pattern = calls.schedulers[0].pattern;
  assert.equal(pattern.queryArc(0, 1).length, 1);
  publishState({ controls: { density: 0 } });
  assert.deepEqual(pattern.queryArc(1, 2), []);
  assert.match(error.message, /return a Strudel pattern/);
  assert.equal(calls.stops, 1);
  assert.equal(calls.resets, 1);
  publishState({ controls: { density: .5 } });
  assert.equal(await player.play(), true);
  assert.equal(pattern.queryArc(0, 1).length, 1);
  player.stop();
});

test('asynchronous audio failures stop playback and report the error', async () => {
  const { runtime, calls } = testRuntime();
  const reported = deferred();
  const error = new Error('Voice failed');
  runtime.webaudioOutput = async () => { throw error; };
  const player = createStrudelPlayer(runtime, { onError: reported.resolve });
  await player.play();
  calls.schedulers[0].options.onTrigger();
  assert.equal(await reported.promise, error);
  assert.equal(calls.stops, 1);
  assert.equal(calls.resets, 1);
});
