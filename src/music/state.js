import { MINOR_PULSE } from './templates.js';
import { BASE_SONG } from './base-song.js';

export const LIMITS = Object.freeze({
  tempo: Object.freeze([60, 160]),
  cutoffHz: Object.freeze([200, 6000]),
  volume: Object.freeze([0, 0.4]),
});

const DEFAULTS = Object.freeze({ tempo: 96, cutoffHz: 1400, volume: 0.15 });

/** Shared, bounded state for manual controls and future generators. */
export function createMusicState(values = {}) {
  const baseSong = values.templateId === BASE_SONG.id;
  const state = { templateId: baseSong ? BASE_SONG.id : MINOR_PULSE.id };
  const defaults = baseSong ? { ...DEFAULTS, tempo: BASE_SONG.tempo, volume: .2 } : DEFAULTS;
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = Number.isFinite(values[key]) ? values[key] : defaults[key];
    state[key] = Math.max(min, Math.min(max, value));
  }
  return state;
}
