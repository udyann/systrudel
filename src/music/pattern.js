import { MINOR_PULSE } from './templates.js';

/**
 * Build once. Signals read the latest controls as notes are scheduled, without
 * compiling source code, replacing the pattern, or restarting the phrase.
 * The API argument keeps this testable with Strudel's actual pattern engine.
 */
export function createMusicPattern({ note, sequence, signal }, readState) {
  const template = MINOR_PULSE;
  return note(sequence(...template.notes))
    .sound(template.sound)
    .attack(template.attack)
    .decay(template.decay)
    .sustain(template.sustain)
    .release(template.release)
    .lpf(signal(() => readState().cutoffHz))
    .gain(signal(() => readState().volume));
}
