import { LIMITS } from './state.js';

/** Logarithmic frequency spacing makes equal brightness steps useful to hear. */
export function brightnessToCutoff(brightness) {
  const [min, max] = LIMITS.cutoffHz;
  const amount = Math.max(0, Math.min(1, brightness));
  return Math.round(min * (max / min) ** amount);
}

/** Only continuous timbre changes; preserve the underlying musical structure. */
export function mapFeaturesToMusic(features, musicState) {
  if (!Number.isFinite(features?.brightness)) return { ...musicState };
  return { ...musicState, cutoffHz: brightnessToCutoff(features.brightness) };
}
