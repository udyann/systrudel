import test from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { readFile } from 'node:fs/promises';
import { BASE_SONG, createBaseSong } from '../src/music/base-song.js';
import { createReactivePattern } from '../src/music/reactive-pattern.js';
import { createMusicState } from '../src/music/state.js';
import { DRUM_BASE, DRUM_SAMPLES, prepareBaseSongAudio } from '../src/music/base-song-audio.js';
import { resolve } from '../scripts/test-support/strudel-loader.js';

// Pattern/registration tests only; no browser or audio rendering is simulated.
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, dispatchEvent() {} };
const bundle = new URL('../node_modules/@strudel/web/dist/index.mjs', import.meta.url).href;
// Match Vite's aliases so the soundfont package shares the actual web runtime.
if (nodeModule.registerHooks) nodeModule.registerHooks({ resolve });
else nodeModule.register('../scripts/test-support/strudel-loader.js', import.meta.url);
const runtime = await import(bundle);
const frames = controls => createBaseSong(runtime, controls).queryArc(0, 16);
const shape = events => events.map(h => [Number(h.whole.begin), Number(h.whole.end), h.value]);

test('base song preserves its tempo, four parts, instruments and draft levels', () => {
  assert.equal(createMusicState({ templateId: BASE_SONG.id }).tempo, 120);
  const events = frames(BASE_SONG.controls);
  assert.deepEqual(new Set(events.map(h => h.value.s)), new Set(['bd', 'sd', 'rd', 'gm_synth_bass_2', 'gm_epiano2', 'gm_trombone']));
  const drum = events.find(h => h.value.s === 'rd').value;
  assert.equal(drum.bank, 'sr16');
  assert.equal(drum.velocity, .345);
  assert.equal(drum.cutoff, 1620);
  const bass = events.find(h => h.value.s === 'gm_synth_bass_2').value;
  assert.equal(bass.distort, 1.08);
  assert.equal(bass.cutoff, 500);
  assert.equal(bass.velocity, .4);
  assert.equal(bass.gain, .8);
  const melody = events.find(h => h.value.s === 'gm_epiano2').value;
  assert.equal(melody.room, .25);
  assert.equal(melody.cutoff, 1730);
  assert.ok(Math.abs(melody.velocity - .29) < 1e-12);
  const agent = events.find(h => h.value.s === 'gm_trombone').value;
  assert.equal(agent.room, .7);
  assert.ok(Math.abs(agent.release - 6.312) < 1e-12);
});

test('the integrated song matches the supplied REPL draft at fixed values', async () => {
  const source = await readFile(new URL('../templates/base-song.strudel', import.meta.url), 'utf8');
  const { output } = runtime.transpiler(source);
  const parts = [], original = runtime.Pattern.prototype.p;
  const scope = { sound: runtime.sound, n: runtime.n, seq: runtime.seq, chooseCycles: runtime.chooseCycles,
    wchooseCycles: runtime.wchooseCycles, m: runtime.m, setcpm: cpm => assert.equal(cpm, 30) };
  try {
    // Collect the four $: statements without creating an audio scheduler.
    runtime.Pattern.prototype.p = function () { parts.push(this); return this; };
    new Function(...Object.keys(scope), output)(...Object.values(scope));
  } finally { runtime.Pattern.prototype.p = original; }
  assert.equal(parts.length, 4);
  assert.deepEqual(shape(runtime.stack(...parts).queryArc(0, 16)), shape(frames(BASE_SONG.controls)));
});

test('intensity and ambience remain unused while energy, density and tension shape the song', () => {
  const defaults = frames(BASE_SONG.controls);
  assert.deepEqual(shape(frames({ ...BASE_SONG.controls, intensity: 1, ambience: 1 })), shape(defaults));
  const quiet = frames({ ...BASE_SONG.controls, energy: 0, density: 0, tension: 0 });
  const busy = frames({ ...BASE_SONG.controls, energy: 1, density: 1, tension: 1 });
  const bassCount = haps => haps.filter(h => h.value.s === 'gm_synth_bass_2').length;
  assert.ok(bassCount(busy) > bassCount(quiet));
  assert.equal(quiet.find(h => h.value.s === 'rd').value.cutoff, 800);
  assert.equal(busy.find(h => h.value.s === 'rd').value.cutoff, 9000);
  assert.equal(busy.find(h => h.value.s === 'gm_synth_bass_2').value.distort, 1.2);
});

test('balance crossfades only melody gains, preserving both motifs and the bass trim', () => {
  const withoutGain = events => shape(events.map(event => {
    const { gain, ...value } = event.value;
    return { ...event, value };
  }));
  const originalStructure = withoutGain(frames(BASE_SONG.controls));
  for (const [balance, pianoGain, agentGain] of [[0, 1, 0], [.25, .75, .125], [.5, .5, .25], [1, 0, .5]]) {
    const events = frames({ ...BASE_SONG.controls, balance });
    assert.deepEqual(withoutGain(events), originalStructure);
    for (const { value } of events) {
      if (value.s === 'gm_epiano2') assert.equal(value.gain, pianoGain);
      else if (value.s === 'gm_trombone') assert.equal(value.gain, agentGain);
      else if (value.s === 'gm_synth_bass_2') assert.equal(value.gain, .8);
      else assert.equal(value.gain, undefined);
    }
  }
});

test('reactive base song retains phrase position across updates', () => {
  let controls = BASE_SONG.controls;
  const { pattern } = createReactivePattern(runtime, values => createBaseSong(runtime, values), { readControls: () => controls });
  assert.deepEqual(shape(pattern.queryArc(0, 1)), shape(createBaseSong(runtime, controls).queryArc(0, 1)));
  controls = { ...controls, energy: 1, density: .9, balance: 1 };
  assert.deepEqual(shape(pattern.queryArc(3, 4)), shape(createBaseSong(runtime, controls).queryArc(3, 4)));
  const next = pattern.queryArc(3, 4);
  assert.equal(next.find(h => h.value.s === 'gm_epiano2').value.gain, 0);
  assert.equal(next.find(h => h.value.s === 'gm_trombone').value.gain, .5);
});

test('GM registration writes into the same sound registry as the player', async () => {
  const { registerSoundfonts } = await import('@strudel/soundfonts/fontloader.mjs');
  registerSoundfonts();
  assert.equal(runtime.getSound('gm_synth_bass_2').data.fonts[0], '0390_Aspirin_sf2_file');
  assert.equal(runtime.getSound('gm_epiano2').data.fonts[0], '0050_JCLive_sf2_file');
  assert.equal(runtime.getSound('gm_trombone').data.fonts[0], '0570_Aspirin_sf2_file');
});

test('audio preparation preloads the required assets once and reports worklet failure', async () => {
  const calls = { fonts: 0, drums: [], pitches: [], worklets: 0 };
  const fake = {
    samples: async (map, base) => { assert.deepEqual(map, DRUM_SAMPLES); assert.equal(base, DRUM_BASE); },
    getAudioContext: () => ({}), getSound: s => ({ data: { fonts: [s] } }),
    loadWorklets: async () => { calls.worklets++; },
    loadBuffer: async url => { calls.drums.push(url); },
  };
  const fonts = async () => ({ registerSoundfonts: () => { calls.fonts++; }, getFontPitch: async (font, note) => { calls.pitches.push([font, note]); } });
  await Promise.all([prepareBaseSongAudio(fake, fonts), prepareBaseSongAudio(fake, fonts)]);
  assert.equal(calls.fonts, 1); assert.equal(calls.worklets, 1); assert.equal(calls.drums.length, 3);
  assert.ok(calls.pitches.some(([font, note]) => font === 'gm_epiano2' && note === 74));
  assert.ok(calls.pitches.some(([font, note]) => font === 'gm_trombone' && note === 62));
  const broken = { ...fake, loadWorklets: async () => { throw new Error('Worklets unavailable'); } };
  await assert.rejects(prepareBaseSongAudio(broken, fonts), /Worklets unavailable/);
});
