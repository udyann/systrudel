/** Time-based exponential smoothing; only used for a live source. */
export function smoothFeatures(previous, current, elapsedMs, timeConstantMs = 250) {
  if (!previous) return { ...current, rgb: { ...current.rgb } };
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / timeConstantMs);
  const blend = (before, after) => before + alpha * (after - before);
  return {
    brightness: blend(previous.brightness, current.brightness),
    rgb: {
      r: blend(previous.rgb.r, current.rgb.r),
      g: blend(previous.rgb.g, current.rgb.g),
      b: blend(previous.rgb.b, current.rgb.b),
    },
  };
}
