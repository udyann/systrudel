export const DRUM_BASE = 'https://strudel.b-cdn.net/tidal-drum-machines/machines/';
export const DRUM_SAMPLES = Object.freeze({
  sr16_bd: 'AlesisSR16/alesissr16-bd/Bassdrum-01.wav',
  sr16_sd: 'AlesisSR16/alesissr16-sd/Snaredrum-01.wav',
  sr16_rd: 'AlesisSR16/alesissr16-rd/Ride-01.wav',
});

// These cover the draft's notes and occasional transpositions, using GM variant 0.
const pitches = {
  gm_synth_bass_2: [37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
  gm_epiano2: [62, 64, 65, 67, 69, 70, 72, 74, 76],
  gm_trombone: [62, 64, 65, 67, 69, 70, 72, 74],
};

const prepared = new WeakMap();
export function prepareBaseSongAudio(runtime, loadFonts = () => import('@strudel/soundfonts/fontloader.mjs')) {
  if (!prepared.has(runtime)) {
    const ready = loadBaseSongAudio(runtime, loadFonts).catch(error => { prepared.delete(runtime); throw error; });
    prepared.set(runtime, ready);
  }
  return prepared.get(runtime);
}

async function loadBaseSongAudio(runtime, loadFonts) {
  const fonts = await loadFonts();
  fonts.registerSoundfonts();
  await runtime.samples(DRUM_SAMPLES, DRUM_BASE);
  const context = runtime.getAudioContext();
  await Promise.all([
    // initAudio swallows worklet failures; await loadWorklets directly to surface them.
    runtime.loadWorklets(),
    ...Object.entries(DRUM_SAMPLES).map(([sound, path]) => runtime.loadBuffer(DRUM_BASE + path, context, sound)),
    ...Object.entries(pitches).flatMap(([sound, notes]) => {
      const font = runtime.getSound(sound)?.data.fonts?.[0];
      if (!font) throw new Error(`Missing soundfont: ${sound}`);
      return notes.map(note => fonts.getFontPitch(font, note, context));
    }),
  ]);
}
