// One starting structure for now. Image mappings never change its notes.
export const MINOR_PULSE = Object.freeze({
  id: 'minor-pulse',
  name: 'Minor pulse',
  key: 'C minor',
  beatsPerCycle: 4,
  notes: Object.freeze([60, 63, 67, 70, 67, 63, 62, 63]),
  sound: 'sawtooth',
  attack: 0.015,
  decay: 0.12,
  sustain: 0.25,
  release: 0.1,
});
